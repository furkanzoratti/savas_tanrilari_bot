import { beforeEach,describe,expect,it,vi } from "vitest";
import type { DbClient } from "../db/pool.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));

vi.mock("../db/pool.js",()=>({
  pool:{},
  withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!)
}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import { battleService } from "./battle-service.js";

describe("admin naval hull visibility",()=>{
  beforeEach(()=>{transaction.client=null;});

  it("returns every ship from both battle sides",async()=>{
    const client={async query(sql:string){
      if(sql.includes("SELECT id,terrain,status,round_number FROM battles"))return {
        rows:[{id:"battle-1",terrain:"NAVAL",status:"WAITING_FIRST_ROLL",round_number:3}],rowCount:1
      };
      if(sql.includes("SELECT 1 FROM battle_ship_hulls"))return {rows:[{}],rowCount:1};
      if(sql.includes("FROM battle_ship_hulls hull")&&sql.includes("JOIN countries country"))return {rows:[
        {id:"a-1",side_key:"A",country_id:"rome",country_name:"Roma",fleet_id:"fleet-a",fleet_name:"Classis",settlement_name:"Roma",ship_type:"trireme",max_hp:75,current_hp:61,disabled_round:null,sunk_round:null},
        {id:"b-1",side_key:"B",country_id:"carthage",country_name:"Kartaca",fleet_id:"fleet-b",fleet_name:"Pön Filosu",settlement_name:"Kartaca",ship_type:"quinquereme",max_hp:120,current_hp:30,disabled_round:2,sunk_round:null}
      ],rowCount:2};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    transaction.client=client;

    const status=await battleService.adminFleetStatus({guildId:"guild-1",battleId:"battle-1"});
    expect(status.roundNumber).toBe(3);
    expect(status.ships.map((ship)=>[ship.sideKey,ship.countryName,ship.currentHp])).toEqual([
      ["A","Roma",61],["B","Kartaca",30]
    ]);
  });

  it("rejects non-naval battles",async()=>{
    transaction.client={async query(sql:string){
      if(sql.includes("SELECT id,terrain,status,round_number FROM battles"))return {
        rows:[{id:"battle-1",terrain:"OPEN_PLAIN",status:"WAITING_FIRST_ROLL",round_number:1}],rowCount:1
      };
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    await expect(battleService.adminFleetStatus({guildId:"guild-1",battleId:"battle-1"}))
      .rejects.toThrow("yalnızca deniz savaşlarında");
  });
});
