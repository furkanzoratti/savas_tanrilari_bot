import {describe,expect,it,vi} from "vitest";
import type {DbClient} from "../db/pool.js";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import {resolveArmyDischargeSettlement} from "./army-service.js";

describe("ordudan çıkarılan askerin yeniden kullanımı",()=>{
  it("hareket kapalıyken askeri sahip olunan tarihsel köken stokuna döndürür",async()=>{
    const queries:string[]=[];
    const client={query:vi.fn(async(sql:string)=>{
      queries.push(sql);
      if(sql.includes("COALESCE(settings.enabled"))return {rows:[{enabled:false}],rowCount:1};
      if(sql.includes("SELECT id,name FROM settlements"))return {rows:[{id:"origin",name:"Alabu"}],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    })} as unknown as DbClient;

    await expect(resolveArmyDischargeSettlement(client,"army-a","country","origin"))
      .resolves.toEqual({id:"origin",name:"Alabu"});
    expect(queries.some((sql)=>sql.includes("army_map_positions"))).toBe(false);
  });

  it("hareket açıkken tarihsel köken yerine ordunun bulunduğu dost şehri kullanır",async()=>{
    const client={query:vi.fn(async(sql:string)=>{
      if(sql.includes("COALESCE(settings.enabled"))return {rows:[{enabled:true}],rowCount:1};
      if(sql.includes("army_map_positions"))return {rows:[{id:"current",name:"Istros"}],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    })} as unknown as DbClient;

    await expect(resolveArmyDischargeSettlement(client,"army-a","country","origin"))
      .resolves.toEqual({id:"current",name:"Istros"});
  });

  it("hareket kapalıyken kaybedilmiş köken yerine mevcut dost şehre güvenli dönüş yapar",async()=>{
    const client={query:vi.fn(async(sql:string)=>{
      if(sql.includes("COALESCE(settings.enabled"))return {rows:[{enabled:false}],rowCount:1};
      if(sql.includes("SELECT id,name FROM settlements"))return {rows:[],rowCount:0};
      if(sql.includes("army_map_positions"))return {rows:[{id:"current",name:"Istros"}],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    })} as unknown as DbClient;

    await expect(resolveArmyDischargeSettlement(client,"army-a","country","lost-origin"))
      .resolves.toEqual({id:"current",name:"Istros"});
  });
});
