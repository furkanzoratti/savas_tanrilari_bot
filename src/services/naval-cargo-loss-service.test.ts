import {describe,expect,it,vi} from "vitest";
import type {DbClient} from "../db/pool.js";
import {applyBattleNavalCargoLosses} from "./naval-cargo-loss-service.js";

describe("deniz savaşında taşınan ordu kaybı",()=>{
  it("kaybı ordudan, köken yerleşke asker stokundan ve nüfustan birlikte düşer",async()=>{
    const writes:Array<{sql:string;params:unknown[]}>=[];
    const query=vi.fn(async(sql:string,params:unknown[]=[])=>{
      if(sql.includes("FROM battle_side_participants participant"))return {rows:[{
        side_key:"A",country_id:"country",country_name:"Kartaca",embarked_army_id:"army",
        embarked_army_name:"Sefer Ordusu",embarked_army_composition:{heavy_infantry:600}
      }],rowCount:1};
      if(sql.includes("FROM battle_ship_hulls"))return {rows:[{
        ship_type:"kerkouros",initial_quantity:10,sunk_quantity:5
      }],rowCount:1};
      if(sql.includes("SELECT active_formable_key"))return {rows:[{active_formable_key:null}],rowCount:1};
      if(sql.includes("FROM army_units unit"))return {rows:[{
        settlement_id:"origin",unit_type:"heavy_infantry",quantity:600,origin_country_id:"country"
      }],rowCount:1};
      if(sql.includes("SELECT id,quantity FROM unit_stacks"))return {rows:[{id:"stack",quantity:600}],rowCount:1};
      if(sql.includes("SELECT population FROM settlements"))return {rows:[{population:10_000}],rowCount:1};
      writes.push({sql,params});
      return {rows:[],rowCount:1};
    });

    const result=await applyBattleNavalCargoLosses({query} as unknown as DbClient,{
      battleId:"battle",guildId:"guild",actorId:"gm"
    });

    expect(result).toEqual([expect.objectContaining({calculated:210,applied:210,populationLoss:210})]);
    expect(writes).toEqual(expect.arrayContaining([
      expect.objectContaining({sql:expect.stringContaining("UPDATE unit_stacks SET quantity="),params:[390,"stack"]}),
      expect.objectContaining({sql:expect.stringContaining("UPDATE settlements SET population=population-$1"),params:[210,"origin"]}),
      expect.objectContaining({sql:expect.stringContaining("UPDATE army_units SET quantity="),params:[390,"army","origin","heavy_infantry"]}),
      expect.objectContaining({sql:expect.stringContaining("SET embarked_army_loss=$1"),params:[210,"battle","country"]})
    ]));
  });
});
