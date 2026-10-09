import {describe,expect,it,vi} from "vitest";
import type {DbClient} from "../db/pool.js";

vi.mock("../db/pool.js",()=>({pool:{query:vi.fn()},withTransaction:vi.fn()}));

import {processRomanFamilyLifecycle} from "./roman-republic-turn-service.js";

describe("Roma tur ilerlet aile otomasyonu",()=>{
  it("oyuncusuz ailede çocuğu kaydeder, ardından uygun NPC üyelerini otomatik evlendirir",async()=>{
    const writes:string[]=[];
    const client={async query(sql:string,params:unknown[]=[]){
      if(sql.includes("SELECT family.id,family.name,family.republic_id"))return{rows:[
        {id:"f1",name:"Magnus ailesi",republic_id:"republic",player_count:0},
        {id:"f2",name:"Nero ailesi",republic_id:"republic",player_count:0}
      ],rowCount:2};
      if(sql.includes("INSERT INTO roman_family_lifecycle_runs"))return{rows:[{family_id:params[0]}],rowCount:1};
      if(sql.includes("SET health='HEALTHY'"))return{rows:[],rowCount:0};
      if(sql.includes("SET age=LEAST"))return{rows:[{id:"aged"}],rowCount:1};
      if(sql.includes("SELECT mother.id AS mother_id"))return params[0]==="f1"?{rows:[{
        mother_id:"mother",mother_name:"Aurelia Marcia",mother_age:31,mother_position:"SPOUSE",
        father_id:"father",father_name:"Lucius Cornelius Magnus",father_position:"HEAD"
      }],rowCount:1}:{rows:[],rowCount:0};
      if(sql.includes("SELECT name FROM roman_family_members WHERE family_id"))return{rows:[],rowCount:0};
      if(sql.includes("SELECT last_attempt_turn FROM roman_family_couple_birth_attempts"))return{rows:[],rowCount:0};
      if(sql.includes("INSERT INTO roman_family_couple_birth_attempts")){writes.push("birth-attempt");return{rows:[],rowCount:1};}
      if(sql.includes("INSERT INTO roman_family_members(")){writes.push("child");return{rows:[{id:"child"}],rowCount:1};}
      if(sql.includes("COALESCE(member.birth_family_id"))return{rows:[
        {id:"eligible-man",family_id:"f1",gender:"MALE",age:24,position:"CHILD",birth_family_id:"f1",
          mother_id:null,father_id:null,name:"Gaius Magnus",family_name:"Magnus ailesi",republic_id:"republic"},
        {id:"eligible-woman",family_id:"f2",gender:"FEMALE",age:22,position:"CHILD",birth_family_id:"f2",
          mother_id:null,father_id:null,name:"Claudia Nero",family_name:"Nero ailesi",republic_id:"republic"}
      ],rowCount:2};
      if(sql.includes("INSERT INTO roman_family_marriage_proposals")){writes.push("accepted-proposal");return{rows:[{id:"proposal"}],rowCount:1};}
      if(sql.includes("SET spouse_id=$1")&&!sql.includes("birth_family_id")){writes.push("husband-linked");return{rows:[],rowCount:1};}
      if(sql.includes("birth_family_id=COALESCE")){writes.push("wife-transferred");return{rows:[],rowCount:1};}
      if(sql.includes("SELECT COALESCE(MAX(sort_order)"))return{rows:[{next_order:7}],rowCount:1};
      if(sql.includes("INSERT INTO roman_republic_events")){writes.push("event");return{rows:[],rowCount:1};}
      if(sql.includes("UPDATE roman_family_lifecycle_runs"))return{rows:[],rowCount:1};
      throw new Error("Beklenmeyen sorgu: "+sql);
    }} as unknown as DbClient;
    const randomInteger=vi.fn((minimum:number,maximum:number)=>{
      if(minimum===1&&maximum===21)return 20;
      if(minimum===1&&maximum===3)return 1;
      return 0;
    });

    const details=await processRomanFamilyLifecycle(client,"guild",40,randomInteger);

    expect(writes).toEqual(expect.arrayContaining([
      "birth-attempt","child","accepted-proposal","husband-linked","wife-transferred"
    ]));
    expect(details.find((item)=>item.familyName==="Magnus ailesi")).toMatchObject({birthAttempts:1,births:1});
    expect(details.find((item)=>item.familyName==="Magnus ailesi")?.events).toEqual(expect.arrayContaining([
      expect.stringContaining("Gaius Cornelius Magnus doğdu"),
      expect.stringContaining("otomatik olarak evlendi")
    ]));
    expect(details.find((item)=>item.familyName==="Nero ailesi")?.events).toEqual([
      expect.stringContaining("otomatik olarak evlendi")
    ]);
  });

  it("oyuncusu bulunan ailede otomatik çocuk denemesi ve evlilik adayı üretmez",async()=>{
    const sqlLog:string[]=[];
    const client={async query(sql:string,params:unknown[]=[]){
      sqlLog.push(sql);
      if(sql.includes("SELECT family.id,family.name,family.republic_id"))return{rows:[
        {id:"player-family",name:"Scipio ailesi",republic_id:"republic",player_count:1}
      ],rowCount:1};
      if(sql.includes("INSERT INTO roman_family_lifecycle_runs"))return{rows:[{family_id:params[0]}],rowCount:1};
      if(sql.includes("SET age=LEAST"))return{rows:[{id:"member"}],rowCount:1};
      if(sql.includes("COALESCE(member.birth_family_id"))return{rows:[],rowCount:0};
      return{rows:[],rowCount:1};
    }} as unknown as DbClient;

    const details=await processRomanFamilyLifecycle(client,"guild",40,()=>0);

    expect(details).toEqual([{familyName:"Scipio ailesi",agedMembers:1,birthAttempts:0,births:0,events:[]}]);
    expect(sqlLog.some((sql)=>sql.includes("INSERT INTO roman_family_couple_birth_attempts"))).toBe(false);
    expect(sqlLog.some((sql)=>sql.includes("INSERT INTO roman_family_marriage_proposals"))).toBe(false);
    expect(sqlLog.find((sql)=>sql.includes("COALESCE(member.birth_family_id"))).toContain("NOT ILIKE '%köle%'");
  });

  it("aynı aile turu daha önce işlendiyse tekrar otomatik evlilik üretmez",async()=>{
    let proposalWrites=0;
    const client={async query(sql:string){
      if(sql.includes("SELECT family.id,family.name,family.republic_id"))return{rows:[
        {id:"f1",name:"Magnus ailesi",republic_id:"republic",player_count:0},
        {id:"f2",name:"Nero ailesi",republic_id:"republic",player_count:0}
      ],rowCount:2};
      if(sql.includes("INSERT INTO roman_family_lifecycle_runs"))return{rows:[],rowCount:0};
      if(sql.includes("COALESCE(member.birth_family_id"))return{rows:[
        {id:"man",family_id:"f1",gender:"MALE",age:24,position:"CHILD",birth_family_id:"f1",
          mother_id:null,father_id:null,name:"Gaius",family_name:"Magnus ailesi",republic_id:"republic"},
        {id:"woman",family_id:"f2",gender:"FEMALE",age:22,position:"CHILD",birth_family_id:"f2",
          mother_id:null,father_id:null,name:"Claudia",family_name:"Nero ailesi",republic_id:"republic"}
      ],rowCount:2};
      if(sql.includes("INSERT INTO roman_family_marriage_proposals"))proposalWrites+=1;
      return{rows:[],rowCount:0};
    }} as unknown as DbClient;

    expect(await processRomanFamilyLifecycle(client,"guild",40,()=>0)).toEqual([]);
    expect(proposalWrites).toBe(0);
  });
});
