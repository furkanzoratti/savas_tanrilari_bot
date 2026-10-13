import { describe, expect, it, vi } from "vitest";
import type {DbClient} from "../db/pool.js";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import { applyEspionageEffect, espionageTargetExists, productionOrderLabel, recruitmentWaveLabel } from "./espionage-effects.js";

describe("casusluk etki hedefleri", () => {
  it("asker alım dalgasını birlik, miktar ve turuyla adlandırır", () => {
    expect(recruitmentWaveLabel({ id:"wave",unit_type:"heavy_infantry",quantity:1_250,due_turn:14 }))
      .toBe("1.250 Ağır Piyade (Tur 14)");
  });

  it("gemi ve kuşatma üretim emrini gerçek adıyla adlandırır", () => {
    expect(productionOrderLabel({ kind:"SHIP",id:"ship",item_type:"trireme",quantity:2,completion_turn:15 }))
      .toBe("2 Trireme (Tur 15)");
    expect(productionOrderLabel({ kind:"SIEGE",id:"siege",item_type:"catapult",quantity:3,completion_turn:16 }))
      .toBe("3 Katapult (Tur 16)");
  });

  it.each(["INCITE_PUBLIC","AGGRAVATE_EVENT"] as const)("%s ağır başarıda yalnızca huzursuzluk çıkarır",async(targetType)=>{
    const queries:string[]=[];
    const client={query:async(sql:string)=>{queries.push(sql);return{rows:[],rowCount:1};}} as unknown as DbClient;
    const result=await applyEspionageEffect(client,{
      attacker_country_id:"attacker",target_country_id:"target",target_settlement_id:"settlement",
      target_character_id:null,target_noble_type:null,target_noble_id:null,target_noble_family_id:null,
      target_army_id:null,spy_character_id:"spy",target_type:targetType
    },"HEAVY",20);
    expect(queries).toEqual(["UPDATE settlements SET unrest_active=TRUE WHERE id=$1"]);
    expect(queries.join(" ")).not.toContain("rebellion_active");
    expect(result).toContain("doğrudan isyan başlatmaz");
  });

  it("olayı körüklemeyi yalnız huzursuzluk veya diğer etkin olaylarda mümkün kılar",async()=>{
    const queries:string[]=[];
    const client={query:async(sql:string)=>{queries.push(sql);return{rows:[{exists:true}],rowCount:1};}} as unknown as DbClient;
    await espionageTargetExists(client,{
      attacker_country_id:"attacker",target_country_id:"target",target_settlement_id:"settlement",
      target_character_id:null,target_noble_type:null,target_noble_id:null,target_noble_family_id:null,
      target_army_id:null,spy_character_id:"spy",target_type:"AGGRAVATE_EVENT"
    });
    expect(queries[0]).toContain("black_market_active OR epidemic_active OR unrest_active");
    expect(queries[0]).not.toContain("rebellion_active");
  });

  it("kaçırma görevinde yaşayan hanedan soylusunu hedef olarak kabul eder",async()=>{
    const queries:string[]=[];
    const client={query:async(sql:string)=>{
      queries.push(sql);
      return queries.length===1?{rows:[],rowCount:0}:{rows:[{id:"member"}],rowCount:1};
    }} as unknown as DbClient;
    const exists=await espionageTargetExists(client,{
      attacker_country_id:"attacker",target_country_id:"target",target_settlement_id:"settlement",
      target_character_id:null,target_noble_type:"DYNASTY",target_noble_id:"member",target_noble_family_id:"family",
      target_army_id:null,spy_character_id:"spy",target_type:"KIDNAP"
    });
    expect(exists).toBe(true);
    expect(queries[0]).toContain("espionage_captivities");
    expect(queries[1]).toContain("dynasty_members");
  });

  it("başarılı soylu kaçırmasını yönetici kararı bekleyen tutsaklık olarak açıklar",async()=>{
    const client={query:async()=>({rows:[],rowCount:1})} as unknown as DbClient;
    const result=await applyEspionageEffect(client,{
      attacker_country_id:"attacker",target_country_id:"target",target_settlement_id:"settlement",
      target_character_id:null,target_noble_type:"DYNASTY",target_noble_id:"member",target_noble_family_id:"family",
      target_army_id:null,spy_character_id:"spy",target_type:"KIDNAP"
    },"LIGHT",20);
    expect(result).toContain("yönetici kararıyla serbest bırakılana veya infaz edilene kadar");
  });
});
