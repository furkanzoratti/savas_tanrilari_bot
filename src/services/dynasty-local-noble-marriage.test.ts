import {describe,expect,it,vi} from "vitest";
import type {DbClient} from "../db/pool.js";
import {localNobleMarriageCandidates} from "../domain/dynasty-local-nobles.js";
import {NOBLE_TRAIT_KEYS} from "../domain/noble-traits.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));
vi.mock("../db/pool.js",()=>( {
  pool:{query:vi.fn()},
  withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!)
}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import {dynastyService} from "./dynasty-service.js";

const ids={
  country:"11111111-1111-4111-8111-111111111111",
  dynasty:"22222222-2222-4222-8222-222222222222",
  member:"33333333-3333-4333-8333-333333333333",
  spouse:"44444444-4444-4444-8444-444444444444"
};

describe("oyuncu yerel soylu evliliği",()=>{
  it("kültürel adayı ters cinsiyette haneye ekler, eş bağını ve traitini tek işlemde yazar",async()=>{
    const writes:{sql:string;params:unknown[]}[]=[];
    const member={
      id:ids.member,name:"Hanno",gender:"MALE",age:30,title:"Prens",relation:"Hükümdarın oğlu",
      status:"ALIVE",health:"HEALTHY",sick_until_turn:null,is_monarch:false,is_heir:true,succession_rank:1,
      birth_dynasty_id:null,birth_dynasty_name:null,birth_country_name:null,spouse_id:null,spouse_name:null,
      spouse_title:null,spouse_age:null,spouse_country_name:null,spouse_dynasty_name:null,
      spouse_birth_dynasty_name:null,spouse_birth_country_name:null,spouse_status:null,roman_spouse_id:null,
      roman_mother_id:null,roman_father_id:null,mother_id:null,mother_name:null,father_id:null,father_name:null,
      born_turn:18,died_turn:null,death_reason:null,kidnapped:false,captor_country_name:null,captured_settlement_name:null,
      trait_key:null
    };
    transaction.client={query:async(sql:string,params:unknown[]=[])=>{
      if(sql.includes("SELECT id,name FROM countries"))return{rows:[{id:ids.country,name:"Büyük Kartaca"}],rowCount:1};
      if(sql.includes("FROM dynasties dynasty JOIN countries country")&&sql.includes("WHERE dynasty.id="))
        return{rows:[{id:ids.dynasty,name:"Barkid Hanedanı",country_name:"Büyük Kartaca",last_birth_attempt_turn:null}],rowCount:1};
      if(sql.includes("pg_advisory_xact_lock"))return{rows:[],rowCount:1};
      if(sql.includes("FROM dynasty_members member")&&sql.includes("WHERE member.id=$1 AND member.dynasty_id=$2"))
        return{rows:[member],rowCount:1};
      if(sql.includes("SELECT primary_culture_group FROM countries"))return{rows:[{primary_culture_group:"PUNIC"}],rowCount:1};
      if(sql.includes("SELECT current_turn FROM guilds"))return{rows:[{current_turn:48}],rowCount:1};
      if(sql.includes("SELECT name FROM dynasty_members"))return{rows:[{name:"Hanno"}],rowCount:1};
      if(sql.includes("SELECT 1 FROM dynasty_marriage_proposals"))return{rows:[],rowCount:0};
      if(sql.includes("INSERT INTO dynasty_members")){writes.push({sql,params});return{rows:[{id:ids.spouse}],rowCount:1};}
      if(sql.includes("UPDATE dynasty_members SET spouse_id=$1,roman_spouse_id=NULL")){writes.push({sql,params});return{rows:[],rowCount:1};}
      if(sql.includes("INSERT INTO dynasty_events")){writes.push({sql,params});return{rows:[],rowCount:1};}
      throw new Error("Unexpected query: "+sql);
    }} as unknown as DbClient;

    const candidate=localNobleMarriageCandidates({
      dynastyId:ids.dynasty,memberId:ids.member,memberGender:"MALE",memberAge:30,
      cultureGroup:"PUNIC",currentTurn:48,usedNames:["Hanno"]
    })[0]!;
    const result=await dynastyService.marryLocalNoble({
      guildId:"guild",countryId:ids.country,dynastyId:ids.dynasty,memberId:ids.member,
      candidateKey:candidate.key,actorId:"player"
    });

    expect(result.spouseName).toBe(candidate.name);
    expect(result.spouseGender).toBe("FEMALE");
    expect(NOBLE_TRAIT_KEYS).toContain(result.traitKey);
    const insertion=writes.find((write)=>write.sql.includes("INSERT INTO dynasty_members"))!;
    expect(insertion.params.slice(0,7)).toEqual([
      ids.dynasty,candidate.name,"FEMALE",candidate.age,"Soylu Hanım",ids.member,48-candidate.age
    ]);
    expect(insertion.params[7]).toBe(result.traitKey);
    expect(writes.some((write)=>write.sql.includes("UPDATE dynasty_members SET spouse_id=$1"))).toBe(true);
    expect(String(writes.find((write)=>write.sql.includes("INSERT INTO dynasty_events"))?.params[4])).toContain("PLAYER_LOCAL_NOBLE");
  });
});
