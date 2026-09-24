import type { DbClient } from "../db/pool.js";
import type { BattleComposition,BattleSideKey,NavalUnitType } from "../domain/battle.js";
import { NAVAL_HULL_STATS,applyNavalHullDamage,isHullOperational,type NavalHullState } from "../domain/naval-hulls.js";

interface BattleHullRow {
  id:string;battle_id:string;side_key:BattleSideKey;country_id:string;fleet_id:string|null;
  settlement_id:string|null;ship_type:NavalUnitType;max_hp:number;current_hp:number;
  disabled_round:number|null;sunk_round:number|null;damage_record_id:string|null;
}

function toState(row:BattleHullRow):NavalHullState{
  return {id:row.id,shipType:row.ship_type,maxHp:Number(row.max_hp),currentHp:Number(row.current_hp),
    disabledRound:row.disabled_round===null?null:Number(row.disabled_round),
    sunkRound:row.sunk_round===null?null:Number(row.sunk_round)};
}

async function insertHull(client:DbClient,input:{
  battleId:string;side:BattleSideKey;countryId:string;fleetId:string|null;settlementId:string|null;
  shipType:NavalUnitType;currentHp:number;damageRecordId:string|null;disabledRound:number|null;
}):Promise<void>{
  const stats=NAVAL_HULL_STATS[input.shipType];
  await client.query(`INSERT INTO battle_ship_hulls(
    battle_id,side_key,country_id,fleet_id,settlement_id,ship_type,max_hp,current_hp,disabled_round,damage_record_id
  ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[
    input.battleId,input.side,input.countryId,input.fleetId,input.settlementId,input.shipType,
    stats.maxHp,input.currentHp,input.disabledRound,input.damageRecordId
  ]);
}

export async function initializeBattleShipHulls(client:DbClient,battleId:string):Promise<void>{
  if((await client.query("SELECT 1 FROM battle_ship_hulls WHERE battle_id=$1 LIMIT 1",[battleId])).rowCount)return;
  const sides=(await client.query<{
    side_key:BattleSideKey;country_id:string;composition:BattleComposition;
  }>("SELECT side_key,country_id,composition FROM battle_sides WHERE battle_id=$1 ORDER BY side_key FOR UPDATE",[battleId])).rows;
  const assignedBySide:Record<BattleSideKey,BattleComposition>={A:{},B:{}};
  const allocations=(await client.query<{
    side_key:BattleSideKey;country_id:string;fleet_id:string;settlement_id:string;
    ship_type:NavalUnitType;quantity:number;
  }>(`SELECT assignment.side_key,assignment.country_id,assignment.fleet_id,ships.settlement_id,
            ships.ship_type,ships.quantity
       FROM battle_fleet_assignments assignment JOIN fleet_ships ships ON ships.fleet_id=assignment.fleet_id
      WHERE assignment.battle_id=$1 ORDER BY assignment.side_key,assignment.fleet_id,ships.settlement_id,ships.ship_type
      FOR UPDATE OF ships`,[battleId])).rows;
  for(const allocation of allocations){
    const quantity=Number(allocation.quantity);
    assignedBySide[allocation.side_key][allocation.ship_type]=
      (assignedBySide[allocation.side_key][allocation.ship_type]??0)+quantity;
    const damaged=(await client.query<{
      id:string;current_hp:number;max_hp:number;status:"DAMAGED"|"DISABLED";
    }>(`SELECT id,current_hp,max_hp,status FROM naval_ship_damage
        WHERE fleet_id=$1 AND settlement_id=$2 AND ship_type=$3 AND status IN ('DAMAGED','DISABLED')
        ORDER BY current_hp,id FOR UPDATE`,[
          allocation.fleet_id,allocation.settlement_id,allocation.ship_type
        ])).rows.slice(0,quantity);
    for(const ship of damaged)await insertHull(client,{
      battleId,side:allocation.side_key,countryId:allocation.country_id,fleetId:allocation.fleet_id,
      settlementId:allocation.settlement_id,shipType:allocation.ship_type,currentHp:Number(ship.current_hp),
      damageRecordId:ship.id,disabledRound:ship.status==="DISABLED"?0:null
    });
    for(let index=damaged.length;index<quantity;index+=1)await insertHull(client,{
      battleId,side:allocation.side_key,countryId:allocation.country_id,fleetId:allocation.fleet_id,
      settlementId:allocation.settlement_id,shipType:allocation.ship_type,
      currentHp:NAVAL_HULL_STATS[allocation.ship_type].maxHp,damageRecordId:null,disabledRound:null
    });
  }
  for(const side of sides){
    for(const shipType of Object.keys(NAVAL_HULL_STATS) as NavalUnitType[]){
      const unassigned=Math.max(0,Number(side.composition?.[shipType]??0)-Number(assignedBySide[side.side_key][shipType]??0));
      for(let index=0;index<unassigned;index+=1)await insertHull(client,{
        battleId,side:side.side_key,countryId:side.country_id,fleetId:null,settlementId:null,shipType,
        currentHp:NAVAL_HULL_STATS[shipType].maxHp,damageRecordId:null,disabledRound:null
      });
    }
  }
}

async function hullRows(client:DbClient,battleId:string,side:BattleSideKey,lock=false):Promise<BattleHullRow[]>{
  return (await client.query<BattleHullRow>(`SELECT * FROM battle_ship_hulls
    WHERE battle_id=$1 AND side_key=$2 ORDER BY ship_type,current_hp,id${lock?" FOR UPDATE":""}`,[battleId,side])).rows;
}

function composition(rows:BattleHullRow[],mode:"ACTIVE"|"SURVIVING"):BattleComposition{
  const result:BattleComposition={};
  for(const row of rows){
    const state=toState(row);
    const included=mode==="ACTIVE"?isHullOperational(state):state.sunkRound===null&&state.currentHp>0;
    if(included)result[row.ship_type]=(result[row.ship_type]??0)+1;
  }
  return result;
}

export async function battleHullComposition(
  client:DbClient,battleId:string,side:BattleSideKey,mode:"ACTIVE"|"SURVIVING"
):Promise<BattleComposition>{
  await initializeBattleShipHulls(client,battleId);
  return composition(await hullRows(client,battleId,side),mode);
}

export async function applyBattleHullDamage(client:DbClient,input:{
  battleId:string;side:BattleSideKey;rawDamage:number;round:number;
}):Promise<{active:BattleComposition;surviving:BattleComposition;newlyDisabled:number;newlySunk:number}>{
  await initializeBattleShipHulls(client,input.battleId);
  const rows=await hullRows(client,input.battleId,input.side,true);
  const result=applyNavalHullDamage(rows.map(toState),input.rawDamage,input.round);
  const byId=new Map(result.hulls.map((hull)=>[hull.id,hull]));
  for(const row of rows){
    const hull=byId.get(row.id)!;
    if(hull.currentHp===Number(row.current_hp)&&hull.disabledRound===row.disabled_round&&hull.sunkRound===row.sunk_round)continue;
    await client.query(`UPDATE battle_ship_hulls SET current_hp=$1,disabled_round=$2,sunk_round=$3 WHERE id=$4`,[
      hull.currentHp,hull.disabledRound,hull.sunkRound,row.id
    ]);
    row.current_hp=hull.currentHp;row.disabled_round=hull.disabledRound;row.sunk_round=hull.sunkRound;
  }
  return {active:composition(rows,"ACTIVE"),surviving:composition(rows,"SURVIVING"),
    newlyDisabled:result.newlyDisabled,newlySunk:result.newlySunk};
}

export async function applyBattleRetreatLoss(client:DbClient,input:{
  battleId:string;side:BattleSideKey;quantity:number;round:number;
}):Promise<{active:BattleComposition;surviving:BattleComposition;disabled:number;sunk:number}>{
  await initializeBattleShipHulls(client,input.battleId);
  const rows=await hullRows(client,input.battleId,input.side,true);
  const candidates=rows.filter((row)=>row.sunk_round===null&&Number(row.current_hp)>0)
    .sort((a,b)=>{
      const aDisabled=a.disabled_round!==null&&a.disabled_round<input.round?0:1;
      const bDisabled=b.disabled_round!==null&&b.disabled_round<input.round?0:1;
      return aDisabled-bDisabled||Number(a.current_hp)-Number(b.current_hp)||a.id.localeCompare(b.id);
    }).slice(0,Math.max(0,Math.floor(input.quantity)));
  let disabled=0,sunk=0;
  for(const row of candidates){
    if(row.disabled_round!==null&&row.disabled_round<input.round){
      row.current_hp=0;row.sunk_round=input.round;sunk+=1;
    }else{
      row.current_hp=Math.max(1,Math.min(Number(row.current_hp),NAVAL_HULL_STATS[row.ship_type].disabledAtHp));
      row.disabled_round=input.round;disabled+=1;
    }
    await client.query("UPDATE battle_ship_hulls SET current_hp=$1,disabled_round=$2,sunk_round=$3 WHERE id=$4",
      [row.current_hp,row.disabled_round,row.sunk_round,row.id]);
  }
  return {active:composition(rows,"ACTIVE"),surviving:composition(rows,"SURVIVING"),disabled,sunk};
}

export async function persistBattleHullDamage(client:DbClient,battleId:string):Promise<void>{
  const rows=(await client.query<BattleHullRow>(`SELECT * FROM battle_ship_hulls
    WHERE battle_id=$1 AND fleet_id IS NOT NULL AND settlement_id IS NOT NULL ORDER BY id FOR UPDATE`,[battleId])).rows;
  for(const row of rows){
    if(row.sunk_round!==null||Number(row.current_hp)<=0){
      if(row.damage_record_id)await client.query("DELETE FROM naval_ship_damage WHERE id=$1",[row.damage_record_id]);
      continue;
    }
    if(Number(row.current_hp)>=Number(row.max_hp)){
      if(row.damage_record_id)await client.query("DELETE FROM naval_ship_damage WHERE id=$1",[row.damage_record_id]);
      continue;
    }
    const status=row.disabled_round===null?"DAMAGED":"DISABLED";
    if(row.damage_record_id){
      await client.query(`UPDATE naval_ship_damage SET current_hp=$1,max_hp=$2,status=$3,
        source_battle_id=$4,updated_at=NOW() WHERE id=$5`,[
          row.current_hp,row.max_hp,status,battleId,row.damage_record_id
        ]);
    }else{
      const guildId=(await client.query<{guild_id:string}>("SELECT guild_id FROM battles WHERE id=$1",[battleId])).rows[0]?.guild_id;
      if(!guildId)continue;
      await client.query(`INSERT INTO naval_ship_damage(
        guild_id,country_id,settlement_id,fleet_id,ship_type,max_hp,current_hp,status,source_battle_id
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[
        guildId,row.country_id,row.settlement_id,row.fleet_id,row.ship_type,row.max_hp,row.current_hp,status,battleId
      ]);
    }
  }
}
