import { pool, withTransaction, type DbClient } from "../db/pool.js";
import {
  clampSteppeMeter,
  DEFAULT_STEPPE_HEGEMON_NAME,
  DEFAULT_STEPPE_TRIBUTARIES,
  fullSteppeTributeDue,
  STEPPE_TRIBUTE_RESPONSES,
  steppeTributePayment,
  type SteppeTributeResponse
} from "../domain/steppe-hegemony.js";
import { isAcquisitionTurn } from "../domain/mobilization.js";
import {
  clampSteppeRelation,STEPPE_UNANSWERED_WAR_CALL,STEPPE_WAR_CALL_RESPONSES,
  type SteppeWarCallResponse
} from "../domain/steppe-politics.js";
import { GameError } from "./game-service.js";

export interface SteppeTributeOfferView {
  id:string;
  guild_id:string;
  hegemon_country_id:string;
  hegemon_country_name:string;
  tributary_country_id:string;
  tributary_country_name:string;
  turn:number;
  response:"PENDING"|SteppeTributeResponse|"CANCELLED";
  channel_id:string|null;
  message_id:string|null;
}

interface InternalSteppeTributeOffer extends SteppeTributeOfferView {
  full_due:number;
  paid_amount:number|null;
}

export interface SteppeGreatKhanateMemberView{
  countryId:string;countryName:string;loyalty:number;relationScore:number;
  khanTitleName:string|null;khanHolderName:string|null;khanHolderUserId:string|null;
}
export interface SteppeGreatKhanateWarCallResponseView{
  warCallId:string;countryId:string;countryName:string;khanTitleName:string|null;
  khanHolderName:string|null;khanHolderUserId:string|null;
  response:"PENDING"|SteppeWarCallResponse|"UNANSWERED";
  loyaltyDelta:number;relationDelta:number;authorityDelta:number;channelId:string|null;messageId:string|null;
}
export interface SteppeGreatKhanateWarCallView{
  id:string;targetLabel:string;reason:string;openedTurn:number;status:"OPEN"|"CLOSED"|"CANCELLED";
  responses:SteppeGreatKhanateWarCallResponseView[];
}
export interface SteppeGreatKhanateView{
  guildId:string;currentTurn:number;hegemonCountryId:string;hegemonCountryName:string;authority:number;
  greatKhanTitleName:string|null;greatKhanHolderName:string|null;greatKhanHolderUserId:string|null;
  members:SteppeGreatKhanateMemberView[];warCalls:SteppeGreatKhanateWarCallView[];
  events:Array<{turn:number;type:string;description:string;countryName:string|null;loyaltyDelta:number;relationDelta:number;authorityDelta:number}>;
}

const offerViewSql=`SELECT offer.id,offer.guild_id,offer.hegemon_country_id,
  hegemon.name AS hegemon_country_name,offer.tributary_country_id,
  tributary.name AS tributary_country_name,offer.turn,offer.full_due,
  offer.response,offer.paid_amount,offer.channel_id,offer.message_id
  FROM steppe_tribute_offers offer
  JOIN countries hegemon ON hegemon.id=offer.hegemon_country_id
  JOIN countries tributary ON tributary.id=offer.tributary_country_id`;

async function audit(client:DbClient,guildId:string,actorId:string,action:string,entityId:string|null,details:unknown,
  entityType="steppe_tribute_offer"):Promise<void>{
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId,actorId,action,entityType,entityId,JSON.stringify(details)]
  );
}

async function ensureDefaultHegemony(client:DbClient,guildId:string,actorId:string):Promise<{
  hegemonCountryId:string;
  tributaries:Array<{countryId:string;countryName:string}>;
  currentTurn:number;
  acquisitionInterval:number;
}>{
  const guild=(await client.query<{current_turn:number;acquisition_interval:number}>(
    "SELECT current_turn,acquisition_interval FROM guilds WHERE discord_id=$1 FOR UPDATE",[guildId]
  )).rows[0];
  if(!guild)throw new GameError("Sunucu oyun ayarları bulunamadı.");

  let hegemony=(await client.query<{hegemon_country_id:string}>(
    "SELECT hegemon_country_id FROM steppe_hegemonies WHERE guild_id=$1 FOR UPDATE",[guildId]
  )).rows[0];
  if(!hegemony){
    const names=[DEFAULT_STEPPE_HEGEMON_NAME,...DEFAULT_STEPPE_TRIBUTARIES.map((item)=>item.name)];
    const countries=(await client.query<{id:string;name:string}>(
      "SELECT id,name FROM countries WHERE guild_id=$1 AND status='ACTIVE' AND LOWER(name)=ANY($2::text[])",
      [guildId,names.map((name)=>name.toLocaleLowerCase("tr-TR"))]
    )).rows;
    const byName=new Map(countries.map((country)=>[country.name.toLocaleLowerCase("tr-TR"),country]));
    const hegemon=byName.get(DEFAULT_STEPPE_HEGEMON_NAME.toLocaleLowerCase("tr-TR"));
    const missing=names.filter((name)=>!byName.has(name.toLocaleLowerCase("tr-TR")));
    if(!hegemon||missing.length)throw new GameError(
      `Bozkır hegemonyası başlatılamadı. Eksik aktif devletler: ${missing.join(", ")}.`
    );
    await client.query(
      "INSERT INTO steppe_hegemonies(guild_id,hegemon_country_id,authority,created_turn) VALUES($1,$2,75,$3)",
      [guildId,hegemon.id,guild.current_turn]
    );
    for(const tributary of DEFAULT_STEPPE_TRIBUTARIES){
      const country=byName.get(tributary.name.toLocaleLowerCase("tr-TR"))!;
      await client.query(
        "INSERT INTO steppe_tributaries(guild_id,country_id,loyalty,joined_turn) VALUES($1,$2,$3,$4)",
        [guildId,country.id,tributary.loyalty,guild.current_turn]
      );
    }
    hegemony={hegemon_country_id:hegemon.id};
    await audit(client,guildId,actorId,"STEPPE_HEGEMONY_INITIALIZED",null,{
      hegemonCountryId:hegemon.id,tributaryCountryIds:DEFAULT_STEPPE_TRIBUTARIES.map((item)=>
        byName.get(item.name.toLocaleLowerCase("tr-TR"))!.id
      ),turn:guild.current_turn
    });
  }

  const hegemonActive=await client.query(
    "SELECT 1 FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'",[hegemony.hegemon_country_id,guildId]
  );
  if(!hegemonActive.rowCount)throw new GameError("Bozkır hegemonu aktif bir devlet değil; yönetici müdahalesi gerekiyor.");
  const tributaries=(await client.query<{country_id:string;country_name:string}>(
    `SELECT relation.country_id,country.name AS country_name
       FROM steppe_tributaries relation
       JOIN countries country ON country.id=relation.country_id
      WHERE relation.guild_id=$1 AND relation.status='ACTIVE' AND country.status='ACTIVE'
      ORDER BY country.name`,[guildId]
  )).rows;
  return{
    hegemonCountryId:hegemony.hegemon_country_id,
    tributaries:tributaries.map((row)=>({countryId:row.country_id,countryName:row.country_name})),
    currentTurn:Number(guild.current_turn),acquisitionInterval:Number(guild.acquisition_interval)
  };
}

async function currentTreasury(client:DbClient,countryId:string):Promise<number>{
  const result=await client.query<{total:number}>(
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM settlements WHERE country_id=$1)
      THEN COALESCE((SELECT SUM(local_treasury) FROM settlements WHERE country_id=$1),0)
      ELSE COALESCE((SELECT treasury FROM countries WHERE id=$1),0) END::bigint AS total`,[countryId]
  );
  return Number(result.rows[0]?.total??0);
}

async function moveTreasury(client:DbClient,fromCountryId:string,toCountryId:string,requestedAmount:number):Promise<number>{
  if(requestedAmount<=0)return 0;
  const sourceSettlements=(await client.query<{id:string;local_treasury:number}>(
    "SELECT id,local_treasury FROM settlements WHERE country_id=$1 ORDER BY local_treasury DESC,name,id FOR UPDATE",[fromCountryId]
  )).rows;
  const available=sourceSettlements.length
    ?sourceSettlements.reduce((sum,row)=>sum+Number(row.local_treasury),0)
    :await currentTreasury(client,fromCountryId);
  const collected=Math.min(Math.max(0,requestedAmount),Math.max(0,available));
  if(collected<=0)return 0;

  if(sourceSettlements.length){
    let remaining=collected;
    for(const settlement of sourceSettlements){
      if(remaining<=0)break;
      const deduction=Math.min(remaining,Math.max(0,Number(settlement.local_treasury)));
      if(deduction)await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2",[deduction,settlement.id]);
      remaining-=deduction;
    }
  }else{
    await client.query("UPDATE countries SET treasury=treasury-$1 WHERE id=$2",[collected,fromCountryId]);
  }

  const targetSettlement=(await client.query<{id:string}>(
    "SELECT id FROM settlements WHERE country_id=$1 ORDER BY local_treasury DESC,name,id LIMIT 1 FOR UPDATE",[toCountryId]
  )).rows[0];
  if(targetSettlement)await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2",[collected,targetSettlement.id]);
  else await client.query("UPDATE countries SET treasury=treasury+$1 WHERE id=$2",[collected,toCountryId]);

  for(const countryId of [fromCountryId,toCountryId]){
    await client.query(
      `UPDATE countries SET treasury=CASE WHEN EXISTS(SELECT 1 FROM settlements WHERE country_id=$1)
        THEN (SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1)
        ELSE treasury END WHERE id=$1`,[countryId]
    );
  }
  return collected;
}

function normalizeOffer(row:InternalSteppeTributeOffer):InternalSteppeTributeOffer{
  return{...row,turn:Number(row.turn),full_due:Number(row.full_due),paid_amount:row.paid_amount===null?null:Number(row.paid_amount)};
}

async function greatKhanateViewWithClient(client:DbClient,guildId:string):Promise<SteppeGreatKhanateView|null>{
  const hegemony=(await client.query<{
    hegemon_country_id:string;hegemon_country_name:string;authority:number;current_turn:number;
    khan_title_name:string|null;khan_holder_name:string|null;khan_holder_user_id:string|null;
  }>(`SELECT hegemony.hegemon_country_id,country.name AS hegemon_country_name,hegemony.authority,guild.current_turn,
             khan.title_name AS khan_title_name,khan.holder_name AS khan_holder_name,khan.holder_user_id AS khan_holder_user_id
        FROM steppe_hegemonies hegemony
        JOIN countries country ON country.id=hegemony.hegemon_country_id
        JOIN guilds guild ON guild.discord_id=hegemony.guild_id
        LEFT JOIN steppe_confederations confederation
          ON confederation.country_id=hegemony.hegemon_country_id AND confederation.status='ACTIVE'
        LEFT JOIN steppe_internal_titles khan
          ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
       WHERE hegemony.guild_id=$1`,[guildId])).rows[0];
  if(!hegemony)return null;
  const members=(await client.query<{
    country_id:string;country_name:string;loyalty:number;relation_score:number;
    khan_title_name:string|null;khan_holder_name:string|null;khan_holder_user_id:string|null;
  }>(`SELECT relation.country_id,country.name AS country_name,relation.loyalty,relation.relation_score,
             khan.title_name AS khan_title_name,khan.holder_name AS khan_holder_name,khan.holder_user_id AS khan_holder_user_id
        FROM steppe_tributaries relation
        JOIN countries country ON country.id=relation.country_id
        LEFT JOIN steppe_confederations confederation
          ON confederation.country_id=relation.country_id AND confederation.status='ACTIVE'
        LEFT JOIN steppe_internal_titles khan
          ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
       WHERE relation.guild_id=$1 AND relation.status='ACTIVE' AND country.status='ACTIVE'
       ORDER BY country.name`,[guildId])).rows;
  const calls=(await client.query<{
    id:string;target_label:string;reason:string;opened_turn:number;status:"OPEN"|"CLOSED"|"CANCELLED";
  }>(`SELECT id,target_label,reason,opened_turn,status FROM steppe_hegemony_war_calls
       WHERE guild_id=$1 ORDER BY CASE status WHEN 'OPEN' THEN 0 ELSE 1 END,created_at DESC LIMIT 10`,[guildId])).rows;
  const responses=calls.length?(await client.query<{
    war_call_id:string;country_id:string;country_name:string;khan_title_name:string|null;khan_holder_name:string|null;
    khan_holder_user_id:string|null;response:"PENDING"|SteppeWarCallResponse|"UNANSWERED";
    loyalty_delta:number;relation_delta:number;authority_delta:number;channel_id:string|null;message_id:string|null;
  }>(`SELECT response.war_call_id,response.country_id,country.name AS country_name,
             khan.title_name AS khan_title_name,khan.holder_name AS khan_holder_name,khan.holder_user_id AS khan_holder_user_id,
             response.response,response.loyalty_delta,response.relation_delta,response.authority_delta,
             response.channel_id,response.message_id
        FROM steppe_hegemony_war_call_responses response
        JOIN countries country ON country.id=response.country_id
        LEFT JOIN steppe_confederations confederation
          ON confederation.country_id=response.country_id AND confederation.status='ACTIVE'
        LEFT JOIN steppe_internal_titles khan
          ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
       WHERE response.war_call_id=ANY($1::uuid[]) ORDER BY country.name`,[calls.map((call)=>call.id)])).rows:[];
  const events=(await client.query<{
    game_turn:number;event_type:string;description:string;country_name:string|null;
    loyalty_delta:number;relation_delta:number;authority_delta:number;
  }>(`SELECT event.game_turn,event.event_type,event.description,country.name AS country_name,
             event.loyalty_delta,event.relation_delta,event.authority_delta
        FROM steppe_hegemony_events event LEFT JOIN countries country ON country.id=event.country_id
       WHERE event.guild_id=$1 ORDER BY event.created_at DESC LIMIT 20`,[guildId])).rows;
  return{
    guildId,currentTurn:Number(hegemony.current_turn),hegemonCountryId:hegemony.hegemon_country_id,
    hegemonCountryName:hegemony.hegemon_country_name,authority:Number(hegemony.authority),
    greatKhanTitleName:hegemony.khan_title_name,greatKhanHolderName:hegemony.khan_holder_name,
    greatKhanHolderUserId:hegemony.khan_holder_user_id,
    members:members.map((member)=>({countryId:member.country_id,countryName:member.country_name,loyalty:Number(member.loyalty),
      relationScore:Number(member.relation_score),khanTitleName:member.khan_title_name,khanHolderName:member.khan_holder_name,
      khanHolderUserId:member.khan_holder_user_id})),
    warCalls:calls.map((call)=>({id:call.id,targetLabel:call.target_label,reason:call.reason,openedTurn:Number(call.opened_turn),status:call.status,
      responses:responses.filter((response)=>response.war_call_id===call.id).map((response)=>({
        warCallId:response.war_call_id,countryId:response.country_id,countryName:response.country_name,
        khanTitleName:response.khan_title_name,khanHolderName:response.khan_holder_name,khanHolderUserId:response.khan_holder_user_id,
        response:response.response,loyaltyDelta:Number(response.loyalty_delta),relationDelta:Number(response.relation_delta),
        authorityDelta:Number(response.authority_delta),channelId:response.channel_id,messageId:response.message_id
      }))})),
    events:events.map((event)=>({turn:Number(event.game_turn),type:event.event_type,description:event.description,
      countryName:event.country_name,loyaltyDelta:Number(event.loyalty_delta),relationDelta:Number(event.relation_delta),
      authorityDelta:Number(event.authority_delta)}))
  };
}

async function addHegemonyEvent(client:DbClient,input:{guildId:string;turn:number;type:string;countryId?:string|null;actorId:string;
  loyaltyDelta?:number;relationDelta?:number;authorityDelta?:number;description:string;details?:unknown}){
  await client.query(`INSERT INTO steppe_hegemony_events(
    guild_id,game_turn,event_type,country_id,actor_user_id,loyalty_delta,relation_delta,authority_delta,description,details
  ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,[input.guildId,input.turn,input.type,input.countryId??null,input.actorId,
    input.loyaltyDelta??0,input.relationDelta??0,input.authorityDelta??0,input.description,JSON.stringify(input.details??{})]);
}

export const steppeHegemonyService={
  async view(guildId:string):Promise<SteppeGreatKhanateView|null>{
    const client=await pool.connect();try{return await greatKhanateViewWithClient(client,guildId);}finally{client.release();}
  },

  async openWarCall(input:{guildId:string;actorId:string;hegemonCountryId:string;targetLabel:string;reason:string;gameMaster:boolean}){
    return withTransaction(async(client)=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`steppe-hegemony-war-call:${input.guildId}`]);
      const row=(await client.query<{hegemon_country_id:string;authority:number;current_turn:number;holder_user_id:string|null}>(`
        SELECT hegemony.hegemon_country_id,hegemony.authority,guild.current_turn,khan.holder_user_id
          FROM steppe_hegemonies hegemony JOIN guilds guild ON guild.discord_id=hegemony.guild_id
          LEFT JOIN steppe_confederations confederation
            ON confederation.country_id=hegemony.hegemon_country_id AND confederation.status='ACTIVE'
          LEFT JOIN steppe_internal_titles khan
            ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
         WHERE hegemony.guild_id=$1 FOR UPDATE OF hegemony`,[input.guildId])).rows[0];
      if(!row)throw new GameError("Hanlar Hanlığı kurulmamış.");
      if(row.hegemon_country_id!==input.hegemonCountryId)throw new GameError("Üst savaş çağrısını yalnızca mevcut Hanlar Hanı devleti yayımlayabilir.");
      if(!input.gameMaster&&row.holder_user_id!==input.actorId)throw new GameError("Üst savaş çağrısını yalnızca Hanlar Hanı veya oyun yöneticisi yayımlayabilir.");
      if((await client.query("SELECT 1 FROM steppe_hegemony_war_calls WHERE guild_id=$1 AND status='OPEN'",[input.guildId])).rowCount)
        throw new GameError("Önce mevcut açık Hanlar Hanı savaş çağrısını sonuçlandırın.");
      const call=(await client.query<{id:string}>(`INSERT INTO steppe_hegemony_war_calls(
        guild_id,target_label,reason,opened_turn,opened_by
      ) VALUES($1,$2,$3,$4,$5) RETURNING id`,[input.guildId,input.targetLabel.trim(),input.reason.trim(),row.current_turn,input.actorId])).rows[0]!;
      await client.query(`INSERT INTO steppe_hegemony_war_call_responses(war_call_id,country_id)
        SELECT $1,country_id FROM steppe_tributaries WHERE guild_id=$2 AND status='ACTIVE'`,[call.id,input.guildId]);
      const count=Number((await client.query<{count:number}>(
        "SELECT COUNT(*)::int AS count FROM steppe_hegemony_war_call_responses WHERE war_call_id=$1",[call.id]
      )).rows[0]?.count??0);
      if(!count)throw new GameError("Çağrı gönderilecek bağlı Han bulunmuyor.");
      await addHegemonyEvent(client,{guildId:input.guildId,turn:Number(row.current_turn),type:"GREAT_KHAN_WAR_CALL_OPENED",actorId:input.actorId,
        description:`${input.targetLabel.trim()} için Hanlar Hanı savaş çağrısı yayımlandı.`,details:{warCallId:call.id,reason:input.reason}});
      await audit(client,input.guildId,input.actorId,"STEPPE_HEGEMONY_WAR_CALL_OPEN",call.id,input,"steppe_hegemony_war_call");
      return (await greatKhanateViewWithClient(client,input.guildId))!.warCalls.find((item)=>item.id===call.id)!;
    });
  },

  async attachWarCallMessage(warCallId:string,countryId:string,channelId:string,messageId:string):Promise<void>{
    await pool.query(`UPDATE steppe_hegemony_war_call_responses SET channel_id=$3,message_id=$4
      WHERE war_call_id=$1 AND country_id=$2 AND response='PENDING'`,[warCallId,countryId,channelId,messageId]);
  },

  async warCallResponse(warCallId:string,countryId:string):Promise<SteppeGreatKhanateWarCallResponseView|null>{
    const view=(await pool.query<{
      war_call_id:string;country_id:string;country_name:string;khan_title_name:string|null;khan_holder_name:string|null;
      khan_holder_user_id:string|null;response:"PENDING"|SteppeWarCallResponse|"UNANSWERED";
      loyalty_delta:number;relation_delta:number;authority_delta:number;channel_id:string|null;message_id:string|null;
    }>(`SELECT response.war_call_id,response.country_id,country.name AS country_name,
             khan.title_name AS khan_title_name,khan.holder_name AS khan_holder_name,khan.holder_user_id AS khan_holder_user_id,
             response.response,response.loyalty_delta,response.relation_delta,response.authority_delta,response.channel_id,response.message_id
        FROM steppe_hegemony_war_call_responses response JOIN countries country ON country.id=response.country_id
        LEFT JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
        LEFT JOIN steppe_internal_titles khan ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
       WHERE response.war_call_id=$1 AND response.country_id=$2`,[warCallId,countryId])).rows[0];
    return view?{warCallId:view.war_call_id,countryId:view.country_id,countryName:view.country_name,khanTitleName:view.khan_title_name,
      khanHolderName:view.khan_holder_name,khanHolderUserId:view.khan_holder_user_id,response:view.response,
      loyaltyDelta:Number(view.loyalty_delta),relationDelta:Number(view.relation_delta),authorityDelta:Number(view.authority_delta),
      channelId:view.channel_id,messageId:view.message_id}:null;
  },

  async respondWarCall(input:{guildId:string;actorId:string;warCallId:string;countryId:string;response:SteppeWarCallResponse;gameMaster:boolean}){
    return withTransaction(async(client)=>{
      const row=(await client.query<{
        current_turn:number;call_status:string;response_status:string;country_name:string;holder_user_id:string|null;
        loyalty:number;relation_score:number;authority:number;
      }>(`SELECT guild.current_turn,call.status AS call_status,response.response AS response_status,
                country.name AS country_name,khan.holder_user_id,relation.loyalty,relation.relation_score,hegemony.authority
           FROM steppe_hegemony_war_call_responses response
           JOIN steppe_hegemony_war_calls call ON call.id=response.war_call_id
           JOIN steppe_hegemonies hegemony ON hegemony.guild_id=call.guild_id
           JOIN guilds guild ON guild.discord_id=call.guild_id
           JOIN steppe_tributaries relation ON relation.guild_id=call.guild_id AND relation.country_id=response.country_id
           JOIN countries country ON country.id=response.country_id
           LEFT JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
           LEFT JOIN steppe_internal_titles khan ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
          WHERE response.war_call_id=$1 AND response.country_id=$2 AND call.guild_id=$3
          FOR UPDATE OF response,call,hegemony,relation`,[input.warCallId,input.countryId,input.guildId])).rows[0];
      if(!row)throw new GameError("Hanlar Hanı savaş çağrısı yanıt kaydı bulunamadı.");
      if(row.call_status!=="OPEN"||row.response_status!=="PENDING")throw new GameError("Bu savaş çağrısı artık yanıtlanamaz.");
      const isMember=Boolean((await client.query("SELECT 1 FROM country_members WHERE country_id=$1 AND discord_user_id=$2",[input.countryId,input.actorId])).rowCount);
      if(!input.gameMaster&&row.holder_user_id!==input.actorId&&!isMember)throw new GameError("Bu çağrıyı yalnızca ilgili bağlı Han veya oyun yöneticisi yanıtlayabilir.");
      const effect=STEPPE_WAR_CALL_RESPONSES[input.response];if(!effect)throw new GameError("Geçersiz savaş çağrısı yanıtı.");
      await client.query(`UPDATE steppe_tributaries SET loyalty=$3,relation_score=$4,updated_at=NOW()
        WHERE guild_id=$1 AND country_id=$2`,[input.guildId,input.countryId,
        clampSteppeMeter(Number(row.loyalty)+effect.loyaltyDelta),clampSteppeRelation(Number(row.relation_score)+effect.relationDelta)]);
      await client.query("UPDATE steppe_hegemonies SET authority=$2,updated_at=NOW() WHERE guild_id=$1",
        [input.guildId,clampSteppeMeter(Number(row.authority)+effect.authorityDelta)]);
      await client.query(`UPDATE steppe_hegemony_war_call_responses SET response=$3,loyalty_delta=$4,relation_delta=$5,
        authority_delta=$6,responded_by=$7,responded_at=NOW() WHERE war_call_id=$1 AND country_id=$2`,
      [input.warCallId,input.countryId,input.response,effect.loyaltyDelta,effect.relationDelta,effect.authorityDelta,input.actorId]);
      await addHegemonyEvent(client,{guildId:input.guildId,turn:Number(row.current_turn),type:"GREAT_KHAN_WAR_CALL_RESPONSE",
        countryId:input.countryId,actorId:input.actorId,loyaltyDelta:effect.loyaltyDelta,relationDelta:effect.relationDelta,
        authorityDelta:effect.authorityDelta,description:`${row.country_name} Hanı savaş çağrısına ${effect.label} yanıtını verdi.`,
        details:{warCallId:input.warCallId,response:input.response}});
      await audit(client,input.guildId,input.actorId,"STEPPE_HEGEMONY_WAR_CALL_RESPONSE",input.warCallId,input,"steppe_hegemony_war_call");
      return{effect,countryName:row.country_name};
    });
  },

  async closeWarCall(input:{guildId:string;actorId:string;warCallId:string}):Promise<SteppeGreatKhanateView>{
    return withTransaction(async(client)=>{
      const state=(await client.query<{authority:number;current_turn:number}>(`
        SELECT hegemony.authority,guild.current_turn FROM steppe_hegemonies hegemony
        JOIN guilds guild ON guild.discord_id=hegemony.guild_id WHERE hegemony.guild_id=$1 FOR UPDATE OF hegemony`,[input.guildId])).rows[0];
      if(!state)throw new GameError("Hanlar Hanlığı kurulmamış.");
      const call=(await client.query<{id:string}>(
        "SELECT id FROM steppe_hegemony_war_calls WHERE id=$1 AND guild_id=$2 AND status='OPEN' FOR UPDATE",[input.warCallId,input.guildId]
      )).rows[0];if(!call)throw new GameError("Açık Hanlar Hanı savaş çağrısı bulunamadı.");
      const pending=(await client.query<{country_id:string;country_name:string;loyalty:number;relation_score:number}>(`
        SELECT relation.country_id,country.name AS country_name,relation.loyalty,relation.relation_score
          FROM steppe_hegemony_war_call_responses response
          JOIN steppe_tributaries relation ON relation.guild_id=$2 AND relation.country_id=response.country_id
          JOIN countries country ON country.id=relation.country_id
         WHERE response.war_call_id=$1 AND response.response='PENDING' FOR UPDATE OF response,relation`,[call.id,input.guildId])).rows;
      let authority=Number(state.authority);
      for(const member of pending){
        const effect=STEPPE_UNANSWERED_WAR_CALL;authority=clampSteppeMeter(authority+effect.authorityDelta);
        await client.query(`UPDATE steppe_tributaries SET loyalty=$3,relation_score=$4,updated_at=NOW()
          WHERE guild_id=$1 AND country_id=$2`,[input.guildId,member.country_id,
          clampSteppeMeter(Number(member.loyalty)+effect.loyaltyDelta),clampSteppeRelation(Number(member.relation_score)+effect.relationDelta)]);
        await client.query(`UPDATE steppe_hegemony_war_call_responses SET response='UNANSWERED',loyalty_delta=$3,
          relation_delta=$4,authority_delta=$5,responded_by=$6,responded_at=NOW() WHERE war_call_id=$1 AND country_id=$2`,
        [call.id,member.country_id,effect.loyaltyDelta,effect.relationDelta,effect.authorityDelta,input.actorId]);
        await addHegemonyEvent(client,{guildId:input.guildId,turn:Number(state.current_turn),type:"GREAT_KHAN_WAR_CALL_UNANSWERED",
          countryId:member.country_id,actorId:input.actorId,...effect,description:`${member.country_name} Hanı savaş çağrısını cevapsız bıraktı.`,
          details:{warCallId:call.id}});
      }
      await client.query("UPDATE steppe_hegemonies SET authority=$2,updated_at=NOW() WHERE guild_id=$1",[input.guildId,authority]);
      await client.query("UPDATE steppe_hegemony_war_calls SET status='CLOSED',closed_by=$2,closed_at=NOW() WHERE id=$1",[call.id,input.actorId]);
      await audit(client,input.guildId,input.actorId,"STEPPE_HEGEMONY_WAR_CALL_CLOSE",call.id,{unanswered:pending.length},"steppe_hegemony_war_call");
      return (await greatKhanateViewWithClient(client,input.guildId))!;
    });
  },
  async offerTributes(input:{guildId:string;actorId:string;hegemonCountryId:string}):Promise<SteppeTributeOfferView[]>{
    return withTransaction(async(client)=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`steppe-tribute:${input.guildId}`]);
      const state=await ensureDefaultHegemony(client,input.guildId,input.actorId);
      if(state.hegemonCountryId!==input.hegemonCountryId)throw new GameError("Haraç tekliflerini yalnızca mevcut bozkır hegemonu gönderebilir.");
      if(!isAcquisitionTurn(state.currentTurn,state.acquisitionInterval))throw new GameError("Bozkır haracı yalnızca Alım Turlarında talep edilebilir.");
      if(!state.tributaries.length)throw new GameError("Haraç talebi gönderilebilecek etkin bozkır devleti bulunmuyor.");
      const existing=await client.query(
        `SELECT 1 FROM steppe_tribute_offers
          WHERE guild_id=$1 AND turn=$2 AND tributary_country_id=ANY($3::uuid[]) AND response<>'CANCELLED' LIMIT 1`,
        [input.guildId,state.currentTurn,state.tributaries.map((item)=>item.countryId)]
      );
      if(existing.rowCount)throw new GameError("Bu Alım Turu için bozkır haraç teklifleri daha önce gönderilmiş.");

      const created:InternalSteppeTributeOffer[]=[];
      for(const tributary of state.tributaries){
        const latestNet=Number((await client.query<{amount:number}>(
          `SELECT amount FROM transactions
            WHERE country_id=$1 AND kind='ACQUISITION_TURN'
            ORDER BY turn DESC,created_at DESC LIMIT 1`,[tributary.countryId]
        )).rows[0]?.amount??0);
        const fullDue=fullSteppeTributeDue(latestNet);
        const id=(await client.query<{id:string}>(
          `INSERT INTO steppe_tribute_offers(
             guild_id,hegemon_country_id,tributary_country_id,turn,full_due,offered_by
           ) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [input.guildId,state.hegemonCountryId,tributary.countryId,state.currentTurn,fullDue,input.actorId]
        )).rows[0]!.id;
        const offer=(await client.query<InternalSteppeTributeOffer>(`${offerViewSql} WHERE offer.id=$1`,[id])).rows[0]!;
        created.push(normalizeOffer(offer));
        await audit(client,input.guildId,input.actorId,"STEPPE_TRIBUTE_OFFER",id,{
          hegemonCountryId:state.hegemonCountryId,tributaryCountryId:tributary.countryId,turn:state.currentTurn,fullDue
        });
      }
      return created;
    });
  },

  async attachMessage(id:string,channelId:string,messageId:string):Promise<void>{
    await pool.query(
      "UPDATE steppe_tribute_offers SET channel_id=$2,message_id=$3 WHERE id=$1 AND response='PENDING'",
      [id,channelId,messageId]
    );
  },

  async cancelOffer(guildId:string,id:string):Promise<void>{
    await pool.query(
      "UPDATE steppe_tribute_offers SET response='CANCELLED' WHERE id=$1 AND guild_id=$2 AND response='PENDING'",
      [id,guildId]
    );
  },

  async getOffer(id:string):Promise<SteppeTributeOfferView|null>{
    const row=(await pool.query<InternalSteppeTributeOffer>(`${offerViewSql} WHERE offer.id=$1`,[id])).rows[0];
    return row?normalizeOffer(row):null;
  },

  async respond(input:{
    guildId:string;actorId:string;tributaryCountryId:string;offerId:string;response:SteppeTributeResponse;
  }):Promise<SteppeTributeOfferView>{
    return withTransaction(async(client)=>{
      const offer=(await client.query<InternalSteppeTributeOffer>(
        `${offerViewSql} WHERE offer.id=$1 AND offer.guild_id=$2 FOR UPDATE OF offer`,[input.offerId,input.guildId]
      )).rows[0];
      if(!offer)throw new GameError("Bozkır haraç teklifi bulunamadı.");
      const normalized=normalizeOffer(offer);
      if(normalized.tributary_country_id!==input.tributaryCountryId)throw new GameError("Bu teklifi yalnızca hedef bozkır devleti yanıtlayabilir.");
      if(normalized.response!=="PENDING")throw new GameError("Bu haraç teklifi daha önce sonuçlandırılmış.");
      const terms=STEPPE_TRIBUTE_RESPONSES[input.response];
      if(!terms)throw new GameError("Geçersiz haraç yanıtı.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`diplomacy:${normalized.hegemon_country_id}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`diplomacy:${normalized.tributary_country_id}`]);
      const requested=steppeTributePayment(normalized.full_due,input.response);
      const paid=await moveTreasury(client,normalized.tributary_country_id,normalized.hegemon_country_id,requested);
      await client.query(
        `UPDATE steppe_tribute_offers SET response=$2,paid_amount=$3,responded_by=$4,responded_at=NOW()
          WHERE id=$1`,[input.offerId,input.response,paid,input.actorId]
      );
      await client.query(
        `UPDATE steppe_tributaries SET loyalty=$3,updated_at=NOW()
          WHERE guild_id=$1 AND country_id=$2 AND status='ACTIVE'`,
        [input.guildId,normalized.tributary_country_id,
          clampSteppeMeter(Number((await client.query<{loyalty:number}>(
            "SELECT loyalty FROM steppe_tributaries WHERE guild_id=$1 AND country_id=$2 FOR UPDATE",
            [input.guildId,normalized.tributary_country_id]
          )).rows[0]?.loyalty??0)+terms.loyaltyChange)]
      );
      const currentAuthority=Number((await client.query<{authority:number}>(
        "SELECT authority FROM steppe_hegemonies WHERE guild_id=$1 FOR UPDATE",[input.guildId]
      )).rows[0]?.authority??0);
      await client.query(
        "UPDATE steppe_hegemonies SET authority=$2,updated_at=NOW() WHERE guild_id=$1",
        [input.guildId,clampSteppeMeter(currentAuthority+terms.authorityChange)]
      );
      if(paid>0){
        await client.query(
          `INSERT INTO transactions(country_id,turn,kind,amount,description,details)
           VALUES($1,$3,'STEPPE_TRIBUTE_OUT',$4,$5,$6::jsonb),
                 ($2,$3,'STEPPE_TRIBUTE_IN',$7,$8,$6::jsonb)`,
          [normalized.tributary_country_id,normalized.hegemon_country_id,normalized.turn,-paid,
            `${normalized.hegemon_country_name} devletine bozkır haracı`,JSON.stringify({offerId:normalized.id,response:input.response}),
            paid,`${normalized.tributary_country_name} devletinden bozkır haracı`]
        );
      }
      await audit(client,input.guildId,input.actorId,"STEPPE_TRIBUTE_RESPONSE",input.offerId,{
        response:input.response,requestedAmount:requested,paidAmount:paid,
        hegemonCountryId:normalized.hegemon_country_id,tributaryCountryId:normalized.tributary_country_id,
        loyaltyChange:terms.loyaltyChange,authorityChange:terms.authorityChange
      });
      const result=(await client.query<InternalSteppeTributeOffer>(`${offerViewSql} WHERE offer.id=$1`,[input.offerId])).rows[0]!;
      return normalizeOffer(result);
    });
  }
};
