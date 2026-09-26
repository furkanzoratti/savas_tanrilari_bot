import { beforeEach,describe,expect,it,vi } from "vitest";
import type { DbClient } from "../db/pool.js";

const database=vi.hoisted(()=>({
  client:null as DbClient|null,
  poolQuery:vi.fn()
}));

vi.mock("../db/pool.js",()=>(
  {
    pool:{query:database.poolQuery},
    withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(database.client!)
  }
));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import { landRaidsService } from "./land-raids-service.js";

describe("regional raid settlement eligibility",()=>{
  beforeEach(()=>{
    database.client=null;
    database.poolQuery.mockReset();
  });

  it("lists every active target-country settlement without requiring conquest",async()=>{
    database.poolQuery.mockResolvedValue({
      rows:[{id:"target-settlement",name:"Sagardiya"}],rowCount:1
    });

    await expect(landRaidsService.listRaidTargets(
      "guild-1","raider-country","target-country","REGIONAL"
    )).resolves.toEqual([{id:"target-settlement",name:"Sagardiya"}]);

    const [sql,params]=database.poolQuery.mock.calls[0] as [string,unknown[]];
    expect(sql).toContain("settlement.country_id=$2");
    expect(sql).not.toContain("settlement.is_conquered");
    expect(sql).not.toContain("SETTLEMENT_TRANSFER");
    expect(params).toEqual(["guild-1","target-country"]);
  });

  it("keeps the conquest-transfer requirement exclusive to city plunder",async()=>{
    database.poolQuery.mockResolvedValue({rows:[],rowCount:0});

    await landRaidsService.listRaidTargets(
      "guild-1","raider-country","target-country","CITY"
    );

    const [sql,params]=database.poolQuery.mock.calls[0] as [string,unknown[]];
    expect(sql).toContain("settlement.is_conquered=TRUE");
    expect(sql).toContain("SETTLEMENT_TRANSFER");
    expect(params).toEqual(["guild-1","raider-country","target-country"]);
  });

  it("accepts an unconquered enemy settlement when starting a regional raid",async()=>{
    const queries:Array<{sql:string;params?:unknown[]}>=[];
    const client={async query(sql:string,params?:unknown[]){
      queries.push({sql,params});
      if(sql.includes("FROM armies army"))return {rows:[{id:"army-1",strength:2500}],rowCount:1};
      if(sql.includes("FROM settlements settlement JOIN countries owner")&&sql.includes("FOR UPDATE OF settlement"))return {
        rows:[{id:"target-settlement",population:10000,last_acquisition_income:3000}],rowCount:1
      };
      if(sql.includes("SELECT settlement.id FROM settlements"))return {rows:[{id:"payout-settlement"}],rowCount:1};
      if(sql.includes("SELECT war.id FROM state_wars"))return {rows:[{id:"war-1"}],rowCount:1};
      if(sql.includes("SELECT 1 FROM land_raids")||sql.includes("SELECT 1 FROM battle_army_assignments"))return {rows:[],rowCount:0};
      if(sql.includes("FROM guild_movement_settings"))return {rows:[{enabled:false}],rowCount:1};
      if(sql.includes("SELECT current_turn FROM guilds"))return {rows:[{current_turn:24}],rowCount:1};
      if(sql.includes("INSERT INTO land_raids"))return {rows:[{id:"raid-1"}],rowCount:1};
      if(sql.includes("INSERT INTO audit_logs"))return {rows:[],rowCount:1};
      if(sql.includes("FROM land_raids raid JOIN countries"))return {rows:[{
        id:"raid-1",guild_id:"guild-1",raid_type:"REGIONAL",war_id:"war-1",
        raider_country_id:"raider-country",raider_country_name:"Yağmacı",army_id:"army-1",army_name:"Ordu",
        target_country_id:"target-country",target_country_name:"Hedef",target_settlement_id:"target-settlement",
        target_settlement_name:"Sagardiya",payout_settlement_id:"payout-settlement",payout_settlement_name:"Başkent",
        status:"WAITING_ROLL",game_turn:24,army_strength:2500,target_population_before:10000,income_basis:3000,
        size_modifier:1,roll_sides:20,roll_value:null,roll_total:null,result_tier:null,loot_percent:null,loot_amount:null,
        population_loss_percent:null,population_loss:null,slave_amount:null,income_penalty_percent:null,army_exposed:false,
        roller_user_id:null,public_channel_id:"channel-1",public_message_id:null,created_by:"gm-1"
      }],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    database.client=client;

    await expect(landRaidsService.startRaid({
      guildId:"guild-1",actorId:"gm-1",type:"REGIONAL",raiderCountryId:"raider-country",armyId:"army-1",
      targetCountryId:"target-country",targetSettlementId:"target-settlement",payoutSettlementId:"payout-settlement",channelId:"channel-1"
    })).resolves.toMatchObject({id:"raid-1",target_settlement_id:"target-settlement"});

    const targetQuery=queries.find(({sql})=>sql.includes("FROM settlements settlement JOIN countries owner")&&sql.includes("FOR UPDATE OF settlement"));
    expect(targetQuery?.sql).not.toContain("is_conquered");
    expect(targetQuery?.sql).not.toContain("SETTLEMENT_TRANSFER");
    expect(targetQuery?.params).toEqual(["guild-1","target-country","target-settlement"]);
  });
});
