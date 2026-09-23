import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";

const transaction = vi.hoisted(() => ({ client: null as DbClient | null }));

vi.mock("../db/pool.js", () => ({
  pool: {},
  withTransaction: async (work: (client: DbClient) => Promise<unknown>) => work(transaction.client!)
}));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));

import { fleetService } from "./fleet-service.js";

function fleetClient(options: { cargo?: boolean; movementEnabled?: boolean; moving?: boolean } = {}): { client: DbClient; queries: string[] } {
  const queries: string[] = [];
  let allocation = 1;
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("SELECT id FROM fleets WHERE country_id")) return { rows: [{ id: "fleet-1" }], rowCount: 1 };
      if (sql.includes("SELECT f.id,f.guild_id")) return { rows: [{
        id: "fleet-1", guild_id: "guild-1", country_id: "country-1", country_name: "Britanya",
        name: "Royal Navy", commander_character_id: null, commander_name: null, commander_skill_bonus: 0,
        created_turn: 1, active_formable_key: "BRITANNIA", active_battle_id: null
      }], rowCount: 1 };
      if (sql.includes("FROM fleet_ships fs JOIN settlements s") && sql.includes("ORDER BY s.name")) return {
        rows: [{ settlement_id: "port-1", settlement_name: "Camulodunon", ship_type: "trireme", quantity: allocation }],
        rowCount: 1
      };
      if (sql.includes("FROM battle_fleet_assignments")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM naval_blockades") || sql.includes("FROM naval_raids")) return { rows: [], rowCount: 0 };
      if (sql.includes("COALESCE(settings.enabled,FALSE)")) return {
        rows: [{ enabled: options.movementEnabled ?? true }], rowCount: 1
      };
      if (sql.includes("FROM movement_encounters")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM movement_orders")) return { rows: options.moving ? [{}] : [], rowCount: options.moving ? 1 : 0 };
      if (sql.includes("SELECT 1 FROM fleet_cargo_armies")) return { rows: options.cargo ? [{}] : [], rowCount: options.cargo ? 1 : 0 };
      if (sql.includes("SELECT id,name FROM settlements")) return { rows: [{ id: "port-1", name: "Camulodunon" }], rowCount: 1 };
      if (sql.includes("FROM naval_units")) return { rows: [{ quantity: 3 }], rowCount: 1 };
      if (sql.includes("SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM fleet_ships")) return { rows: [{ quantity: allocation }], rowCount: 1 };
      if (sql.includes("INSERT INTO fleet_ships")) { allocation += 1; return { rows: [], rowCount: 1 }; }
      if (sql.includes("UPDATE fleets SET updated_at") || sql.includes("INSERT INTO audit_logs")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    }
  } as unknown as DbClient;
  return { client, queries };
}

describe("fleet mutations with transported armies", () => {
  beforeEach(() => { transaction.client = null; });

  it("allows adding a ship while an army is embarked", async () => {
    const mocked = fleetClient({ cargo: true });
    transaction.client = mocked.client;

    const fleet = await fleetService.addShips({
      guildId: "guild-1", countryId: "country-1", actorId: "player-1", fleet: "Royal Navy",
      settlement: "Camulodunon", shipType: "trireme", quantity: 1
    });

    expect(fleet.totalShips).toBe(2);
    expect(mocked.queries.some((sql) => sql.includes("INSERT INTO fleet_ships"))).toBe(true);
    expect(mocked.queries.some((sql) => sql.includes("SELECT 1 FROM fleet_cargo_armies"))).toBe(false);
  });

  it("still blocks removing a ship while an army is embarked", async () => {
    const mocked = fleetClient({ cargo: true });
    transaction.client = mocked.client;

    await expect(fleetService.removeShips({
      guildId: "guild-1", countryId: "country-1", actorId: "player-1", fleet: "Royal Navy",
      settlement: "Camulodunon", shipType: "trireme", quantity: 1
    })).rejects.toThrow("Asker taşıyan filodan gemi çıkarılamaz");
  });

  it("ignores stale movement orders after the movement system is disabled", async () => {
    const mocked = fleetClient({ movementEnabled: false, moving: true });
    transaction.client = mocked.client;

    await expect(fleetService.addShips({
      guildId: "guild-1", countryId: "country-1", actorId: "player-1", fleet: "Royal Navy",
      settlement: "Camulodunon", shipType: "trireme", quantity: 1
    })).resolves.toMatchObject({ totalShips: 2 });
    expect(mocked.queries.some((sql) => sql.includes("FROM movement_orders"))).toBe(false);
  });

  it("keeps active movement orders locked while the movement system is enabled", async () => {
    const mocked = fleetClient({ movementEnabled: true, moving: true });
    transaction.client = mocked.client;

    await expect(fleetService.addShips({
      guildId: "guild-1", countryId: "country-1", actorId: "player-1", fleet: "Royal Navy",
      settlement: "Camulodunon", shipType: "trireme", quantity: 1
    })).rejects.toThrow("etkin hareket emri");
  });
});

describe("fleet admiral assignments", () => {
  it("rejects a regular Commander before assigning a fleet", async () => {
    const client={
      async query(sql:string){
        if(sql.includes("FROM country_characters"))return {rows:[{id:"character-1",role:"COMMANDER",character_status:"ACTIVE",is_admiral:false}],rowCount:1};
        throw new Error(`Unexpected query: ${sql}`);
      }
    } as unknown as DbClient;

    await expect(fleetService.assignCommanderInTransaction(client,"country-1","fleet-1","character-1"))
      .rejects.toThrow("yalnızca kalıcı olarak Amirale dönüştürülmüş");
  });

  it("assigns a converted Admiral to a fleet", async () => {
    const queries:string[]=[];
    const client={
      async query(sql:string){
        queries.push(sql);
        if(sql.includes("FROM country_characters"))return {rows:[{id:"character-1",role:"COMMANDER",character_status:"ACTIVE",is_admiral:true}],rowCount:1};
        if(sql.includes("SELECT name FROM armies"))return {rows:[],rowCount:0};
        if(sql.includes("SELECT name FROM fleets"))return {rows:[],rowCount:0};
        if(sql.includes("SELECT commander_character_id FROM fleets"))return {rows:[{commander_character_id:null}],rowCount:1};
        if(sql.startsWith("UPDATE fleets")||sql.startsWith("UPDATE country_characters"))return {rows:[],rowCount:1};
        throw new Error(`Unexpected query: ${sql}`);
      }
    } as unknown as DbClient;

    await expect(fleetService.assignCommanderInTransaction(client,"country-1","fleet-1","character-1")).resolves.toBeUndefined();
    expect(queries.some((sql)=>sql.includes("UPDATE fleets SET commander_character_id"))).toBe(true);
    expect(queries.some((sql)=>sql.includes("SET assignment='FLEET'"))).toBe(true);
  });
});
