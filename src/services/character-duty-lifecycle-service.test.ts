import {describe,expect,it,vi} from "vitest";
import type {DbClient} from "../db/pool.js";
import {cleanupEliminatedCountry,terminateCharacterDuties} from "./character-duty-lifecycle-service.js";

describe("karakter görevi yaşam döngüsü",()=>{
  it("kaçırılan karakterin bütün canlı görev ve atamalarını kapatır",async()=>{
    const queries:string[]=[];
    const client={query:vi.fn(async(sql:string)=>{
      queries.push(sql);
      return{rows:[],rowCount:1};
    })} as unknown as DbClient;

    await terminateCharacterDuties(client,"character-1","Kaçırıldı.");

    const sql=queries.join("\n");
    expect(sql).toContain("UPDATE espionage_operations");
    expect(sql).toContain("UPDATE merchant_operations");
    expect(sql).toContain("UPDATE diplomat_operations");
    expect(sql).toContain("UPDATE missionary_operations");
    expect(sql).toContain("DELETE FROM settlement_assimilation_diplomats");
    expect(sql).toContain("UPDATE armies SET commander_character_id=NULL");
    expect(sql).toContain("UPDATE fleets SET commander_character_id=NULL");
    expect(sql).toContain("UPDATE battle_sides");
    expect(sql).toContain("UPDATE naval_blockades");
    expect(sql).toContain("UPDATE naval_raids");
  });

  it("yok olan devletin karakterlerini görevden alır ve hâkim olduğu vassalları serbest bırakır",async()=>{
    const queries:string[]=[];
    const client={query:vi.fn(async(sql:string)=>{
      queries.push(sql);
      if(sql.includes("SELECT spy_character_id AS character_id")){
        return{rows:[{character_id:"00000000-0000-0000-0000-000000000001"}],rowCount:1};
      }
      if(sql.includes("RETURNING vassal_country_id")){
        return{rows:[{vassal_country_id:"vassal-1"}],rowCount:1};
      }
      if(sql.includes("SET character_status='DISMISSED'"))return{rows:[],rowCount:4};
      return{rows:[],rowCount:1};
    })} as unknown as DbClient;

    const result=await cleanupEliminatedCountry(client,{
      countryId:"country-1",turn:42,actorId:"SYSTEM",reason:"Devlet yok oldu."
    });

    const sql=queries.join("\n");
    expect(result.dismissedCharacters).toBe(4);
    expect(result.releasedVassalCountryIds).toEqual(["vassal-1"]);
    expect(sql).toContain("country_id<>$2");
    expect(sql).toContain("status='CANCELLED'");
    expect(sql).toContain("overlord_country_id=$1 RETURNING vassal_country_id");
    expect(sql).toContain("WHERE status='ACTIVE' AND vassal_country_id=$1");
    expect(sql).toContain("SET character_status='DISMISSED'");
    expect(sql).toContain("is_marshal=FALSE");
  });
});
