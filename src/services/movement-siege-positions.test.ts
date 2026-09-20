import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { movementService } from "./movement-service.js";

const fixture = vi.hoisted(() => ({ client: null as DbClient | null }));
vi.mock("../db/pool.js", () => ({
  pool: {},
  withTransaction: async (work: (client: DbClient) => Promise<unknown>) => work(fixture.client!)
}));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));

describe("kuşatma ordusu başlangıç konumu", () => {
  function setup(battle: { terrain: string; siege_coordinate: string | null }, alreadyPositioned = false) {
    const writes: string[] = [];
    fixture.client = { query: async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM guild_movement_settings")) return { rows: [{ guild_id: "guild", enabled: false, visibility_mode: "INTELLIGENCE", map_revision: 1, rules: {} }], rowCount: 1 };
      if (sql.includes("SELECT id,name,guild_id,country_id FROM armies")) return { rows: [{ id: "army", name: "Kuşatma Ordusu", guild_id: "guild", country_id: "country" }], rowCount: 1 };
      if (sql.includes("FROM fleet_cargo_armies")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT battle.terrain,siege_hex.coordinate")) return { rows: [battle], rowCount: 1 };
      if (sql.includes("SELECT 1 FROM army_map_positions WHERE army_id")) return { rows: [], rowCount: alreadyPositioned ? 1 : 0 };
      if (sql.includes("FROM movement_orders") || sql.includes("FROM movement_encounters") || sql.includes("FROM army_muster_orders")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM map_hexes WHERE guild_id")) return { rows: [{ id: "city-hex", coordinate: "J22", q: 1, r: 2, domain: "LAND", terrain: "PLAINS", region_key: null, owner_country_id: "defender", passable: true }], rowCount: 1 };
      if (sql.includes("SELECT hex.coordinate FROM army_map_positions")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO army_map_positions")) { writes.push("position"); return { rows: [], rowCount: 1 }; }
      if (sql.includes("INSERT INTO audit_logs")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    } } as unknown as DbClient;
    return writes;
  }

  const input = { guildId: "guild", countryId: "country", actorId: "gm", formationKind: "ARMY" as const,
    formationId: "army", coordinate: "J22", arrivedTurn: 20 };

  it("saldıran veya savunan orduyu kuşatma kentinin hexine ilk kez yerleştirir", async () => {
    const writes = setup({ terrain: "SIEGE", siege_coordinate: "J22" });
    await expect(movementService.positionFormation(input)).resolves.toMatchObject({ coordinate: "J22" });
    expect(writes).toEqual(["position"]);
  });

  it("kuşatma ordusunu başka hexe veya ikinci kez yerleştirmez", async () => {
    const writes = setup({ terrain: "SIEGE", siege_coordinate: "K22" });
    await expect(movementService.positionFormation(input)).rejects.toThrow("kuşatma kentinin");
    expect(writes).toEqual([]);
    setup({ terrain: "SIEGE", siege_coordinate: "J22" }, true);
    await expect(movementService.positionFormation(input)).rejects.toThrow("mevcut konumu");
  });

  it("normal savaştaki orduya kuşatma istisnası uygulamaz", async () => {
    setup({ terrain: "LAND", siege_coordinate: null });
    await expect(movementService.positionFormation(input)).rejects.toThrow("kuşatma kentinin");
  });
});
