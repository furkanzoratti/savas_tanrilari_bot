import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { armyMusterService, resolveArmyMusterStage } from "./army-muster-service.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error {}}));
vi.mock("../db/pool.js",()=>({pool:{},withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!)}));

function fixture(armyAtDestination=true){
  const order={id:"muster-1",country_id:"country-1",army_id:"army-1",
    source_settlement_id:"settlement-1",unit_type:"archer",quantity:500,
    start_hex_id:"hex-a",destination_hex_id:"hex-c",current_hex_id:"hex-a",
    route_hex_ids:["hex-a","hex-b","hex-c"],route_costs:[1,1],
    movement_allowance:1,current_step:0,status:"SUBMITTED",issued_turn:8,is_returning:false};
  const writes:string[]=[];
  const client={async query(sql:string,params:unknown[]=[]){
    if(sql.includes("FROM army_muster_orders WHERE guild_id=$1"))return {rows:[{...order}],rowCount:1};
    if(sql.includes("SELECT domain,passable,owner_country_id FROM map_hexes"))return {rows:[{domain:"LAND",passable:true,owner_country_id:"country-1"}],rowCount:1};
    if(sql.includes("SELECT id,coordinate FROM map_hexes WHERE id=ANY"))
      return {rows:(params[0] as string[]).map((id)=>({id,coordinate:id.toUpperCase()})),rowCount:2};
    if(sql.includes("FROM army_map_positions position JOIN armies army") && sql.includes("country_id<>"))return {rows:[],rowCount:0};
    if(sql.includes("UPDATE army_muster_orders SET current_step=")){
      order.current_step=Number(params[1]);order.current_hex_id=String(params[2]);writes.push("advance");return {rows:[],rowCount:1};
    }
    if(sql.includes("SELECT status FROM army_muster_orders"))return {rows:[{status:order.status}],rowCount:1};
    if(sql.includes("UPDATE army_muster_orders SET status='IN_PROGRESS'")){
      order.status="IN_PROGRESS";writes.push("ongoing");return {rows:[],rowCount:1};
    }
    if(sql.includes("LEFT JOIN army_map_positions position ON position.army_id=army.id"))
      return {rows:[{hex_id:armyAtDestination?"hex-c":"hex-b",country_id:"country-1"}],rowCount:1};
    if(sql.includes("FROM battle_army_assignments assigned") || sql.includes("FROM movement_encounters incident"))
      return {rows:[],rowCount:0};
    if(sql.includes("SELECT country_id FROM settlements"))return {rows:[{country_id:"country-1"}],rowCount:1};
    if(sql.includes("FROM unit_stacks"))return {rows:[{quantity:500}],rowCount:1};
    if(sql.includes("FROM army_units"))return {rows:[{quantity:0}],rowCount:1};
    if(sql.includes("INSERT INTO army_units")){writes.push("join");return {rows:[],rowCount:1};}
    if(sql.includes("UPDATE armies SET"))return {rows:[],rowCount:1};
    if(sql.includes("UPDATE army_muster_orders SET status='COMPLETED'")){
      order.status="COMPLETED";writes.push("complete");return {rows:[],rowCount:1};
    }
    if(sql.includes("UPDATE army_muster_orders SET status='CANCELLED'")){
      order.status="CANCELLED";writes.push("returned");return {rows:[],rowCount:1};
    }
    if(sql.includes("UPDATE army_muster_orders SET status='WAITING_ARMY'")){
      order.status="WAITING_ARMY";writes.push("waiting");return {rows:[],rowCount:1};
    }
    if(sql.includes("INSERT INTO audit_logs"))return {rows:[],rowCount:1};
    throw new Error(`Unexpected query: ${sql}`);
  }} as unknown as DbClient;
  return {client,writes,order};
}

describe("ordu toplama intikali",()=>{
  it("ilk tur bir Hex gider, sonraki tur orduya ancak varınca katılır",async()=>{
    const {client,writes}=fixture();
    expect(await resolveArmyMusterStage(client,"guild-1","gm-1",8,"STOP"))
      .toMatchObject({processed:1,advanced:1,joined:0});
    expect(writes).not.toContain("join");
    expect(await resolveArmyMusterStage(client,"guild-1","gm-1",9,"ADVANCE"))
      .toMatchObject({processed:1,advanced:1,joined:1});
    expect(writes).toContain("join");
  });

  it("ordu toplanma Hex'inden ayrıldıysa takviyeyi orduya ışınlamaz",async()=>{
    const {client,writes}=fixture(false);
    await resolveArmyMusterStage(client,"guild-1","gm-1",8,"STOP");
    const result=await resolveArmyMusterStage(client,"guild-1","gm-1",9,"ADVANCE");
    expect(result).toMatchObject({joined:0,waiting:1});
    expect(writes).not.toContain("join");
  });

  it("geri dönen asker kaynak Hex'e varmadan serbest kalmaz ve orduya katılmaz",async()=>{
    const {client,writes,order}=fixture();
    order.is_returning=true;order.status="IN_PROGRESS";order.issued_turn=7;
    order.start_hex_id="hex-c";order.destination_hex_id="hex-a";
    order.route_hex_ids=["hex-c","hex-b","hex-a"];order.current_hex_id="hex-c";
    await resolveArmyMusterStage(client,"guild-1","gm-1",8,"ADVANCE");
    expect(writes).not.toContain("join");
    expect(writes).not.toContain("returned");
    await resolveArmyMusterStage(client,"guild-1","gm-1",9,"ADVANCE");
    expect(writes).toContain("returned");
    expect(writes).not.toContain("join");
  });

  it("GM geri çağırmasında yalnız kat edilmiş Hex rotasını ters çevirir",async()=>{
    let recalled:unknown[]=[];
    transaction.client={query:async(sql:string,params:unknown[]=[])=>{
      if(sql.includes("pg_advisory_xact_lock"))return {rows:[],rowCount:1};
      if(sql.includes("SELECT id,status,is_returning,current_step"))return {rows:[{
        id:"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",status:"BLOCKED",is_returning:false,
        current_step:2,current_hex_id:"hex-c",start_hex_id:"hex-a",
        route_hex_ids:["hex-a","hex-b","hex-c","hex-d"],route_costs:[1,2,3]
      }],rowCount:1};
      if(sql.includes("SELECT current_turn FROM guilds"))return {rows:[{current_turn:9}],rowCount:1};
      if(sql.includes("UPDATE army_muster_orders SET start_hex_id=")){recalled=params;return {rows:[],rowCount:1};}
      if(sql.includes("INSERT INTO audit_logs"))return {rows:[],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    await armyMusterService.recall({guildId:"guild-1",actorId:"gm-1",orderId:"aaaaaaaa",note:"Geri çekil"});
    expect(recalled[3]).toEqual(["hex-c","hex-b","hex-a"]);
    expect(recalled[4]).toEqual([2,1]);
  });
});
