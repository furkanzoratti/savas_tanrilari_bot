import { describe,expect,it,vi } from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import type { DbClient } from "../db/pool.js";
import { armyMovementSnapshot } from "./movement-service.js";

describe("ticari hammadde hareket bonusu",()=>{
  it("ticaretle gelen At kaynağını ordunun yüzde 25 hız bonusuna dönüştürür",async()=>{
    const client={query:async(sql:string)=>{
      if(sql.includes("FROM army_units"))return {rows:[{unit_type:"heavy_infantry",quantity:22_000}],rowCount:1};
      if(sql.includes("FROM army_siege_assets"))return {rows:[],rowCount:0};
      if(sql.includes("FROM settlements s WHERE s.country_id"))return {rows:[{
        id:"origin",resource_type:"IRON",raw_material_level:0,active_trade_usage:1
      }],rowCount:1};
      if(sql.includes("SELECT ta.proposer_settlement_id"))return {rows:[{
        settlement_id:"origin",resource_type:"HORSES"
      }],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;

    const result=await armyMovementSnapshot(client,"army-1","country-1","NORMAL",false,false);
    expect(result).toMatchObject({baseAllowance:4,speedBonus:1,allowance:5,resourceSpeedSources:["At"]});
  });
});
