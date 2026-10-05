import { beforeEach,describe,expect,it,vi } from "vitest";
import type { DbClient } from "../db/pool.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));

vi.mock("../db/pool.js",()=>(
  {
    pool:{},
    withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!)
  }
));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import { battleService } from "./battle-service.js";

describe("unopposed siege publication",()=>{
  beforeEach(()=>{transaction.client=null;});

  it("finishes in favor of the attacker when the settlement has no defense",async()=>{
    const queries:Array<{sql:string;params?:unknown[]}>=[];
    const battle:any={
      id:"battle-1",guild_id:"guild-1",channel_id:"channel-1",public_message_id:null,terrain:"SIEGE",narrative:"",
      status:"DRAFT",round_number:1,first_side:"A",winner_side:null,finish_reason:null,
      wall_max_hp:30000,wall_current_hp:30000,gate_max_hp:1000,gate_current_hp:1000,siege_phase:"BOMBARDMENT",
      bombardment_round:0,defender_settlement_id:"city-1",starvation_capacity:4,starvation_remaining:4,last_starvation_turn:24,
      defender_pantheon_pressure_used:false,guardian_pressure_ignored_a:false,guardian_pressure_ignored_b:false,
      bombardment_revealed:false,assault_revealed:false,losses_applied_at:null,created_by:"gm-1",created_at:new Date(),updated_at:new Date()
    };
    const sides=[
      {battle_id:"battle-1",side_key:"A",country_id:"attacker",country_name:"Roma",controller:"PLAYERS",composition:{heavy_infantry:1000},initial_composition:{},initial_total:1000,current_total:1000,total_losses:0,pressure:0,support_assets:{},support_enhanced:{},support_targets:{},temporary_militia:0,seal:"A"},
      {battle_id:"battle-1",side_key:"B",country_id:"defender",country_name:"Savunucu",controller:"PLAYERS",composition:{},initial_composition:{},initial_total:0,current_total:0,total_losses:0,pressure:0,support_assets:{},support_enhanced:{},support_targets:{},temporary_militia:0,seal:"B"}
    ];
    const participants=[
      {battle_id:"battle-1",side_key:"A",country_id:"attacker",country_name:"Roma",is_primary:true,source_settlement_id:null,source_settlement_name:null,composition:{heavy_infantry:1000},initial_composition:{},dismounted_composition:{}},
      {battle_id:"battle-1",side_key:"B",country_id:"defender",country_name:"Savunucu",is_primary:true,source_settlement_id:null,source_settlement_name:null,composition:{},initial_composition:{},dismounted_composition:{}}
    ];
    const client={async query(sql:string,params?:unknown[]){
      queries.push({sql,params});
      if(sql.includes("SELECT * FROM battles WHERE guild_id=$1"))return {rows:[battle],rowCount:1};
      if(sql.startsWith("SELECT * FROM battles WHERE id=$1"))return {rows:[battle],rowCount:1};
      if(sql.includes("SELECT bs.*,c.name AS country_name"))return {rows:sides,rowCount:2};
      if(sql.includes("SELECT bsp.*,c.name AS country_name"))return {rows:participants,rowCount:2};
      if(sql.includes("FROM battle_rolls"))return {rows:[],rowCount:0};
      if(sql.includes("FROM battle_rounds"))return {rows:[],rowCount:0};
      if(sql.includes("COUNT(bb.battle_id)::integer AS used"))return {rows:[{current_turn:24,army_composition_activation_turn:null,used:0}],rowCount:1};
      if(sql.includes("FROM settlement_policies"))return {rows:[],rowCount:0};
      if(sql.includes("SELECT c.active_formable_key"))return {rows:[{active_formable_key:null,curia_level:0}],rowCount:1};
      if(sql.includes("UPDATE battles SET status='FINISHED'")){
        battle.status="FINISHED";battle.winner_side="A";battle.finish_reason=String(params?.[0]??"");battle.losses_applied_at=new Date();
        return {rows:[],rowCount:1};
      }
      if(sql.startsWith("UPDATE battle_sides SET initial_composition")||sql.startsWith("UPDATE battle_side_participants SET initial_composition")||sql.includes("INSERT INTO audit_logs"))return {rows:[],rowCount:1};
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    transaction.client=client;

    const view=await battleService.publish({guildId:"guild-1",channelId:"channel-1",actorId:"gm-1"});

    expect(view.battle.status).toBe("FINISHED");
    expect(view.battle.winner_side).toBe("A");
    expect(view.battle.finish_reason).toContain("çatışmasız ele geçirildi");
    expect(queries.some(({sql})=>sql.includes("battle.siege.unopposed"))).toBe(true);
    expect(queries.some(({sql})=>sql.includes("status='WAITING_FIRST_ROLL'"))).toBe(false);
  });
});
