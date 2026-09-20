import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { movementEncounterService } from "./movement-encounter-service.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));
vi.mock("../db/pool.js",()=>({pool:{},withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!)}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error {}}));
vi.mock("./movement-recon-service.js",()=>({resolveMovementRecon:vi.fn().mockResolvedValue(0)}));

const encounterId="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

function fixture(kind:"LAND_ENTRY"|"CONTACT",paired:boolean,options?:{formationKind?:"ARMY"|"FLEET";occupied?:boolean;stationary?:boolean}){
  const writes:string[]=[];
  let status="PENDING";
  const row={id:encounterId,case_kind:kind,formation_kind:options?.formationKind??"ARMY",order_a_id:"order-a",
    order_b_id:paired?"order-b":null,stationary_formation_id:paired?null:options?.stationary===false?null:"army-b",
    hex_id:"hex-target",game_turn:8,status};
  const client={async query(sql:string,params:unknown[]=[]){
    if(sql.includes("pg_advisory_xact_lock"))return {rows:[],rowCount:1};
    if(sql.includes("FROM movement_encounters") && sql.includes("FOR UPDATE"))return {rows:[{...row,status}],rowCount:1};
    if(sql.includes("SELECT id,status FROM movement_orders WHERE id=$1 OR id=$2"))
      return {rows:paired?[{id:"order-a",status:"BLOCKED"},{id:"order-b",status:"BLOCKED"}]:[{id:"order-a",status:"BLOCKED"}],rowCount:paired?2:1};
    if(sql.includes("UPDATE movement_orders SET status='CANCELLED'")){writes.push(`cancel:${params[0]}`);return {rows:[],rowCount:1};}
    if(sql.includes("UPDATE movement_order_steps SET status='SKIPPED'"))return {rows:[],rowCount:1};
    if(sql.includes("SELECT current_step,metadata,effective_allowance"))
      return {rows:[{current_step:1,metadata:{},effective_allowance:2,country_id:"country-a",army_id:"army-a",issued_turn:8}],rowCount:1};
    if(sql.includes("UPDATE movement_orders SET status='IN_PROGRESS'")){writes.push("resume");return {rows:[],rowCount:1};}
    if(sql.includes("UPDATE movement_order_steps SET status='PENDING'"))return {rows:[],rowCount:1};
    if(sql.includes("SELECT current_turn FROM guilds"))return {rows:[{current_turn:8}],rowCount:1};
    if(sql.includes("SUM(movement_cost)"))return {rows:[{total:1}],rowCount:1};
    if(sql.includes("SELECT step.from_hex_id,step.to_hex_id"))
      return {rows:[{from_hex_id:"hex-source",to_hex_id:"hex-target",movement_cost:1,total_steps:3}],rowCount:1};
    if(sql.includes("SELECT domain,passable FROM map_hexes"))return {rows:[{domain:"LAND",passable:true}],rowCount:1};
    if(sql.includes("FROM army_map_positions position JOIN armies army"))return {rows:[],rowCount:options?.occupied?1:0};
    if(sql.includes("UPDATE army_map_positions SET")){writes.push("move");return {rows:[],rowCount:1};}
    if(sql.includes("UPDATE movement_order_steps SET status='RESOLVED'"))return {rows:[],rowCount:1};
    if(sql.includes("UPDATE movement_orders SET current_step=")){writes.push("step");return {rows:[],rowCount:1};}
    if(sql.includes("UPDATE movement_encounters SET status=")){status=String(params[1]);writes.push(status);return {rows:[],rowCount:1};}
    if(sql.includes("INSERT INTO audit_logs"))return {rows:[],rowCount:1};
    if(sql.startsWith("SELECT encounter.id"))return {rows:[{...row,status}],rowCount:1};
    throw new Error(`Unexpected query: ${sql}`);
  }} as unknown as DbClient;
  return {client,writes};
}

describe("Hex karşılaşması yönetici kararı",()=>{
  it("savaş kararında orduları yerinden oynatmadan taslak bekletir",async()=>{
    const {client,writes}=fixture("CONTACT",true);
    transaction.client=client;
    const view=await movementEncounterService.decide({guildId:"guild",actorId:"gm",caseId:encounterId,
      decision:"BATTLE_PENDING",note:"Temas doğrulandı"});
    expect(view.status).toBe("BATTLE_PENDING");
    expect(writes).toEqual(["BATTLE_PENDING"]);
  });

  it("çekilme kararında iki emri kapatır, pozisyon değiştirmez",async()=>{
    const {client,writes}=fixture("CONTACT",true);
    transaction.client=client;
    await movementEncounterService.decide({guildId:"guild",actorId:"gm",caseId:encounterId,
      decision:"RETREAT",note:"Taraflar çekildi"});
    expect(writes).toContain("cancel:order-a");
    expect(writes).toContain("cancel:order-b");
    expect(writes).not.toContain("move");
  });

  it("özel sonuçta filo temasını savaş formuna zorlamadan kapatır",async()=>{
    const {client,writes}=fixture("CONTACT",true,{formationKind:"FLEET"});
    transaction.client=client;
    const view=await movementEncounterService.decide({guildId:"guild",actorId:"gm",caseId:encounterId,
      decision:"RESOLVED",note:"Taraflar ayrıldı"});
    expect(view.status).toBe("RESOLVED");
    expect(writes).toContain("cancel:order-a");
    expect(writes).toContain("cancel:order-b");
    expect(writes).not.toContain("move");
  });

  it("sınır izninde yalnız kullanılmamış hareket payıyla bir Hex ilerler",async()=>{
    const {client,writes}=fixture("LAND_ENTRY",false);
    transaction.client=client;
    await movementEncounterService.decide({guildId:"guild",actorId:"gm",caseId:encounterId,
      decision:"PASSAGE",note:"Geçiş izni verildi"});
    expect(writes).toContain("move");
    expect(writes).toContain("step");
    expect(writes).toContain("PASSAGE");
  });

  it("düşman dolu sınır Hex'ine geçiş izniyle ordu taşımaz",async()=>{
    const {client,writes}=fixture("LAND_ENTRY",false,{occupied:true});
    transaction.client=client;
    await expect(movementEncounterService.decide({guildId:"guild",actorId:"gm",caseId:encounterId,
      decision:"PASSAGE",note:"Geçiş"})).rejects.toThrow("düşman ordusu");
    expect(writes).not.toContain("move");
  });

  it("rakip ordu bulunmayan dosyadan savaş bekliyor kararı üretmez",async()=>{
    const {client,writes}=fixture("CONTACT",false,{stationary:false});
    transaction.client=client;
    await expect(movementEncounterService.decide({guildId:"guild",actorId:"gm",caseId:encounterId,
      decision:"BATTLE_PENDING",note:"Temas"})).rejects.toThrow("iki kara ordusunun teması yok");
    expect(writes).not.toContain("BATTLE_PENDING");
  });
});
