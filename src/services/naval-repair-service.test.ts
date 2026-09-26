import { beforeEach,describe,expect,it,vi } from "vitest";
import type { DbClient } from "../db/pool.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));

vi.mock("../db/pool.js",()=>({
  pool:{},
  withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!)
}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import { navalRepairService } from "./naval-repair-service.js";

function unlocked(sql:string){
  return sql.includes("FROM battle_fleet_assignments")||sql.includes("FROM naval_blockades")||sql.includes("FROM naval_raids");
}

describe("naval repair scope and withdrawal",()=>{
  beforeEach(()=>{transaction.client=null;});

  it("sends only DISABLED records when disabled-only scope is selected",async()=>{
    const queries:Array<{sql:string;params?:unknown[]}>=[];
    const client={async query(sql:string,params?:unknown[]){
      queries.push({sql,params});
      if(sql.includes("SELECT id,name,country_id FROM fleets"))return {rows:[{id:"fleet-1",name:"Royal Navy",country_id:"country-1"}],rowCount:1};
      if(unlocked(sql))return {rows:[],rowCount:0};
      if(sql.includes("FROM settlements settlement JOIN buildings"))return {rows:[{id:"port-1",name:"Londra",shipyard_level:2}],rowCount:1};
      if(sql.includes("SELECT id,settlement_id,ship_type,max_hp,current_hp FROM naval_ship_damage"))return {
        rows:[{id:"damage-disabled",settlement_id:"port-1",ship_type:"trireme",max_hp:75,current_hp:20}],rowCount:1
      };
      if(sql.includes("SELECT current_turn FROM guilds"))return {rows:[{current_turn:24}],rowCount:1};
      if(sql.includes("INSERT INTO fleet_repair_groups"))return {rows:[{id:"repair-1"}],rowCount:1};
      if(sql.includes("SELECT quantity FROM fleet_ships"))return {rows:[{quantity:2}],rowCount:1};
      if(sql.includes("SELECT repair.id,repair.guild_id"))return {rows:[{
        id:"repair-1",guild_id:"guild-1",country_id:"country-1",country_name:"Britanya",
        repair_settlement_id:"port-1",repair_settlement_name:"Londra",source_fleet_id:"fleet-1",
        source_fleet_name:"Royal Navy",name:"Tamirdeki Filo • Royal Navy",shipyard_level:2,
        started_turn:24,completion_turn:25,status:"REPAIRING"
      }],rowCount:1};
      if(sql.includes("FROM naval_ship_damage damage JOIN settlements origin"))return {rows:[{
        settlement_id:"port-1",settlement_name:"Londra",ship_type:"trireme",quantity:1,
        current_hp:20,max_hp:75,missing_hp:55,disabled:1
      }],rowCount:1};
      if(sql.startsWith("UPDATE")||sql.startsWith("DELETE")||sql.includes("INSERT INTO audit_logs"))return {rows:[],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    transaction.client=client;

    await expect(navalRepairService.sendFleetToRepair({
      guildId:"guild-1",countryId:"country-1",actorId:"player-1",fleetId:"fleet-1",
      repairSettlementId:"port-1",scope:"DISABLED_ONLY"
    })).resolves.toMatchObject({totalShips:1,missingHp:55});

    const selection=queries.find(({sql})=>sql.includes("SELECT id,settlement_id,ship_type,max_hp,current_hp FROM naval_ship_damage"));
    expect(selection?.sql).toContain("status='DISABLED'");
    expect(selection?.params).toEqual(["fleet-1","DISABLED_ONLY"]);
    const audit=queries.find(({sql})=>sql.includes("'fleet.repair.start'"));
    expect(String(audit?.params?.[3])).toContain('"scope":"DISABLED_ONLY"');
  });

  it("returns only operational damaged ships and leaves disabled ships in repair",async()=>{
    const queries:string[]=[];
    const client={async query(sql:string){
      queries.push(sql);
      if(sql.includes("SELECT id,status FROM fleet_repair_groups"))return {rows:[{id:"repair-1",status:"REPAIRING"}],rowCount:1};
      if(sql.includes("SELECT id,name FROM fleets"))return {rows:[{id:"fleet-1",name:"Royal Navy"}],rowCount:1};
      if(unlocked(sql))return {rows:[],rowCount:0};
      if(sql.includes("SELECT id,settlement_id,ship_type FROM naval_ship_damage"))return {
        rows:[{id:"damage-operational",settlement_id:"port-1",ship_type:"trireme"}],rowCount:1
      };
      if(sql.includes("SELECT COUNT(*)::integer AS quantity FROM naval_ship_damage"))return {rows:[{quantity:2}],rowCount:1};
      if(sql.startsWith("INSERT INTO fleet_ships")||sql.startsWith("UPDATE naval_ship_damage")||
        sql.startsWith("UPDATE fleets")||sql.includes("INSERT INTO audit_logs"))return {rows:[],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    transaction.client=client;

    await expect(navalRepairService.withdrawOperationalShips({
      guildId:"guild-1",countryId:"country-1",actorId:"player-1",repairGroupId:"repair-1",targetFleetId:"fleet-1"
    })).resolves.toEqual({targetFleetId:"fleet-1",targetFleetName:"Royal Navy",transferred:1});

    expect(queries.some((sql)=>sql.includes("current_hp>CASE ship_type"))).toBe(true);
    expect(queries.some((sql)=>sql.includes("status='DAMAGED'"))).toBe(true);
    expect(queries.some((sql)=>sql.includes("SET status='TRANSFERRED'"))).toBe(false);
  });
});
