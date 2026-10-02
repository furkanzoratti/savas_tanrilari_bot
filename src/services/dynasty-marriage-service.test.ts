import {describe,expect,it,vi} from "vitest";
import type {DbClient} from "../db/pool.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));
vi.mock("../db/pool.js",()=>({
  pool:{query:vi.fn()},
  withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!)
}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import {dynastyService} from "./dynasty-service.js";

const ids={
  leftCountry:"11111111-1111-4111-8111-111111111111",
  rightCountry:"22222222-2222-4222-8222-222222222222",
  leftDynasty:"33333333-3333-4333-8333-333333333333",
  rightDynasty:"44444444-4444-4444-8444-444444444444",
  leftMember:"55555555-5555-4555-8555-555555555555",
  rightMember:"66666666-6666-4666-8666-666666666666",
  proposal:"77777777-7777-4777-8777-777777777777"
};

function fixture(){
  const writes:string[]=[];
  const proposal={
    id:ids.proposal,guild_id:"guild",proposer_country_id:ids.leftCountry,target_country_id:ids.rightCountry,
    proposer_member_id:ids.leftMember,target_member_id:ids.rightMember,status:"PENDING",created_turn:28,
    resolved_turn:null,created_by:"left-player",resolved_by:null,created_at:new Date(),resolved_at:null,
    proposer_country_name:"Britanya",target_country_name:"Medya",proposer_member_name:"Arsen",target_member_name:"Atossa"
  };
  const member=(left:boolean)=>({
    id:left?ids.leftMember:ids.rightMember,name:left?"Arsen":"Atossa",gender:left?"MALE":"FEMALE",age:30,
    title:left?"Prens":"Prenses",relation:"Hanedan üyesi",status:"ALIVE",health:"HEALTHY",sick_until_turn:null,
    is_monarch:false,is_heir:false,succession_rank:1,spouse_id:null,spouse_name:null,spouse_title:null,spouse_age:null,
    spouse_country_name:null,mother_id:null,mother_name:null,father_id:null,father_name:null,born_turn:0,died_turn:null,
    death_reason:null,dynasty_id:left?ids.leftDynasty:ids.rightDynasty,guild_id:"guild",
    country_id:left?ids.leftCountry:ids.rightCountry,country_name:left?"Britanya":"Medya",dynasty_name:left?"York":"Astiyagid"
  });
  transaction.client={query:async(sql:string,params:unknown[]=[])=>{
    if(sql.includes("pg_advisory_xact_lock"))return{rows:[],rowCount:1};
    if(sql.includes("SELECT id,name FROM countries")){
      const left=params[0]===ids.leftCountry;
      return{rows:[{id:params[0],name:left?"Britanya":"Medya"}],rowCount:1};
    }
    if(sql.includes("FROM dynasty_members member")&&sql.includes("JOIN dynasties dynasty")){
      const left=params[0]===ids.leftMember;
      return{rows:[member(left)],rowCount:1};
    }
    if(sql.includes("SELECT 1 FROM dynasty_marriage_proposals"))return{rows:[],rowCount:0};
    if(sql.includes("SELECT current_turn FROM guilds"))return{rows:[{current_turn:28}],rowCount:1};
    if(sql.includes("INSERT INTO dynasty_marriage_proposals"))return{rows:[{id:ids.proposal}],rowCount:1};
    if(sql.includes("FROM dynasty_marriage_proposals proposal"))return{rows:[proposal],rowCount:1};
    if(sql.includes("UPDATE dynasty_members SET spouse_id=")){writes.push("spouse");return{rows:[],rowCount:1};}
    if(sql.includes("INSERT INTO dynasty_events")){writes.push("event");return{rows:[],rowCount:1};}
    if(sql.includes("SET status='CANCELLED'")){writes.push("cancel");return{rows:[],rowCount:1};}
    if(sql.includes("SET status='ACCEPTED'")){writes.push("accept");return{rows:[],rowCount:1};}
    throw new Error("Unexpected query: "+sql);
  }} as unknown as DbClient;
  return{writes};
}

describe("ülkeler arası hanedan evliliği",()=>{
  it("teklif kabul edilmeden eş bağı kurmaz, kabulde iki hanedana birden işler",async()=>{
    const {writes}=fixture();
    const proposal=await dynastyService.proposeMarriage({
      guildId:"guild",proposerCountryId:ids.leftCountry,targetCountryId:ids.rightCountry,
      proposerMemberId:ids.leftMember,targetMemberId:ids.rightMember,actorId:"left-player"
    });
    expect(proposal.status).toBe("PENDING");
    expect(writes).toEqual([]);

    const result=await dynastyService.respondMarriage({
      guildId:"guild",responderCountryId:ids.rightCountry,proposalId:ids.proposal,actorId:"right-player",decision:"ACCEPT"
    });
    expect(result.proposal.status).toBe("ACCEPTED");
    expect(result.dynastyIds).toEqual([ids.leftDynasty,ids.rightDynasty]);
    expect(writes.filter((item)=>item==="spouse")).toHaveLength(2);
    expect(writes.filter((item)=>item==="event")).toHaveLength(2);
    expect(writes).toContain("accept");
  });
});
