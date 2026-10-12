import { describe,expect,it } from "vitest";
import type { DbClient } from "../db/pool.js";
import { evacuateSettlementShips } from "./naval-evacuation-service.js";

function clientFor(destination: boolean): { client: DbClient; queries: Array<{sql:string;params?:unknown[]}> } {
  const queries:Array<{sql:string;params?:unknown[]}>=[];
  const client={async query(sql:string,params?:unknown[]){
    queries.push({sql,params});
    if(sql.includes("FROM settlements settlement")&&sql.includes("JOIN buildings port"))return destination
      ? {rows:[{id:"safe-port",name:"Kartaca"}],rowCount:1}
      : {rows:[],rowCount:0};
    if(sql.includes("SELECT GREATEST("))return {rows:[{total:7}],rowCount:1};
    if(sql.includes("SELECT fleet_id AS id FROM fleet_ships"))return {rows:[{id:"fleet-1"},{id:"fleet-1"}],rowCount:2};
    if(sql.includes("FROM fleet_repair_groups repair")&&sql.includes("JOIN naval_ship_damage"))return {rows:[],rowCount:0};
    if(sql.startsWith("WITH moved AS")||sql.startsWith("UPDATE")||sql.startsWith("DELETE"))return {rows:[],rowCount:1};
    throw new Error(`Unexpected query: ${sql}`);
  }} as unknown as DbClient;
  return {client,queries};
}

describe("naval evacuation on settlement transfer",()=>{
  it("moves both total stock and fleet allocations to another owned port",async()=>{
    const mocked=clientFor(true);
    await expect(evacuateSettlementShips(mocked.client,{
      countryId:"country-1",settlementId:"lost-port",currentTurn:32
    })).resolves.toEqual({
      transferredShips:7,scuttledShips:0,destinationSettlementId:"safe-port",
      destinationSettlementName:"Kartaca",relocatedFleets:1,
      cancelledOwnRepairShips:0,cancelledForeignRepairShips:0
    });

    const stockMove=mocked.queries.find(({sql})=>sql.includes("INSERT INTO naval_units"));
    const allocationMove=mocked.queries.find(({sql})=>sql.includes("INSERT INTO fleet_ships"));
    expect(stockMove?.params).toEqual(["lost-port","safe-port"]);
    expect(allocationMove?.params).toEqual(["lost-port","safe-port"]);
    expect(mocked.queries.some(({sql})=>sql.includes("UPDATE naval_ship_damage SET settlement_id"))).toBe(true);
  });

  it("removes the ships when the country has no other operational port",async()=>{
    const mocked=clientFor(false);
    await expect(evacuateSettlementShips(mocked.client,{
      countryId:"country-1",settlementId:"last-port",currentTurn:32
    })).resolves.toEqual({
      transferredShips:0,scuttledShips:7,destinationSettlementId:null,
      destinationSettlementName:null,relocatedFleets:0,
      cancelledOwnRepairShips:0,cancelledForeignRepairShips:0
    });
    expect(mocked.queries.some(({sql})=>sql==="DELETE FROM fleet_ships WHERE settlement_id=$1")).toBe(true);
    expect(mocked.queries.some(({sql})=>sql==="DELETE FROM naval_units WHERE settlement_id=$1")).toBe(true);
  });

  it("cancels local and foreign repairs without healing their hulls",async()=>{
    const queries:Array<{sql:string;params?:unknown[]}>=[];
    const client={async query(sql:string,params?:unknown[]){
      queries.push({sql,params});
      if(sql.includes("FROM settlements settlement")&&sql.includes("JOIN buildings port"))return {
        rows:[{id:"safe-port",name:"Kartaca"}],rowCount:1
      };
      if(sql.includes("SELECT GREATEST("))return {rows:[{total:3}],rowCount:1};
      if(sql.includes("SELECT fleet_id AS id FROM fleet_ships"))return {rows:[],rowCount:0};
      if(sql.includes("FROM fleet_repair_groups repair")&&sql.includes("JOIN naval_ship_damage"))return {rows:[
        {repair_group_id:"repair-own",country_id:"country-1",source_fleet_id:"fleet-own",damage_id:"damage-own",
          settlement_id:"lost-port",ship_type:"trireme",current_hp:35,max_hp:75},
        {repair_group_id:"repair-foreign",country_id:"country-2",source_fleet_id:"fleet-foreign",damage_id:"damage-foreign",
          settlement_id:"foreign-port",ship_type:"kerkouros",current_hp:8,max_hp:40}
      ],rowCount:2};
      if(sql.startsWith("WITH moved AS")||sql.startsWith("UPDATE")||sql.startsWith("DELETE")||sql.startsWith("INSERT"))return {rows:[],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;

    const result=await evacuateSettlementShips(client,{countryId:"country-1",settlementId:"lost-port",currentTurn:32});
    expect(result).toMatchObject({cancelledOwnRepairShips:1,cancelledForeignRepairShips:1});
    const damageUpdates=queries.filter(({sql})=>sql.includes("repair_group_id=NULL,status=$3"));
    expect(damageUpdates.map(({params})=>params)).toEqual([
      ["safe-port","fleet-own","DAMAGED","damage-own"],
      ["foreign-port","fleet-foreign","DISABLED","damage-foreign"]
    ]);
    expect(queries.some(({sql})=>sql.includes("current_hp=max_hp"))).toBe(false);
    expect(queries.some(({sql})=>sql.includes("SET status='TRANSFERRED'"))).toBe(true);
  });
});
