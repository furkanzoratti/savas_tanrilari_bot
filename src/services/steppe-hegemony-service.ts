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

const offerViewSql=`SELECT offer.id,offer.guild_id,offer.hegemon_country_id,
  hegemon.name AS hegemon_country_name,offer.tributary_country_id,
  tributary.name AS tributary_country_name,offer.turn,offer.full_due,
  offer.response,offer.paid_amount,offer.channel_id,offer.message_id
  FROM steppe_tribute_offers offer
  JOIN countries hegemon ON hegemon.id=offer.hegemon_country_id
  JOIN countries tributary ON tributary.id=offer.tributary_country_id`;

async function audit(client:DbClient,guildId:string,actorId:string,action:string,entityId:string|null,details:unknown):Promise<void>{
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'steppe_tribute_offer',$4,$5::jsonb)",
    [guildId,actorId,action,entityId,JSON.stringify(details)]
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

export const steppeHegemonyService={
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
