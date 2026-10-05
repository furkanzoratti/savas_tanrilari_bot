import type { DbClient } from "../db/pool.js";

export const LAST_STAND_DURATION_TURNS=3;

export type LastStandStatus="ACTIVE"|"RECOVERED"|"FAILED";
export type LastStandEventKind="STARTED"|"ONGOING"|"RECOVERED"|"FAILED";

export interface LastStandEvent{
  kind:LastStandEventKind;
  countryId:string;
  countryName:string;
  startedTurn:number;
  deadlineTurn:number;
  remainingTurns:number;
  armyPersonnel:number;
  settlementName:string|null;
  reason:string|null;
  discordRoleId:string|null;
}

interface LastStandRow{
  country_id:string;
  country_name:string;
  discord_role_id:string|null;
  started_turn:number;
  deadline_turn:number;
  status:LastStandStatus;
}

export function lastStandDeadline(startedTurn:number):number{
  return Math.max(0,Math.floor(startedTurn))+LAST_STAND_DURATION_TURNS;
}

export function lastStandRemainingTurns(deadlineTurn:number,currentTurn:number):number{
  return Math.max(0,Math.floor(deadlineTurn)-Math.floor(currentTurn)+1);
}

async function armyPersonnel(client:DbClient,countryId:string):Promise<number>{
  return Number((await client.query<{total:number}>(
    `SELECT COALESCE(SUM(unit.quantity),0)::bigint AS total
       FROM army_units unit JOIN armies army ON army.id=unit.army_id
      WHERE army.country_id=$1`,[countryId]
  )).rows[0]?.total??0);
}

async function activeBattleCount(client:DbClient,countryId:string):Promise<number>{
  return Number((await client.query<{count:number}>(
    `SELECT COUNT(DISTINCT battle.id)::integer AS count
       FROM battles battle
      WHERE battle.status NOT IN('FINISHED','CANCELLED')
        AND EXISTS(
          SELECT 1 FROM battle_side_participants participant
           WHERE participant.battle_id=battle.id AND participant.country_id=$1
        )`,[countryId]
  )).rows[0]?.count??0);
}

export async function recordSettlementClaim(
  client:DbClient,countryId:string,settlementId:string,turn:number
):Promise<void>{
  await client.query(
    `INSERT INTO country_settlement_claims(country_id,settlement_id,first_owned_turn,last_owned_turn)
      VALUES($1,$2,$3,$3)
      ON CONFLICT(country_id,settlement_id) DO UPDATE
        SET last_owned_turn=EXCLUDED.last_owned_turn,updated_at=NOW()`,
    [countryId,settlementId,turn]
  );
}

async function eliminateCountry(
  client:DbClient,input:{guildId:string;countryId:string;countryName:string;turn:number;actorId:string;reason:string;discordRoleId:string|null}
):Promise<LastStandEvent>{
  await client.query(
    `UPDATE battles SET status='CANCELLED',finish_reason=$2,updated_at=NOW()
      WHERE status NOT IN('FINISHED','CANCELLED') AND EXISTS(
        SELECT 1 FROM battle_side_participants participant
         WHERE participant.battle_id=battles.id AND participant.country_id=$1
      )`,[input.countryId,input.reason]
  );
  await client.query(
    `UPDATE movement_orders SET status='CANCELLED',blocked_reason=$2,updated_at=NOW()
      WHERE status IN('DRAFT','SUBMITTED','IN_PROGRESS','BLOCKED') AND country_id=$1`,
    [input.countryId,input.reason]
  );
  await client.query(
    `UPDATE peace_offers SET status='CANCELLED',resolved_turn=$2,resolved_by='SYSTEM',resolved_at=NOW()
      WHERE status='PENDING' AND (proposer_country_id=$1 OR receiver_country_id=$1)`,
    [input.countryId,input.turn]
  );
  await client.query(
    `UPDATE state_war_invitations SET status='CANCELLED',responded_turn=$2,responded_by='SYSTEM',resolved_at=NOW()
      WHERE status='PENDING' AND (country_id=$1 OR invited_by_country_id=$1)`,
    [input.countryId,input.turn]
  );
  await client.query(
    `UPDATE state_wars SET status='ENDED',ended_turn=$2,ended_by='SYSTEM',ended_at=NOW(),
       winner_country_id=CASE WHEN attacker_country_id=$1 THEN defender_country_id ELSE attacker_country_id END,
       end_outcome=CASE WHEN attacker_country_id=$1 THEN 'DEFENDER_VICTORY' ELSE 'ATTACKER_VICTORY' END,
       end_description=$3
      WHERE status='ACTIVE' AND (attacker_country_id=$1 OR defender_country_id=$1)`,
    [input.countryId,input.turn,input.reason]
  );
  await client.query(
    `DELETE FROM state_war_participants participant USING state_wars war
      WHERE participant.war_id=war.id AND participant.country_id=$1 AND war.status='ACTIVE'`,
    [input.countryId]
  );
  await client.query("UPDATE country_alliances SET status=CASE WHEN status='ACTIVE' THEN 'ENDED' ELSE 'CANCELLED' END,ended_at=NOW() WHERE status IN('PENDING','ACTIVE') AND (proposer_country_id=$1 OR receiver_country_id=$1)",[input.countryId]);
  await client.query("UPDATE country_port_access SET status=CASE WHEN status='ACTIVE' THEN 'ENDED' ELSE 'CANCELLED' END,ended_at=NOW() WHERE status IN('PENDING','ACTIVE') AND (requester_country_id=$1 OR grantor_country_id=$1)",[input.countryId]);
  await client.query("UPDATE trade_agreements SET status='ENDED',ended_at=NOW() WHERE status IN('PENDING','ACTIVE') AND (proposer_country_id=$1 OR receiver_country_id=$1)",[input.countryId]);
  await client.query("UPDATE pact_invitations SET status='CANCELLED',responded_by='SYSTEM',responded_at=NOW() WHERE status='PENDING' AND (inviter_country_id=$1 OR receiver_country_id=$1)",[input.countryId]);
  await client.query("DELETE FROM pact_memberships WHERE country_id=$1",[input.countryId]);
  await client.query("DELETE FROM diplomatic_pacts WHERE founder_country_id=$1",[input.countryId]);
  await client.query("UPDATE country_vassalages SET status='ENDED',ended_turn=$2,ended_by='SYSTEM',ended_at=NOW() WHERE status='ACTIVE' AND (overlord_country_id=$1 OR vassal_country_id=$1)",[input.countryId,input.turn]);
  await client.query("UPDATE mercenary_contracts SET status=CASE WHEN status='PENDING' THEN 'CANCELLED' ELSE 'DESTROYED' END,updated_at=NOW() WHERE country_id=$1 AND status IN('PENDING','ACTIVE','UNPAID')",[input.countryId]);
  await client.query("DELETE FROM army_units WHERE army_id IN(SELECT id FROM armies WHERE country_id=$1)",[input.countryId]);
  await client.query("DELETE FROM army_siege_assets WHERE army_id IN(SELECT id FROM armies WHERE country_id=$1)",[input.countryId]);
  await client.query("DELETE FROM fleet_ships WHERE fleet_id IN(SELECT id FROM fleets WHERE country_id=$1)",[input.countryId]);
  await client.query("DELETE FROM country_members WHERE country_id=$1",[input.countryId]);
  await client.query(
    `UPDATE country_last_stands SET status='FAILED',resolved_turn=$2,resolution_reason=$3,updated_at=NOW()
      WHERE country_id=$1`,[input.countryId,input.turn,input.reason]
  );
  await client.query(
    `UPDATE countries SET status='YOK_EDİLDİ',treasury=0,destroyed_turn=$2,destroyed_reason=$3,
       destroyed_by=$4,destroyed_at=NOW(),discord_role_id=NULL WHERE id=$1`,
    [input.countryId,input.turn,input.reason,input.actorId]
  );
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
      VALUES($1,$2,'COUNTRY_LAST_STAND_FAILED','country',$3,$4::jsonb)`,
    [input.guildId,input.actorId,input.countryId,JSON.stringify({countryName:input.countryName,turn:input.turn,reason:input.reason})]
  );
  return{
    kind:"FAILED",countryId:input.countryId,countryName:input.countryName,startedTurn:input.turn,
    deadlineTurn:input.turn,remainingTurns:0,armyPersonnel:0,settlementName:null,reason:input.reason,
    discordRoleId:input.discordRoleId
  };
}

export async function startLastStand(
  client:DbClient,input:{guildId:string;countryId:string;countryName:string;turn:number;actorId:string;discordRoleId:string|null}
):Promise<LastStandEvent>{
  const personnel=await armyPersonnel(client,input.countryId);
  const previous=(await client.query<LastStandRow>(
    `SELECT stand.country_id,country.name AS country_name,country.discord_role_id,
       stand.started_turn,stand.deadline_turn,stand.status
      FROM country_last_stands stand JOIN countries country ON country.id=stand.country_id
      WHERE stand.country_id=$1 FOR UPDATE`,[input.countryId]
  )).rows[0];
  if(personnel<=0){
    if(!previous){
      await client.query(
        `INSERT INTO country_last_stands(country_id,guild_id,started_turn,deadline_turn,status,resolved_turn,resolution_reason)
          VALUES($1,$2,$3,$3,'FAILED',$3,$4)`,
        [input.countryId,input.guildId,input.turn,"Sahada geri dönüş yapabilecek kara ordusu kalmadı."]
      );
    }
    return eliminateCountry(client,{...input,reason:"Sahada geri dönüş yapabilecek kara ordusu kalmadığı için devlet yok oldu."});
  }
  if(previous){
    return eliminateCountry(client,{...input,reason:"Tek kullanımlık Son Direniş hakkı daha önce kullanıldığı için devlet yok oldu."});
  }
  const deadline=lastStandDeadline(input.turn);
  await client.query(
    `INSERT INTO country_last_stands(country_id,guild_id,started_turn,deadline_turn)
      VALUES($1,$2,$3,$4)`,[input.countryId,input.guildId,input.turn,deadline]
  );
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
      VALUES($1,$2,'COUNTRY_LAST_STAND_STARTED','country',$3,$4::jsonb)`,
    [input.guildId,input.actorId,input.countryId,JSON.stringify({countryName:input.countryName,startedTurn:input.turn,deadlineTurn:deadline,armyPersonnel:personnel})]
  );
  return{
    kind:"STARTED",countryId:input.countryId,countryName:input.countryName,startedTurn:input.turn,
    deadlineTurn:deadline,remainingTurns:LAST_STAND_DURATION_TURNS,armyPersonnel:personnel,
    settlementName:null,reason:null,discordRoleId:input.discordRoleId
  };
}

export async function recoverLastStand(
  client:DbClient,input:{countryId:string;settlementId:string;settlementName:string;turn:number;actorId:string;guildId:string}
):Promise<LastStandEvent|null>{
  const stand=(await client.query<LastStandRow>(
    `SELECT stand.country_id,country.name AS country_name,country.discord_role_id,
       stand.started_turn,stand.deadline_turn,stand.status
      FROM country_last_stands stand JOIN countries country ON country.id=stand.country_id
      JOIN country_settlement_claims claim ON claim.country_id=stand.country_id AND claim.settlement_id=$2
      WHERE stand.country_id=$1 AND stand.status='ACTIVE' FOR UPDATE`,[input.countryId,input.settlementId]
  )).rows[0];
  if(!stand)return null;
  const personnel=await armyPersonnel(client,input.countryId);
  await client.query(
    `UPDATE country_last_stands SET status='RECOVERED',recovered_settlement_id=$2,resolved_turn=$3,
       resolution_reason='Eski yerleşke savaşla geri alındı.',updated_at=NOW() WHERE country_id=$1`,
    [input.countryId,input.settlementId,input.turn]
  );
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
      VALUES($1,$2,'COUNTRY_LAST_STAND_RECOVERED','country',$3,$4::jsonb)`,
    [input.guildId,input.actorId,input.countryId,JSON.stringify({countryName:stand.country_name,turn:input.turn,settlementId:input.settlementId,settlementName:input.settlementName})]
  );
  return{
    kind:"RECOVERED",countryId:input.countryId,countryName:stand.country_name,
    startedTurn:Number(stand.started_turn),deadlineTurn:Number(stand.deadline_turn),remainingTurns:0,
    armyPersonnel:personnel,settlementName:input.settlementName,reason:null,discordRoleId:stand.discord_role_id
  };
}

export async function processLastStandsForTurn(
  client:DbClient,input:{guildId:string;newTurn:number;actorId:string}
):Promise<{events:LastStandEvent[];blocked:string[]} >{
  const stands=(await client.query<LastStandRow>(
    `SELECT stand.country_id,country.name AS country_name,country.discord_role_id,
       stand.started_turn,stand.deadline_turn,stand.status
      FROM country_last_stands stand JOIN countries country ON country.id=stand.country_id
      WHERE stand.guild_id=$1 AND stand.status='ACTIVE' AND country.status='ACTIVE'
      ORDER BY country.name FOR UPDATE OF stand,country`,[input.guildId]
  )).rows;
  const states:Array<{stand:LastStandRow;personnel:number;claimedSettlement:{id:string;name:string}|null;due:boolean}> = [];
  const blocked:string[]=[];
  for(const stand of stands){
    const claimedSettlement=(await client.query<{id:string;name:string}>(
      `SELECT settlement.id,settlement.name FROM settlements settlement
        JOIN country_settlement_claims claim ON claim.settlement_id=settlement.id AND claim.country_id=$1
       WHERE settlement.country_id=$1 ORDER BY settlement.name LIMIT 1`,[stand.country_id]
    )).rows[0]??null;
    const personnel=await armyPersonnel(client,stand.country_id);
    const due=!claimedSettlement&&(personnel<=0||input.newTurn>Number(stand.deadline_turn));
    if(due&&await activeBattleCount(client,stand.country_id)>0)blocked.push(stand.country_name);
    states.push({stand,personnel,claimedSettlement,due});
  }
  if(blocked.length)return{events:[],blocked};
  const events:LastStandEvent[]=[];
  for(const state of states){
    const {stand,personnel,claimedSettlement,due}=state;
    if(claimedSettlement){
      const recovered=await recoverLastStand(client,{
        countryId:stand.country_id,settlementId:claimedSettlement.id,settlementName:claimedSettlement.name,
        turn:input.newTurn,actorId:input.actorId,guildId:input.guildId
      });
      if(recovered)events.push(recovered);
      continue;
    }
    if(due){
      const reason=personnel<=0
        ?"Son Direniş sırasında sahadaki bütün kara orduları yok edildi."
        :`Son Direniş süresi Tur ${stand.deadline_turn} sonunda doldu.`;
      events.push(await eliminateCountry(client,{
        guildId:input.guildId,countryId:stand.country_id,countryName:stand.country_name,
        turn:input.newTurn,actorId:input.actorId,reason,discordRoleId:stand.discord_role_id
      }));
      continue;
    }
    events.push({
      kind:"ONGOING",countryId:stand.country_id,countryName:stand.country_name,
      startedTurn:Number(stand.started_turn),deadlineTurn:Number(stand.deadline_turn),
      remainingTurns:lastStandRemainingTurns(Number(stand.deadline_turn),input.newTurn),
      armyPersonnel:personnel,settlementName:null,reason:null,discordRoleId:stand.discord_role_id
    });
  }
  return{events,blocked:[]};
}
