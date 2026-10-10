import {pool,withTransaction,type DbClient} from "../db/pool.js";
import {
  clampSteppeAuthority,clampSteppeLoyalty,clampSteppeRelation,STEPPE_UNANSWERED_WAR_CALL,
  STEPPE_WAR_CALL_RESPONSES,type SteppeTitleTier,type SteppeWarCallResponse
} from "../domain/steppe-politics.js";
import {GameError} from "./game-service.js";

export interface SteppeInternalTitleView{
  id:string;tier:SteppeTitleTier;titleName:string;holderName:string;holderUserId:string|null;
  liegeTitleId:string|null;liegeTitleName:string|null;loyalty:number;relationScore:number;
  holdings:Array<{id:string;name:string}>;
}
export interface SteppeWarCallResponseView{
  warCallId:string;titleId:string;titleName:string;holderName:string;holderUserId:string|null;
  response:"PENDING"|SteppeWarCallResponse|"UNANSWERED";channelId:string|null;messageId:string|null;
}
export interface SteppeWarCallView{
  id:string;targetLabel:string;reason:string;openedTurn:number;status:"OPEN"|"CLOSED"|"CANCELLED";
  responses:SteppeWarCallResponseView[];
}
export interface SteppePoliticsView{
  id:string;countryId:string;countryName:string;authority:number;currentTurn:number;
  titles:SteppeInternalTitleView[];warCalls:SteppeWarCallView[];
  events:Array<{turn:number;type:string;description:string;titleName:string|null;loyaltyDelta:number;relationDelta:number;authorityDelta:number}>;
}
export interface SteppeSettlementDocumentAccess{
  tier:SteppeTitleTier;titleName:string;holderName:string;settlementIds:string[];
}

async function confederation(client:DbClient,guildId:string,countryId:string,lock=false){
  return (await client.query<{id:string;country_id:string;country_name:string;authority:number;current_turn:number}>(`
    SELECT confederation.id,confederation.country_id,country.name AS country_name,confederation.authority,guild.current_turn
      FROM steppe_confederations confederation
      JOIN countries country ON country.id=confederation.country_id
      JOIN guilds guild ON guild.discord_id=confederation.guild_id
     WHERE confederation.guild_id=$1 AND confederation.country_id=$2 AND confederation.status='ACTIVE'
     ${lock?"FOR UPDATE OF confederation":""}`,[guildId,countryId])).rows[0]??null;
}

async function titleByValue(client:DbClient,confederationId:string,value:string,lock=false){
  return (await client.query<{
    id:string;tier:SteppeTitleTier;title_name:string;holder_name:string;holder_user_id:string|null;
    liege_title_id:string|null;loyalty:number;relation_score:number;
  }>(`SELECT id,tier,title_name,holder_name,holder_user_id,liege_title_id,loyalty,relation_score
        FROM steppe_internal_titles
       WHERE confederation_id=$1 AND status='ACTIVE' AND (id::text=$2 OR lower(title_name)=lower($2))
       LIMIT 1 ${lock?"FOR UPDATE":""}`,[confederationId,value.trim()])).rows[0]??null;
}

async function addEvent(client:DbClient,input:{
  confederationId:string;turn:number;type:string;titleId?:string|null;actorId:string;
  loyaltyDelta?:number;relationDelta?:number;authorityDelta?:number;description:string;details?:unknown;
}){
  await client.query(
    `INSERT INTO steppe_political_events(
       confederation_id,game_turn,event_type,title_id,actor_user_id,loyalty_delta,relation_delta,authority_delta,description,details
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [input.confederationId,input.turn,input.type,input.titleId??null,input.actorId,input.loyaltyDelta??0,input.relationDelta??0,
      input.authorityDelta??0,input.description,JSON.stringify(input.details??{})]
  );
}

async function audit(client:DbClient,guildId:string,actorId:string,action:string,entityType:string,entityId:string|null,details:unknown){
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId,actorId,action,entityType,entityId,JSON.stringify(details)]
  );
}

async function viewWithClient(client:DbClient,guildId:string,countryId:string):Promise<SteppePoliticsView|null>{
  const confed=await confederation(client,guildId,countryId);
  if(!confed)return null;
  const titles=(await client.query<{
    id:string;tier:SteppeTitleTier;title_name:string;holder_name:string;holder_user_id:string|null;
    liege_title_id:string|null;liege_title_name:string|null;loyalty:number;relation_score:number;
  }>(`SELECT title.id,title.tier,title.title_name,title.holder_name,title.holder_user_id,title.liege_title_id,
             liege.title_name AS liege_title_name,title.loyalty,title.relation_score
        FROM steppe_internal_titles title
        LEFT JOIN steppe_internal_titles liege ON liege.id=title.liege_title_id
       WHERE title.confederation_id=$1 AND title.status='ACTIVE'
       ORDER BY CASE title.tier WHEN 'KHAN' THEN 0 ELSE 1 END,title.title_name`,[confed.id])).rows;
  const holdings=(await client.query<{title_id:string;id:string;name:string}>(`
    SELECT holding.title_id,settlement.id,settlement.name
      FROM steppe_title_holdings holding JOIN settlements settlement ON settlement.id=holding.settlement_id
      JOIN steppe_internal_titles title ON title.id=holding.title_id
     WHERE title.confederation_id=$1 ORDER BY settlement.name`,[confed.id])).rows;
  const calls=(await client.query<{id:string;target_label:string;reason:string;opened_turn:number;status:"OPEN"|"CLOSED"|"CANCELLED"}>(`
    SELECT id,target_label,reason,opened_turn,status FROM steppe_war_calls
     WHERE confederation_id=$1 ORDER BY CASE status WHEN 'OPEN' THEN 0 ELSE 1 END,created_at DESC LIMIT 10`,[confed.id])).rows;
  const responses=calls.length?(await client.query<{
    war_call_id:string;title_id:string;title_name:string;holder_name:string;holder_user_id:string|null;
    response:"PENDING"|SteppeWarCallResponse|"UNANSWERED";channel_id:string|null;message_id:string|null;
  }>(`SELECT response.war_call_id,response.title_id,title.title_name,title.holder_name,title.holder_user_id,
             response.response,response.channel_id,response.message_id
        FROM steppe_war_call_responses response JOIN steppe_internal_titles title ON title.id=response.title_id
       WHERE response.war_call_id=ANY($1::uuid[]) ORDER BY title.title_name`,[calls.map((call)=>call.id)])).rows:[];
  const events=(await client.query<{
    game_turn:number;event_type:string;description:string;title_name:string|null;
    loyalty_delta:number;relation_delta:number;authority_delta:number;
  }>(`SELECT event.game_turn,event.event_type,event.description,title.title_name,
             event.loyalty_delta,event.relation_delta,event.authority_delta
        FROM steppe_political_events event LEFT JOIN steppe_internal_titles title ON title.id=event.title_id
       WHERE event.confederation_id=$1 ORDER BY event.created_at DESC LIMIT 20`,[confed.id])).rows;
  return{
    id:confed.id,countryId:confed.country_id,countryName:confed.country_name,
    authority:Number(confed.authority),currentTurn:Number(confed.current_turn),
    titles:titles.map((title)=>({
      id:title.id,tier:title.tier,titleName:title.title_name,holderName:title.holder_name,holderUserId:title.holder_user_id,
      liegeTitleId:title.liege_title_id,liegeTitleName:title.liege_title_name,loyalty:Number(title.loyalty),
      relationScore:Number(title.relation_score),holdings:holdings.filter((holding)=>holding.title_id===title.id).map(({id,name})=>({id,name}))
    })),
    warCalls:calls.map((call)=>({
      id:call.id,targetLabel:call.target_label,reason:call.reason,openedTurn:Number(call.opened_turn),status:call.status,
      responses:responses.filter((response)=>response.war_call_id===call.id).map((response)=>({
        warCallId:response.war_call_id,titleId:response.title_id,titleName:response.title_name,holderName:response.holder_name,
        holderUserId:response.holder_user_id,response:response.response,channelId:response.channel_id,messageId:response.message_id
      }))
    })),
    events:events.map((event)=>({turn:Number(event.game_turn),type:event.event_type,description:event.description,titleName:event.title_name,
      loyaltyDelta:Number(event.loyalty_delta),relationDelta:Number(event.relation_delta),authorityDelta:Number(event.authority_delta)}))
  };
}

export const steppePoliticsService={
  async countryForTitleHolder(guildId:string,userId:string):Promise<{id:string;name:string}|null>{
    return (await pool.query<{id:string;name:string}>(`
      SELECT country.id,country.name
        FROM steppe_internal_titles title
        JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
        JOIN countries country ON country.id=confederation.country_id
       WHERE confederation.guild_id=$1 AND confederation.status='ACTIVE' AND country.status='ACTIVE'
         AND title.status='ACTIVE' AND title.holder_user_id=$2
       ORDER BY CASE title.tier WHEN 'KHAN' THEN 0 ELSE 1 END,title.created_at LIMIT 1`,[guildId,userId])).rows[0]??null;
  },

  async view(guildId:string,countryId:string):Promise<SteppePoliticsView|null>{
    const client=await pool.connect();try{return await viewWithClient(client,guildId,countryId);}finally{client.release();}
  },

  async settlementDocumentAccess(guildId:string,countryId:string,userId:string):Promise<SteppeSettlementDocumentAccess|null>{
    const title=(await pool.query<{
      id:string;tier:SteppeTitleTier;title_name:string;holder_name:string;
    }>(`SELECT title.id,title.tier,title.title_name,title.holder_name
          FROM steppe_internal_titles title
          JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
         WHERE confederation.guild_id=$1 AND confederation.country_id=$2 AND confederation.status='ACTIVE'
           AND title.status='ACTIVE' AND title.holder_user_id=$3
         ORDER BY CASE title.tier WHEN 'KHAN' THEN 0 ELSE 1 END,title.created_at LIMIT 1`,
      [guildId,countryId,userId])).rows[0];
    if(!title)return null;
    const holdings=(await pool.query<{settlement_id:string}>(
      "SELECT settlement_id FROM steppe_title_holdings WHERE title_id=$1 ORDER BY created_at",[title.id]
    )).rows;
    return{tier:title.tier,titleName:title.title_name,holderName:title.holder_name,settlementIds:holdings.map((row)=>row.settlement_id)};
  },

  async setup(input:{guildId:string;countryId:string;actorId:string;holderName:string;holderUserId?:string|null;authority?:number}){
    return withTransaction(async(client)=>{
      const country=(await client.query<{id:string;name:string;current_turn:number}>(`
        SELECT country.id,country.name,guild.current_turn FROM countries country JOIN guilds guild ON guild.discord_id=country.guild_id
         WHERE country.id=$1 AND country.guild_id=$2 AND country.status='ACTIVE' FOR UPDATE OF country`,[input.countryId,input.guildId])).rows[0];
      if(!country)throw new GameError("Etkin bozkır devleti bulunamadı.");
      if((await confederation(client,input.guildId,input.countryId)))throw new GameError("Bu devletin bozkır iç siyaseti zaten kurulu.");
      const confed=(await client.query<{id:string}>(`
        INSERT INTO steppe_confederations(guild_id,country_id,authority,created_turn,created_by)
        VALUES($1,$2,$3,$4,$5) RETURNING id`,[input.guildId,input.countryId,clampSteppeAuthority(input.authority??70),country.current_turn,input.actorId])).rows[0]!;
      const title=(await client.query<{id:string}>(`
        INSERT INTO steppe_internal_titles(confederation_id,tier,title_name,holder_name,holder_user_id,loyalty,relation_score,created_turn)
        VALUES($1,'KHAN',$2,$3,$4,100,100,$5) RETURNING id`,
        [confed.id,`${country.name} Hanı`,input.holderName.trim(),input.holderUserId??null,country.current_turn])).rows[0]!;
      await addEvent(client,{confederationId:confed.id,turn:Number(country.current_turn),type:"CONFEDERATION_FOUNDED",titleId:title.id,
        actorId:input.actorId,description:`${country.name} bozkır hiyerarşisi kuruldu.`});
      await audit(client,input.guildId,input.actorId,"STEPPE_POLITICS_SETUP","steppe_confederation",confed.id,input);
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async addTitle(input:{guildId:string;countryId:string;actorId:string;titleName:string;holderName:string;holderUserId?:string|null;loyalty?:number;relationScore?:number}){
    return withTransaction(async(client)=>{
      const confed=await confederation(client,input.guildId,input.countryId,true);if(!confed)throw new GameError("Önce bozkır iç siyasetini kurun.");
      const liege=(await client.query<{id:string}>(
        "SELECT id FROM steppe_internal_titles WHERE confederation_id=$1 AND tier='KHAN' AND status='ACTIVE' FOR UPDATE",[confed.id]
      )).rows[0];if(!liege)throw new GameError("Bu devletin Han kaydı bulunamadı.");
      const title=(await client.query<{id:string}>(`
        INSERT INTO steppe_internal_titles(confederation_id,tier,title_name,holder_name,holder_user_id,liege_title_id,loyalty,relation_score,created_turn)
        VALUES($1,'LANDHOLDER',$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[confed.id,input.titleName.trim(),input.holderName.trim(),input.holderUserId??null,
          liege.id,clampSteppeLoyalty(input.loyalty??60),clampSteppeRelation(input.relationScore??0),confed.current_turn])).rows[0]!;
      await addEvent(client,{confederationId:confed.id,turn:confed.current_turn,type:"TITLE_CREATED",titleId:title.id,actorId:input.actorId,
        description:`${input.titleName.trim()} Toprak Ağalığı ${input.holderName.trim()} adına oluşturuldu.`,details:{tier:"LANDHOLDER",liegeTitleId:liege.id}});
      await audit(client,input.guildId,input.actorId,"STEPPE_TITLE_CREATE","steppe_internal_title",title.id,input);
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async assignHolding(input:{guildId:string;countryId:string;actorId:string;title:string;settlement:string}){
    return withTransaction(async(client)=>{
      const confed=await confederation(client,input.guildId,input.countryId,true);if(!confed)throw new GameError("Bozkır iç siyaseti kurulu değil.");
      const title=await titleByValue(client,confed.id,input.title,true);if(!title)throw new GameError("Bozkır unvanı bulunamadı.");
      if(title.tier!=="LANDHOLDER"&&title.tier!=="KHAN")throw new GameError("Yerleşke yalnızca Hana veya Toprak Ağasına bağlanabilir.");
      const settlement=(await client.query<{id:string;name:string}>(
        `SELECT id,name FROM settlements WHERE country_id=$1 AND (id::text=$2 OR lower(name)=lower($2)) LIMIT 1`,[input.countryId,input.settlement.trim()]
      )).rows[0];if(!settlement)throw new GameError("Bu devlete ait yerleşke bulunamadı.");
      await client.query(`INSERT INTO steppe_title_holdings(title_id,settlement_id,assigned_turn,assigned_by) VALUES($1,$2,$3,$4)
        ON CONFLICT(settlement_id) DO UPDATE SET title_id=EXCLUDED.title_id,assigned_turn=EXCLUDED.assigned_turn,assigned_by=EXCLUDED.assigned_by`,
      [title.id,settlement.id,confed.current_turn,input.actorId]);
      await addEvent(client,{confederationId:confed.id,turn:confed.current_turn,type:"HOLDING_ASSIGNED",titleId:title.id,actorId:input.actorId,
        description:`${settlement.name}, ${title.title_name} idaresine bağlandı.`,details:{settlementId:settlement.id}});
      await audit(client,input.guildId,input.actorId,"STEPPE_HOLDING_ASSIGN","steppe_internal_title",title.id,input);
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async setValues(input:{guildId:string;countryId:string;actorId:string;title?:string|null;authority?:number|null;loyalty?:number|null;relationScore?:number|null;reason:string}){
    return withTransaction(async(client)=>{
      if(input.authority==null&&input.loyalty==null&&input.relationScore==null)
        throw new GameError("Otorite, sadakat veya ilişki değerlerinden en az birini girin.");
      if(!input.title&&(input.loyalty!=null||input.relationScore!=null))
        throw new GameError("Sadakat veya ilişki düzenlemek için bir bozkır unvanı seçin.");
      const confed=await confederation(client,input.guildId,input.countryId,true);if(!confed)throw new GameError("Bozkır iç siyaseti kurulu değil.");
      let title:null|Awaited<ReturnType<typeof titleByValue>>=null;
      if(input.title){title=await titleByValue(client,confed.id,input.title,true);if(!title)throw new GameError("Bozkır unvanı bulunamadı.");}
      const nextAuthority=input.authority==null?Number(confed.authority):clampSteppeAuthority(input.authority);
      const nextLoyalty=!title||input.loyalty==null?title?.loyalty??0:clampSteppeLoyalty(input.loyalty);
      const nextRelation=!title||input.relationScore==null?title?.relation_score??0:clampSteppeRelation(input.relationScore);
      if(input.authority!=null)await client.query("UPDATE steppe_confederations SET authority=$2,updated_at=NOW() WHERE id=$1",[confed.id,nextAuthority]);
      if(title&&(input.loyalty!=null||input.relationScore!=null))await client.query(
        "UPDATE steppe_internal_titles SET loyalty=$2,relation_score=$3,updated_at=NOW() WHERE id=$1",[title.id,nextLoyalty,nextRelation]
      );
      const loyaltyDelta=title?nextLoyalty-Number(title.loyalty):0,relationDelta=title?nextRelation-Number(title.relation_score):0;
      const authorityDelta=nextAuthority-Number(confed.authority);
      await addEvent(client,{confederationId:confed.id,turn:confed.current_turn,type:"MANUAL_ADJUSTMENT",titleId:title?.id??null,actorId:input.actorId,
        loyaltyDelta,relationDelta,authorityDelta,description:input.reason});
      await audit(client,input.guildId,input.actorId,"STEPPE_POLITICS_ADJUST",title?"steppe_internal_title":"steppe_confederation",title?.id??confed.id,input);
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async openWarCall(input:{guildId:string;countryId:string;actorId:string;targetLabel:string;reason:string;gameMaster:boolean}){
    return withTransaction(async(client)=>{
      const confed=await confederation(client,input.guildId,input.countryId,true);if(!confed)throw new GameError("Bozkır iç siyaseti kurulu değil.");
      const khan=await client.query<{id:string;holder_user_id:string|null}>(
        "SELECT id,holder_user_id FROM steppe_internal_titles WHERE confederation_id=$1 AND tier='KHAN' AND status='ACTIVE' FOR UPDATE",[confed.id]
      );
      if(!khan.rows[0])throw new GameError("Han kaydı bulunamadı.");
      if(!input.gameMaster&&khan.rows[0].holder_user_id!==input.actorId)throw new GameError("Savaş çağrısını yalnızca ülkenin Hanı veya oyun yöneticisi yayımlayabilir.");
      if((await client.query("SELECT 1 FROM steppe_war_calls WHERE confederation_id=$1 AND status='OPEN'",[confed.id])).rowCount)
        throw new GameError("Önce mevcut açık savaş çağrısını sonuçlandırın.");
      const call=(await client.query<{id:string}>(`
        INSERT INTO steppe_war_calls(confederation_id,target_label,reason,opened_turn,opened_by)
        VALUES($1,$2,$3,$4,$5) RETURNING id`,[confed.id,input.targetLabel.trim(),input.reason.trim(),confed.current_turn,input.actorId])).rows[0]!;
      await client.query(`INSERT INTO steppe_war_call_responses(war_call_id,title_id)
        SELECT $1,id FROM steppe_internal_titles WHERE confederation_id=$2 AND tier='LANDHOLDER' AND status='ACTIVE'`,[call.id,confed.id]);
      const count=Number((await client.query<{count:number}>("SELECT COUNT(*)::int AS count FROM steppe_war_call_responses WHERE war_call_id=$1",[call.id])).rows[0]?.count??0);
      if(!count)throw new GameError("Savaş çağrısı gönderilecek etkin Toprak Ağası bulunmuyor.");
      await addEvent(client,{confederationId:confed.id,turn:confed.current_turn,type:"WAR_CALL_OPENED",titleId:khan.rows[0].id,actorId:input.actorId,
        description:`${input.targetLabel.trim()} için savaş çağrısı yayımlandı.`,details:{warCallId:call.id,reason:input.reason}});
      await audit(client,input.guildId,input.actorId,"STEPPE_WAR_CALL_OPEN","steppe_war_call",call.id,input);
      return (await viewWithClient(client,input.guildId,input.countryId))!.warCalls.find((item)=>item.id===call.id)!;
    });
  },

  async attachWarCallMessage(warCallId:string,titleId:string,channelId:string,messageId:string){
    await pool.query(`UPDATE steppe_war_call_responses SET channel_id=$3,message_id=$4
      WHERE war_call_id=$1 AND title_id=$2 AND response='PENDING'`,[warCallId,titleId,channelId,messageId]);
  },

  async response(warCallId:string,titleId:string):Promise<SteppeWarCallResponseView|null>{
    const row=(await pool.query<{
      war_call_id:string;title_id:string;title_name:string;holder_name:string;holder_user_id:string|null;
      response:"PENDING"|SteppeWarCallResponse|"UNANSWERED";channel_id:string|null;message_id:string|null;
    }>(`SELECT response.war_call_id,response.title_id,title.title_name,title.holder_name,title.holder_user_id,
              response.response,response.channel_id,response.message_id
         FROM steppe_war_call_responses response JOIN steppe_internal_titles title ON title.id=response.title_id
        WHERE response.war_call_id=$1 AND response.title_id=$2`,[warCallId,titleId])).rows[0];
    return row?{warCallId:row.war_call_id,titleId:row.title_id,titleName:row.title_name,holderName:row.holder_name,
      holderUserId:row.holder_user_id,response:row.response,channelId:row.channel_id,messageId:row.message_id}:null;
  },

  async respondWarCall(input:{guildId:string;actorId:string;warCallId:string;titleId:string;response:SteppeWarCallResponse;gameMaster:boolean}){
    return withTransaction(async(client)=>{
      const row=(await client.query<{
        confederation_id:string;country_id:string;current_turn:number;call_status:string;response_status:string;
        title_name:string;holder_user_id:string|null;loyalty:number;relation_score:number;authority:number;
      }>(`SELECT call.confederation_id,confederation.country_id,guild.current_turn,call.status AS call_status,
                response.response AS response_status,title.title_name,title.holder_user_id,title.loyalty,title.relation_score,confederation.authority
           FROM steppe_war_call_responses response
           JOIN steppe_war_calls call ON call.id=response.war_call_id
           JOIN steppe_confederations confederation ON confederation.id=call.confederation_id
           JOIN guilds guild ON guild.discord_id=confederation.guild_id
           JOIN steppe_internal_titles title ON title.id=response.title_id
          WHERE response.war_call_id=$1 AND response.title_id=$2 AND confederation.guild_id=$3
          FOR UPDATE OF response,title,confederation,call`,[input.warCallId,input.titleId,input.guildId])).rows[0];
      if(!row)throw new GameError("Savaş çağrısı yanıt kaydı bulunamadı.");
      if(row.call_status!=="OPEN"||row.response_status!=="PENDING")throw new GameError("Bu savaş çağrısı artık yanıtlanamaz.");
      if(!input.gameMaster&&row.holder_user_id!==input.actorId)throw new GameError("Bu çağrıyı yalnızca ilgili Toprak Ağası veya oyun yöneticisi yanıtlayabilir.");
      const effect=STEPPE_WAR_CALL_RESPONSES[input.response];if(!effect)throw new GameError("Geçersiz savaş çağrısı yanıtı.");
      await client.query("UPDATE steppe_internal_titles SET loyalty=$2,relation_score=$3,updated_at=NOW() WHERE id=$1",
        [input.titleId,clampSteppeLoyalty(Number(row.loyalty)+effect.loyaltyDelta),clampSteppeRelation(Number(row.relation_score)+effect.relationDelta)]);
      await client.query("UPDATE steppe_confederations SET authority=$2,updated_at=NOW() WHERE id=$1",
        [row.confederation_id,clampSteppeAuthority(Number(row.authority)+effect.authorityDelta)]);
      await client.query(`UPDATE steppe_war_call_responses SET response=$3,loyalty_delta=$4,relation_delta=$5,authority_delta=$6,
        responded_by=$7,responded_at=NOW() WHERE war_call_id=$1 AND title_id=$2`,
      [input.warCallId,input.titleId,input.response,effect.loyaltyDelta,effect.relationDelta,effect.authorityDelta,input.actorId]);
      await addEvent(client,{confederationId:row.confederation_id,turn:Number(row.current_turn),type:"WAR_CALL_RESPONSE",titleId:input.titleId,
        actorId:input.actorId,loyaltyDelta:effect.loyaltyDelta,relationDelta:effect.relationDelta,authorityDelta:effect.authorityDelta,
        description:`${row.title_name} savaş çağrısına ${effect.label} yanıtını verdi.`,details:{warCallId:input.warCallId,response:input.response}});
      await audit(client,input.guildId,input.actorId,"STEPPE_WAR_CALL_RESPONSE","steppe_war_call",input.warCallId,input);
      return{countryId:row.country_id,effect};
    });
  },

  async closeWarCall(input:{guildId:string;countryId:string;actorId:string;warCallId:string}){
    return withTransaction(async(client)=>{
      const confed=await confederation(client,input.guildId,input.countryId,true);if(!confed)throw new GameError("Bozkır iç siyaseti kurulu değil.");
      const call=(await client.query<{id:string}>(
        "SELECT id FROM steppe_war_calls WHERE id=$1 AND confederation_id=$2 AND status='OPEN' FOR UPDATE",[input.warCallId,confed.id]
      )).rows[0];if(!call)throw new GameError("Açık savaş çağrısı bulunamadı.");
      const pending=(await client.query<{title_id:string;title_name:string;loyalty:number;relation_score:number}>(`
        SELECT title.id AS title_id,title.title_name,title.loyalty,title.relation_score
          FROM steppe_war_call_responses response JOIN steppe_internal_titles title ON title.id=response.title_id
         WHERE response.war_call_id=$1 AND response.response='PENDING' FOR UPDATE OF response,title`,[call.id])).rows;
      let authority=Number(confed.authority);
      for(const title of pending){
        const effect=STEPPE_UNANSWERED_WAR_CALL;
        authority=clampSteppeAuthority(authority+effect.authorityDelta);
        await client.query("UPDATE steppe_internal_titles SET loyalty=$2,relation_score=$3,updated_at=NOW() WHERE id=$1",
          [title.title_id,clampSteppeLoyalty(Number(title.loyalty)+effect.loyaltyDelta),clampSteppeRelation(Number(title.relation_score)+effect.relationDelta)]);
        await client.query(`UPDATE steppe_war_call_responses SET response='UNANSWERED',loyalty_delta=$3,relation_delta=$4,authority_delta=$5,
          responded_by=$6,responded_at=NOW() WHERE war_call_id=$1 AND title_id=$2`,
        [call.id,title.title_id,effect.loyaltyDelta,effect.relationDelta,effect.authorityDelta,input.actorId]);
        await addEvent(client,{confederationId:confed.id,turn:confed.current_turn,type:"WAR_CALL_UNANSWERED",titleId:title.title_id,actorId:input.actorId,
          ...effect,description:`${title.title_name} savaş çağrısını cevapsız bıraktı.`,details:{warCallId:call.id}});
      }
      await client.query("UPDATE steppe_confederations SET authority=$2,updated_at=NOW() WHERE id=$1",[confed.id,authority]);
      await client.query("UPDATE steppe_war_calls SET status='CLOSED',closed_by=$2,closed_at=NOW() WHERE id=$1",[call.id,input.actorId]);
      await audit(client,input.guildId,input.actorId,"STEPPE_WAR_CALL_CLOSE","steppe_war_call",call.id,{unanswered:pending.length});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  }
};
