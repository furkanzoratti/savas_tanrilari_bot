import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { resolveMovementStage } from "./movement-turn-service.js";

vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));
vi.mock("../db/pool.js", () => ({ pool: {}, withTransaction: vi.fn() }));

function fakeClient(foreignSecondStep = false) {
  let runSummary: Record<string, unknown> = {};
  const writes: string[] = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes("SELECT enabled,map_revision FROM guild_movement_settings")) return { rows: [{ enabled: true, map_revision: 1 }], rowCount: 1 };
      if (sql.includes("INSERT INTO movement_resolution_runs")) return { rows: [], rowCount: 1 };
      if (sql.includes("SELECT summary FROM movement_resolution_runs")) return { rows: [{ summary: runSummary }], rowCount: 1 };
      if (sql.includes("WITH region_owners")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM movement_orders movement") && sql.includes("ORDER BY movement.created_at,movement.id FOR UPDATE")) return { rows: [{
        id: "order-1", country_id: "country-1", formation_kind: "ARMY", army_id: "army-1", fleet_id: null,
        status: "SUBMITTED", issued_turn: 8, current_step: 0, last_processed_turn: null,
        start_hex_id: "hex-a", effective_allowance: foreignSecondStep ? 2 : 1,
        metadata: { mapRevision: 1 }
      }], rowCount: 1 };
      if (sql.includes("SELECT 'ARMY'::text AS formation_kind")) return { rows: [{
        formation_kind: "ARMY", formation_id: "army-1", country_id: "country-1", hex_id: "hex-a"
      }], rowCount: 1 };
      if (sql.includes("FROM movement_order_steps step JOIN map_hexes target")) return { rows: [
        { step_index: 1, from_hex_id: "hex-a", to_hex_id: "hex-b", movement_cost: 1,
          domain: "LAND", passable: true, owner_country_id: "country-1" },
        { step_index: 2, from_hex_id: "hex-b", to_hex_id: "hex-c", movement_cost: 1,
          domain: "LAND", passable: true, owner_country_id: foreignSecondStep ? "country-2" : "country-1" }
      ], rowCount: 2 };
      if (sql.includes("FROM army_muster_orders WHERE guild_id=$1")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO movement_encounters")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM map_hexes WHERE guild_id=$1")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT id,coordinate FROM map_hexes WHERE id=ANY"))
        return { rows:(params[0] as string[]).map((id)=>({id,coordinate:id.toUpperCase()})),rowCount:2 };
      if (sql.includes("FROM regional_observer_posts post") || sql.includes("FROM army_scout_detachments scout")) return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE movement_resolution_runs")) {
        runSummary = JSON.parse(params[5] as string) as Record<string, unknown>;
        writes.push("run");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("UPDATE army_map_positions")) { writes.push("position"); return { rows: [], rowCount: 1 }; }
      if (sql.includes("UPDATE movement_order_steps")) { writes.push("step"); return { rows: [], rowCount: 1 }; }
      if (sql.includes("UPDATE movement_orders")) { writes.push(`order:${params[1]}`); return { rows: [], rowCount: 1 }; }
      if (sql.includes("INSERT INTO audit_logs")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    }
  } as unknown as DbClient;
  return { client, writes };
}

describe("movement stage transaction", () => {
  it("moves one safe step and never moves again on a repeated stop", async () => {
    const { client, writes } = fakeClient();
    const first = await resolveMovementStage(client, "guild-1", "gm-1", 8, "STOP");
    expect(first).toMatchObject({ processed: 1, advanced: 1, ongoing: 1, blocked: 0 });
    const second = await resolveMovementStage(client, "guild-1", "gm-1", 8, "STOP");
    expect(second.alreadyProcessed).toBe(true);
    expect(writes.filter((value) => value === "position")).toHaveLength(1);
  });

  it("stops before entering another state's land", async () => {
    const { client, writes } = fakeClient(true);
    const result = await resolveMovementStage(client, "guild-1", "gm-1", 8, "STOP");
    expect(result).toMatchObject({ advanced: 1, blocked: 1, completed: 0 });
    expect(writes).toContain("order:BLOCKED");
  });

  it("iki rakip ordu aynı Hex'e yürüdüğünde tek karşılaşma dosyası açar",async()=>{
    let summary:Record<string,unknown>={};
    const cases:unknown[][]=[];
    const client={async query(sql:string,params:unknown[]=[]){
      if(sql.includes("SELECT enabled,map_revision FROM guild_movement_settings"))return {rows:[{enabled:true,map_revision:1}],rowCount:1};
      if(sql.includes("INSERT INTO movement_resolution_runs"))return {rows:[],rowCount:1};
      if(sql.includes("SELECT summary FROM movement_resolution_runs"))return {rows:[{summary}],rowCount:1};
      if(sql.includes("WITH region_owners"))return {rows:[],rowCount:0};
      if(sql.includes("FROM movement_orders movement")&&sql.includes("ORDER BY movement.created_at,movement.id FOR UPDATE"))
        return {rows:["a","b"].map((letter)=>({id:`order-${letter}`,country_id:`country-${letter}`,
          formation_kind:"ARMY",army_id:`army-${letter}`,fleet_id:null,status:"SUBMITTED",issued_turn:8,
          current_step:0,last_processed_turn:null,start_hex_id:`hex-${letter}`,effective_allowance:1,
          metadata:{mapRevision:1}})),rowCount:2};
      if(sql.includes("SELECT 'ARMY'::text AS formation_kind"))
        return {rows:["a","b"].map((letter)=>({formation_kind:"ARMY",formation_id:`army-${letter}`,
          country_id:`country-${letter}`,hex_id:`hex-${letter}`})),rowCount:2};
      if(sql.includes("FROM movement_order_steps step JOIN map_hexes target")){
        const letter=String(params[0]).slice(-1);
        return {rows:[{step_index:1,from_hex_id:`hex-${letter}`,to_hex_id:"hex-c",movement_cost:1,
          domain:"LAND",passable:true,owner_country_id:null}],rowCount:1};
      }
      if(sql.includes("INSERT INTO movement_encounters")){cases.push(params);return {rows:[],rowCount:1};}
      if(sql.includes("FROM army_muster_orders WHERE guild_id=$1"))return {rows:[],rowCount:0};
      if(sql.includes("SELECT id,coordinate FROM map_hexes WHERE id=ANY"))
        return {rows:(params[0] as string[]).map((id)=>({id,coordinate:id.toUpperCase()})),rowCount:2};
      if(sql.includes("UPDATE movement_resolution_runs")){summary=JSON.parse(params[5] as string) as Record<string,unknown>;return {rows:[],rowCount:1};}
      if(sql.includes("UPDATE movement_order_steps")||sql.includes("UPDATE movement_orders")||sql.includes("INSERT INTO audit_logs"))
        return {rows:[],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    const result=await resolveMovementStage(client,"guild-1","gm-1",8,"STOP");
    expect(result).toMatchObject({processed:2,blocked:2,advanced:0,encounters:1});
    expect(cases).toHaveLength(1);
    expect(cases[0]?.slice(3,7)).toEqual(["CONTACT","ARMY","order-a","order-b"]);
  });
});
