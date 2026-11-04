import type { DbClient } from "../db/pool.js";
import type { BattleUnitType, NavalUnitType } from "../domain/battle.js";

const SYSTEM_ACTOR = "SYSTEM_TURN_ADVANCE";

function formationName(settlementName:string,turn:number,kind:"ARMY"|"FLEET",sequence=1):string{
  const counter=sequence>1?` #${sequence}`:"";
  const suffix=(kind==="ARMY"?` • Tur ${turn} Eğitim Ordusu`:` • Tur ${turn} Üretim Filosu`)+counter;
  const available=Math.max(2,60-suffix.length);
  return `${settlementName.trim().slice(0,available).trim()}${suffix}`;
}

async function availableFormationName(
  client:DbClient,table:"armies"|"fleets",countryId:string,settlementName:string,turn:number,kind:"ARMY"|"FLEET"
):Promise<string>{
  for(let sequence=1;sequence<=100;sequence+=1){
    const candidate=formationName(settlementName,turn,kind,sequence);
    const taken=(await client.query<{taken:boolean}>(
      `SELECT EXISTS(SELECT 1 FROM ${table} WHERE country_id=$1 AND lower(name)=lower($2)) AS taken`,
      [countryId,candidate]
    )).rows[0]?.taken??false;
    if(!taken)return candidate;
  }
  throw new Error("Otomatik eğitim birliği için benzersiz ad üretilemedi.");
}

export async function assignCompletedTrainingToArmy(client:DbClient,input:{
  guildId:string;countryId:string;settlementId:string;settlementName:string;turn:number;
  unitType:BattleUnitType;quantity:number;actorId?:string;
}):Promise<{id:string;name:string}>{
  const existing=(await client.query<{id:string;name:string}>(
    `SELECT id,name FROM armies
      WHERE country_id=$1 AND origin_settlement_id=$2 AND completion_turn=$3 AND formation_kind='TRAINING'
      FOR UPDATE`,[input.countryId,input.settlementId,input.turn]
  )).rows[0];
  const name=existing?.name??await availableFormationName(client,"armies",input.countryId,input.settlementName,input.turn,"ARMY");
  const army=(await client.query<{id:string;name:string}>(
    `INSERT INTO armies(guild_id,country_id,name,created_turn,created_by,formation_kind,origin_settlement_id,completion_turn)
     VALUES($1,$2,$3,$4,$5,'TRAINING',$6,$4)
     ON CONFLICT(country_id,origin_settlement_id,completion_turn)
       WHERE formation_kind='TRAINING' AND origin_settlement_id IS NOT NULL AND completion_turn IS NOT NULL
     DO UPDATE SET updated_at=NOW()
     RETURNING id,name`,
    [input.guildId,input.countryId,name,input.turn,input.actorId??SYSTEM_ACTOR,input.settlementId]
  )).rows[0]!;
  await client.query(
    `INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(army_id,settlement_id,unit_type) DO UPDATE
       SET quantity=army_units.quantity+EXCLUDED.quantity,
           origin_settlement_name=EXCLUDED.origin_settlement_name`,
    [army.id,input.settlementId,input.settlementName,input.unitType,input.quantity]
  );
  await client.query(
    `INSERT INTO army_map_positions(army_id,hex_id,arrived_turn)
     SELECT $1,position.hex_id,$2 FROM settlement_map_positions position WHERE position.settlement_id=$3
     ON CONFLICT(army_id) DO NOTHING`,
    [army.id,input.turn,input.settlementId]
  );
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'army.training.complete','army',$3,$4::jsonb)`,
    [input.guildId,input.actorId??SYSTEM_ACTOR,army.id,JSON.stringify({
      countryId:input.countryId,settlementId:input.settlementId,settlementName:input.settlementName,
      completionTurn:input.turn,unitType:input.unitType,quantity:input.quantity,formationName:army.name
    })]
  );
  return army;
}

export async function assignCompletedShipsToFleet(client:DbClient,input:{
  guildId:string;countryId:string;settlementId:string;settlementName:string;turn:number;
  shipType:NavalUnitType;quantity:number;actorId?:string;
}):Promise<{id:string;name:string}>{
  const existing=(await client.query<{id:string;name:string}>(
    `SELECT id,name FROM fleets
      WHERE country_id=$1 AND origin_settlement_id=$2 AND completion_turn=$3 AND formation_kind='TRAINING'
      FOR UPDATE`,[input.countryId,input.settlementId,input.turn]
  )).rows[0];
  const name=existing?.name??await availableFormationName(client,"fleets",input.countryId,input.settlementName,input.turn,"FLEET");
  const fleet=(await client.query<{id:string;name:string}>(
    `INSERT INTO fleets(guild_id,country_id,name,created_turn,created_by,formation_kind,origin_settlement_id,completion_turn)
     VALUES($1,$2,$3,$4,$5,'TRAINING',$6,$4)
     ON CONFLICT(country_id,origin_settlement_id,completion_turn)
       WHERE formation_kind='TRAINING' AND origin_settlement_id IS NOT NULL AND completion_turn IS NOT NULL
     DO UPDATE SET updated_at=NOW()
     RETURNING id,name`,
    [input.guildId,input.countryId,name,input.turn,input.actorId??SYSTEM_ACTOR,input.settlementId]
  )).rows[0]!;
  await client.query(
    `INSERT INTO fleet_ships(fleet_id,settlement_id,ship_type,quantity)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(fleet_id,settlement_id,ship_type) DO UPDATE
       SET quantity=fleet_ships.quantity+EXCLUDED.quantity`,
    [fleet.id,input.settlementId,input.shipType,input.quantity]
  );
  await client.query(
    `INSERT INTO fleet_map_positions(fleet_id,hex_id,arrived_turn)
     SELECT $1,sea.hex_id,$2
     FROM settlement_map_positions position
     JOIN LATERAL (
       SELECT edge.to_hex_id AS hex_id FROM map_hex_edges edge
       JOIN map_hexes target ON target.id=edge.to_hex_id
       WHERE edge.from_hex_id=position.hex_id AND target.domain='SEA' AND target.passable=TRUE
       ORDER BY edge.movement_cost,target.coordinate LIMIT 1
     ) sea ON TRUE
     WHERE position.settlement_id=$3
     ON CONFLICT(fleet_id) DO NOTHING`,
    [fleet.id,input.turn,input.settlementId]
  );
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'fleet.training.complete','fleet',$3,$4::jsonb)`,
    [input.guildId,input.actorId??SYSTEM_ACTOR,fleet.id,JSON.stringify({
      countryId:input.countryId,settlementId:input.settlementId,settlementName:input.settlementName,
      completionTurn:input.turn,shipType:input.shipType,quantity:input.quantity,formationName:fleet.name
    })]
  );
  return fleet;
}
