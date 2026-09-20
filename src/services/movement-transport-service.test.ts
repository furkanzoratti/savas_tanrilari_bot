import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { fleetCargoSnapshot, movementTransportService } from "./movement-transport-service.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));
vi.mock("../db/pool.js", () => ({ pool: {}, withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!) }));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));

describe("fleet cargo snapshot", () => {
  it("counts a transported army and its siege assets against real ship capacity", async () => {
    const client = { async query(sql: string) {
      if (sql.includes("FROM fleet_ships")) return { rows: [{ ship_type: "trireme", quantity: 2 }] };
      if (sql.includes("FROM fleets fleet JOIN countries")) return { rows: [{ active_formable_key: null }] };
      if (sql.includes("FROM fleet_cargo_armies")) return { rows: [{ army_id: "army-1" }] };
      if (sql.includes("FROM army_units")) return { rows: [{ soldiers: 500 }] };
      if (sql.includes("FROM army_siege_assets")) return { rows: [{ asset_type: "catapult", quantity: 1 }] };
      throw new Error(`Unexpected query: ${sql}`);
    } } as unknown as DbClient;
    expect(await fleetCargoSnapshot(client,"fleet-1")).toMatchObject({
      soldiers: 1000, siegeLoads: 4, occupiedSoldiers: 500, occupiedSiegeLoads: 1, valid: true
    });
  });
});

describe("yönetici kıyı çıkarması",()=>{
  function fixture(enemy=false){
    const writes:string[]=[];
    transaction.client={query:async(sql:string)=>{
      if(sql.includes("pg_advisory_xact_lock"))return {rows:[],rowCount:1};
      if(sql.includes("SELECT current_turn,turn_phase FROM guilds"))return {rows:[{current_turn:9,turn_phase:"OPEN"}],rowCount:1};
      if(sql.includes("SELECT cargo.fleet_id,cargo.embarked_turn"))return {rows:[{fleet_id:"fleet-1",embarked_turn:8}],rowCount:1};
      if(sql.includes("SELECT unit.id,unit.name,unit.country_id"))return {rows:[{
        id:"fleet-1",name:"Filo",country_id:"country-1",hex_id:"sea-1",coordinate:"AA10",domain:"SEA",owner_country_id:null
      }],rowCount:1};
      if(sql.includes("FROM movement_orders")||sql.includes("FROM movement_encounters"))return {rows:[],rowCount:0};
      if(sql.includes("SELECT id,coordinate,domain,passable,owner_country_id FROM map_hexes"))return {rows:[{
        id:"land-1",coordinate:"AB10",domain:"LAND",passable:true,owner_country_id:"country-2"
      }],rowCount:1};
      if(sql.includes("FROM army_map_positions position JOIN armies army"))return {rows:[],rowCount:enemy?1:0};
      if(sql.includes("DELETE FROM fleet_cargo_armies")){writes.push("unload");return {rows:[],rowCount:1};}
      if(sql.includes("INSERT INTO army_map_positions")){writes.push("land");return {rows:[],rowCount:1};}
      if(sql.includes("INSERT INTO audit_logs"))return {rows:[],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    return writes;
  }

  it("yabancı kıyıya yalnız gerekçeli GM çıkarmasına izin verir",async()=>{
    const writes=fixture();
    const common={guildId:"guild",countryId:"country-1",actorId:"gm",armyId:"army-1",coordinate:"AB10"};
    await expect(movementTransportService.disembark(common)).rejects.toThrow("yönetici gerekçesi");
    await movementTransportService.disembark({...common,adminReason:"GM çıkarma kararı"});
    expect(writes).toEqual(["unload","land"]);
  });

  it("düşman ordusu bulunan kıyıya sessizce birlik bindirmez",async()=>{
    const writes=fixture(true);
    await expect(movementTransportService.disembark({guildId:"guild",countryId:"country-1",actorId:"gm",
      armyId:"army-1",coordinate:"AB10",adminReason:"GM çıkarma kararı"})).rejects.toThrow("düşman ordusu");
    expect(writes).toEqual([]);
  });
});
