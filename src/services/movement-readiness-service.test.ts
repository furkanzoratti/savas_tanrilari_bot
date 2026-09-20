import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { inspectMovementReadiness } from "./movement-readiness-service.js";

vi.mock("../db/pool.js",()=>({pool:{}}));

function fixture(input?:Partial<Record<"hexes"|"settlements_positioned"|"armies_needing_position"|"active_orders"|"invalid_positions",number>>){
  const counts={hexes:1800,land_without_owner:0,settlements:173,settlements_positioned:173,
    armies_needing_position:0,fleets_needing_position:0,invalid_positions:0,active_orders:0,active_musters:0,
    unresolved_encounters:0,sea_passages:1,...input};
  return {query:async(sql:string)=>{
    if(sql.includes("FROM guilds"))return {rows:[{current_turn:20,turn_phase:"OPEN",movement_log_channel_id:"private-channel"}]};
    if(sql.includes("FROM guild_movement_settings"))return {rows:[{enabled:false,map_revision:2}]};
    return {rows:[counts]};
  }} as unknown as DbClient;
}

describe("hareket açılış kontrolü",()=>{
  it("tam R56 ve konumlandırılmış birliklerle test açılışını hazır sayar",async()=>{
    const result=await inspectMovementReadiness(fixture(),"guild");
    expect(result.ready).toBe(true);
    expect(result.counts.settlementsPositioned).toBe(173);
  });

  it("eksik harita ve konumsuz orduları açılışta engeller",async()=>{
    const result=await inspectMovementReadiness(fixture({hexes:0,settlements_positioned:172,armies_needing_position:1}),"guild");
    expect(result.ready).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/haritası|konumu eksik/);
  });

  it("acil duraklatmadan kalan emirleri silmeden yeniden açmaya izin verir",async()=>{
    const result=await inspectMovementReadiness(fixture({active_orders:2}),"guild");
    expect(result.ready).toBe(true);
    expect(result.warnings.join(" ")).toContain("korunuyor");
  });

  it("kara ordusunun deniz Hex'ine bağlı kalmasını engeller",async()=>{
    const result=await inspectMovementReadiness(fixture({invalid_positions:1}),"guild");
    expect(result.ready).toBe(false);
    expect(result.blockers.join(" ")).toContain("geçersiz Hex");
  });

  it("hareket log kanalı ayarlanmadan sistemi açmaz",async()=>{
    const client=fixture();
    const original=client.query.bind(client);
    client.query=((sql:string,params?:unknown[])=>sql.includes("FROM guilds")
      ? Promise.resolve({rows:[{current_turn:20,turn_phase:"OPEN",movement_log_channel_id:null}]} as any)
      : original(sql,params)) as typeof client.query;
    const result=await inspectMovementReadiness(client,"guild");
    expect(result.ready).toBe(false);
    expect(result.blockers.join(" ")).toContain("log kanalı");
  });
});
