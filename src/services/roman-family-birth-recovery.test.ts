import {describe,expect,it,vi} from "vitest";
import type {DbClient} from "../db/pool.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));
vi.mock("../db/pool.js",()=>({
  pool:{query:vi.fn()},
  withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!)
}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));
vi.mock("./roman-family-access.js",()=>({
  romanFamilyMembership:vi.fn(async()=>({familyId:"family",isLeader:true}))
}));

import {romanFamilyLifeService} from "./roman-family-life-service.js";

describe("Roma aile doğum adlandırma kurtarma",()=>{
  it("isim verilmeden kaybolan geçici mesajı yeni zar atmadan geri açar",async()=>{
    const queries:string[]=[];
    transaction.client={query:async(sql:string)=>{
      queries.push(sql);
      if(sql.includes("FROM roman_republics republic"))return{rows:[{id:"republic",country_id:"country",current_turn:42}],rowCount:1};
      if(sql.includes("FROM roman_family_members member"))return{rows:[{
        id:"father",family_id:"family",family_name:"Nero ailesi",name:"Tiberius Claudius Nero",
        gender:"MALE",age:31,position:"HEAD",relation:"Aile reisi",spouse_id:"mother",status:"ALIVE",
        health:"HEALTHY",sick_until_turn:null
      }],rowCount:1};
      if(sql.includes("FROM roman_family_birth_sessions session"))return{rows:[{
        id:"pending-birth",attempt_roll:18,age_modifier:3,gender:"FEMALE",gender_roll:2,
        complication:"HEALTHY",complication_roll:12,mother_name:"Valeria Antonia",father_name:"Tiberius Claudius Nero"
      }],rowCount:1};
      throw new Error("Beklenmeyen sorgu: "+sql);
    }} as unknown as DbClient;

    const result=await romanFamilyLifeService.attemptBirth({
      guildId:"guild",countryId:"country",actorId:"nero-player",parentMember:"father",gameMaster:false
    });

    expect(result).toMatchObject({
      success:true,resumed:true,pendingBirthId:"pending-birth",childGender:"FEMALE",
      motherName:"Valeria Antonia",fatherName:"Tiberius Claudius Nero"
    });
    expect(queries.some((sql)=>sql.includes("roman_family_couple_birth_attempts"))).toBe(false);
    expect(queries.some((sql)=>sql.includes("INSERT INTO roman_family_birth_sessions"))).toBe(false);
  });
});
