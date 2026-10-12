import {pool,withTransaction,type DbClient} from "../db/pool.js";
import {
  clampSteppeAuthority,STEPPE_UNANSWERED_WAR_CALL,
  STEPPE_CONFLICT_LABELS,STEPPE_WAR_CALL_RESPONSES,
  type SteppeConflictType,type SteppeTitleTier,type SteppeWarCallResponse
} from "../domain/steppe-politics.js";
import {GameError} from "./game-service.js";

export interface SteppeInternalTitleView{
  id:string;tier:SteppeTitleTier;titleName:string;holderName:string;holderUserId:string|null;
  liegeTitleId:string|null;liegeTitleName:string|null;
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
  events:Array<{turn:number;type:string;description:string;titleName:string|null;authorityDelta:number}>;
  conflicts:SteppeConflictView[];
}
export interface SteppeConflictView{
  id:string;type:SteppeConflictType;attackerTitleId:string;attackerTitleName:string;attackerHolderName:string;
  defenderTitleId:string;defenderTitleName:string;defenderHolderName:string;objectiveSettlementId:string|null;
  objectiveSettlementName:string|null;reason:string;status:"ACTIVE"|"RESOLVED"|"CANCELLED";openedTurn:number;
  battleId:string|null;battleStatus:string|null;winnerTitleId:string|null;winnerTitleName:string|null;resolutionReason:string|null;
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
    liege_title_id:string|null;
  }>(`SELECT id,tier,title_name,holder_name,holder_user_id,liege_title_id
        FROM steppe_internal_titles
       WHERE confederation_id=$1 AND status='ACTIVE' AND (id::text=$2 OR lower(title_name)=lower($2))
       LIMIT 1 ${lock?"FOR UPDATE":""}`,[confederationId,value.trim()])).rows[0]??null;
}

async function titleAcrossGuild(client:DbClient,guildId:string,value:string,lock=false){
  const token=value.trim();
  return (await client.query<{
    id:string;tier:SteppeTitleTier;title_name:string;holder_name:string;holder_user_id:string|null;
    liege_title_id:string|null;confederation_id:string;country_id:string;country_name:string;authority:number;current_turn:number;
  }>(`SELECT title.id,title.tier,title.title_name,title.holder_name,title.holder_user_id,title.liege_title_id,
             confederation.id AS confederation_id,confederation.country_id,
             country.name AS country_name,confederation.authority,guild.current_turn
        FROM steppe_internal_titles title
        JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
        JOIN countries country ON country.id=confederation.country_id
        JOIN guilds guild ON guild.discord_id=confederation.guild_id
       WHERE confederation.guild_id=$1 AND confederation.status='ACTIVE' AND title.status='ACTIVE'
         AND (title.id::text=$2 OR lower(title.title_name)=lower($2) OR lower(title.holder_name)=lower($2))
       ORDER BY CASE WHEN title.id::text=$2 THEN 0 WHEN lower(title.title_name)=lower($2) THEN 1 ELSE 2 END
       LIMIT 1 ${lock?"FOR UPDATE OF title,confederation":""}`,[guildId,token])).rows[0]??null;
}

async function addEvent(client:DbClient,input:{
  confederationId:string;turn:number;type:string;titleId?:string|null;actorId:string;
  authorityDelta?:number;description:string;details?:unknown;
}){
  await client.query(
    `INSERT INTO steppe_political_events(
       confederation_id,game_turn,event_type,title_id,actor_user_id,loyalty_delta,relation_delta,authority_delta,description,details
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [input.confederationId,input.turn,input.type,input.titleId??null,input.actorId,0,0,
      input.authorityDelta??0,input.description,JSON.stringify(input.details??{})]
  );
}

async function audit(client:DbClient,guildId:string,actorId:string,action:string,entityType:string,entityId:string|null,details:unknown){
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId,actorId,action,entityType,entityId,JSON.stringify(details)]
  );
}

interface SteppeFamilyNames{
  spouse:string;father:string;mother:string;brother:string;sister:string;son:string;daughter:string;
}

function titleFamilyNames(countryName:string,titleId:string):SteppeFamilyNames{
  const slot=Number.parseInt(titleId.replaceAll("-","").slice(0,8),16)%4;
  const country=countryName.toLocaleLowerCase("tr-TR");
  const pools:SteppeFamilyNames[]=country.includes("xiongnu")?[
    {spouse:"Altani",father:"Touman",mother:"Eje",brother:"Laoshang",sister:"Saranai",son:"Tumen",daughter:"Aybüke"},
    {spouse:"Börte",father:"Jizhu",mother:"Ulan",brother:"Hulugu",sister:"Yesui",son:"Jiyu",daughter:"İlbilge"},
    {spouse:"Qulan",father:"Xuluquan",mother:"Yanzhi",brother:"Udan",sister:"Alçi",son:"Huhanye",daughter:"Yulduz"},
    {spouse:"Yimeng",father:"Wuwei",mother:"Gua",brother:"Woyanqudi",sister:"Qutlu",son:"Zhizhi",daughter:"Alçina"}
  ]:country.includes("xianbei")?[
    {spouse:"Murong Lian",father:"Tulu",mother:"Aru",brother:"Qifu",sister:"Lihua",son:"Tanshihuai",daughter:"Yueying"},
    {spouse:"Tuoba Yue",father:"Mohan",mother:"Yuehua",brother:"Yuwen",sister:"Ruolan",son:"Murong Hui",daughter:"Mulan"},
    {spouse:"Yuwen Lan",father:"Kebineng",mother:"Mingzhu",brother:"Duan",sister:"Xiaolian",son:"Tuoba Liwei",daughter:"Xiaoyan"},
    {spouse:"Duan Ming",father:"Pifu",mother:"Lanying",brother:"Helian",sister:"Meilin",son:"Yuwen Mohuai",daughter:"Lanyue"}
  ]:[
    {spouse:"Saran",father:"Boro",mother:"Alun",brother:"Kara Boro",sister:"Aybüke",son:"Alp Boro",daughter:"Selenge"},
    {spouse:"Ayana",father:"Tarkan",mother:"Umay",brother:"Kutlug",sister:"Bengisu",son:"İlter",daughter:"Aysun"},
    {spouse:"Qulan",father:"Erkin",mother:"İlbilge",brother:"Bars",sister:"Aruna",son:"Kağan",daughter:"Altınçiçek"},
    {spouse:"Altunai",father:"Buka",mother:"Yulduz",brother:"Temür",sister:"Sevin",son:"Tirig",daughter:"Günay"}
  ];
  return pools[slot]!;
}

async function ensureTitleDynasty(client:DbClient,input:{
  guildId:string;countryId:string;countryName:string;titleId:string;tier:SteppeTitleTier;titleName:string;holderName:string;turn:number;actorId:string;
}):Promise<void>{
  const houseName=`${input.holderName}${input.tier==="KHAN"?" Han Hanesi":" Hanesi"}`.slice(0,80);
  const dynasty=(await client.query<{id:string}>(`INSERT INTO dynasties(guild_id,country_id,steppe_title_id,name,created_by)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(steppe_title_id) WHERE steppe_title_id IS NOT NULL DO UPDATE SET updated_at=NOW()
    RETURNING id`,[input.guildId,input.countryId,input.titleId,houseName,input.actorId])).rows[0]!;
  if((await client.query("SELECT 1 FROM dynasty_members WHERE dynasty_id=$1 LIMIT 1",[dynasty.id])).rowCount)return;
  const rootAge=input.tier==="KHAN"?42:38;
  const member=(await client.query<{id:string}>(`INSERT INTO dynasty_members(
    dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,born_turn
  ) VALUES($1,$2,'MALE',$3,$4,'Hane Reisi','ALIVE','HEALTHY',TRUE,FALSE,$5) RETURNING id`,
  [dynasty.id,input.holderName,rootAge,input.titleName,input.turn-rootAge])).rows[0]!;
  const names=titleFamilyNames(input.countryName,input.titleId);
  const spouseAge=input.tier==="KHAN"?36:33;
  const fatherAge=input.tier==="KHAN"?66:62;
  const motherAge=input.tier==="KHAN"?63:59;
  const spouse=(await client.query<{id:string}>(`INSERT INTO dynasty_members(
    dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,born_turn
  ) VALUES($1,$2,'FEMALE',$3,$4,'Hane Reisinin Eşi','ALIVE','HEALTHY',FALSE,FALSE,$5) RETURNING id`,
  [dynasty.id,names.spouse,spouseAge,input.tier==="KHAN"?"Han Eşi":"Toprak Ağası Eşi",input.turn-spouseAge])).rows[0]!;
  const father=(await client.query<{id:string}>(`INSERT INTO dynasty_members(
    dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,born_turn
  ) VALUES($1,$2,'MALE',$3,$4,'Hane Reisinin Babası','ALIVE','HEALTHY',FALSE,FALSE,$5) RETURNING id`,
  [dynasty.id,names.father,fatherAge,input.tier==="KHAN"?"Eski Han":"Aksakal",input.turn-fatherAge])).rows[0]!;
  const mother=(await client.query<{id:string}>(`INSERT INTO dynasty_members(
    dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,born_turn
  ) VALUES($1,$2,'FEMALE',$3,'Hatun','Hane Reisinin Annesi','ALIVE','HEALTHY',FALSE,FALSE,$4) RETURNING id`,
  [dynasty.id,names.mother,motherAge,input.turn-motherAge])).rows[0]!;
  await client.query("UPDATE dynasty_members SET spouse_id=$1,father_id=$2,mother_id=$3,updated_at=NOW() WHERE id=$4",
    [spouse.id,father.id,mother.id,member.id]);
  await client.query("UPDATE dynasty_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2",[member.id,spouse.id]);
  const brotherAge=input.tier==="KHAN"?37:33;
  const sisterAge=input.tier==="KHAN"?34:30;
  const sonAge=input.tier==="KHAN"?18:16;
  const daughterAge=input.tier==="KHAN"?15:13;
  await client.query(`INSERT INTO dynasty_members(
    dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,succession_rank,mother_id,father_id,born_turn
  ) VALUES
    ($1,$2,'MALE',$3,$4,'Hane Reisinin Erkek Kardeşi','ALIVE','HEALTHY',FALSE,FALSE,3,$5,$6,$7),
    ($1,$8,'FEMALE',$9,$4,'Hane Reisinin Kız Kardeşi','ALIVE','HEALTHY',FALSE,FALSE,4,$5,$6,$10),
    ($1,$11,'MALE',$12,$13,'Hane Reisinin Oğlu','ALIVE','HEALTHY',FALSE,TRUE,1,$14,$15,$16),
    ($1,$17,'FEMALE',$18,$19,'Hane Reisinin Kızı','ALIVE','HEALTHY',FALSE,FALSE,2,$14,$15,$20)`,[
    dynasty.id,names.brother,brotherAge,input.tier==="KHAN"?"Han Kardeşi":"Ağa Kardeşi",mother.id,father.id,input.turn-brotherAge,
    names.sister,sisterAge,input.turn-sisterAge,names.son,sonAge,input.tier==="KHAN"?"Han Oğlu":"Ağa Oğlu",spouse.id,member.id,input.turn-sonAge,
    names.daughter,daughterAge,input.tier==="KHAN"?"Han Kızı":"Ağa Kızı",input.turn-daughterAge
  ]);
  await client.query(`INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,member_id,details)
    VALUES($1,$2,'DYNASTY_CREATED',$3,$4::jsonb)`,[dynasty.id,input.turn,member.id,JSON.stringify({
      name:houseName,source:"STEPPE_TITLE_FAMILY",titleId:input.titleId,titleName:input.titleName
    })]);
  await client.query(`INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,details)
    VALUES($1,$2,'FAMILY_ROSTER_INITIALIZED',$3::jsonb)`,[dynasty.id,input.turn,JSON.stringify({
      source:"STEPPE_TITLE_FAMILY",memberCount:8,titleId:input.titleId,titleName:input.titleName
    })]);
}

async function viewWithClient(client:DbClient,guildId:string,countryId:string):Promise<SteppePoliticsView|null>{
  const confed=await confederation(client,guildId,countryId);
  if(!confed)return null;
  const titles=(await client.query<{
    id:string;tier:SteppeTitleTier;title_name:string;holder_name:string;holder_user_id:string|null;
    liege_title_id:string|null;liege_title_name:string|null;
  }>(`SELECT title.id,title.tier,title.title_name,title.holder_name,title.holder_user_id,title.liege_title_id,
             liege.title_name AS liege_title_name
        FROM steppe_internal_titles title
        LEFT JOIN steppe_internal_titles liege ON liege.id=title.liege_title_id
       WHERE title.confederation_id=$1 AND title.status='ACTIVE' AND title.tier='KHAN'
       ORDER BY CASE title.tier WHEN 'KHAN' THEN 0 ELSE 1 END,title.title_name`,[confed.id])).rows;
  const holdings=(await client.query<{title_id:string;id:string;name:string}>(`
    SELECT title.id AS title_id,settlement.id,settlement.name
      FROM steppe_internal_titles title
      JOIN settlements settlement ON settlement.country_id=$2
     WHERE title.confederation_id=$1 AND title.status='ACTIVE' AND title.tier='KHAN'
     ORDER BY settlement.name`,[confed.id,countryId])).rows;
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
    authority_delta:number;
  }>(`SELECT event.game_turn,event.event_type,event.description,title.title_name,
             event.authority_delta
        FROM steppe_political_events event LEFT JOIN steppe_internal_titles title ON title.id=event.title_id
       WHERE event.confederation_id=$1 ORDER BY event.created_at DESC LIMIT 20`,[confed.id])).rows;
  const conflicts=(await client.query<{
    id:string;conflict_type:SteppeConflictType;attacker_title_id:string;attacker_title_name:string;attacker_holder_name:string;
    defender_title_id:string;defender_title_name:string;defender_holder_name:string;objective_settlement_id:string|null;
    objective_settlement_name:string|null;reason:string;status:"ACTIVE"|"RESOLVED"|"CANCELLED";opened_turn:number;
    battle_id:string|null;battle_status:string|null;winner_title_id:string|null;winner_title_name:string|null;resolution_reason:string|null;
  }>(`SELECT conflict.id,conflict.conflict_type,conflict.attacker_title_id,attacker.title_name AS attacker_title_name,
             attacker.holder_name AS attacker_holder_name,conflict.defender_title_id,defender.title_name AS defender_title_name,
             defender.holder_name AS defender_holder_name,conflict.objective_settlement_id,settlement.name AS objective_settlement_name,
             conflict.reason,conflict.status,conflict.opened_turn,conflict.battle_id,battle.status AS battle_status,
             conflict.winner_title_id,winner.title_name AS winner_title_name,conflict.resolution_reason
        FROM steppe_internal_conflicts conflict
        JOIN steppe_internal_titles attacker ON attacker.id=conflict.attacker_title_id
        JOIN steppe_internal_titles defender ON defender.id=conflict.defender_title_id
        LEFT JOIN settlements settlement ON settlement.id=conflict.objective_settlement_id
        LEFT JOIN battles battle ON battle.id=conflict.battle_id
        LEFT JOIN steppe_internal_titles winner ON winner.id=conflict.winner_title_id
       WHERE conflict.guild_id=$1 AND (attacker.confederation_id=$2 OR defender.confederation_id=$2)
       ORDER BY CASE conflict.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,conflict.created_at DESC LIMIT 20`,[guildId,confed.id])).rows;
  return{
    id:confed.id,countryId:confed.country_id,countryName:confed.country_name,
    authority:Number(confed.authority),currentTurn:Number(confed.current_turn),
    titles:titles.map((title)=>({
      id:title.id,tier:title.tier,titleName:title.title_name,holderName:title.holder_name,holderUserId:title.holder_user_id,
      liegeTitleId:title.liege_title_id,liegeTitleName:title.liege_title_name,
      holdings:holdings.filter((holding)=>holding.title_id===title.id).map(({id,name})=>({id,name}))
    })),
    warCalls:calls.map((call)=>({
      id:call.id,targetLabel:call.target_label,reason:call.reason,openedTurn:Number(call.opened_turn),status:call.status,
      responses:responses.filter((response)=>response.war_call_id===call.id).map((response)=>({
        warCallId:response.war_call_id,titleId:response.title_id,titleName:response.title_name,holderName:response.holder_name,
        holderUserId:response.holder_user_id,response:response.response,channelId:response.channel_id,messageId:response.message_id
      }))
    })),
    events:events.map((event)=>({turn:Number(event.game_turn),type:event.event_type,description:event.description,titleName:event.title_name,
      authorityDelta:Number(event.authority_delta)})),
    conflicts:conflicts.map((conflict)=>({id:conflict.id,type:conflict.conflict_type,attackerTitleId:conflict.attacker_title_id,
      attackerTitleName:conflict.attacker_title_name,attackerHolderName:conflict.attacker_holder_name,
      defenderTitleId:conflict.defender_title_id,defenderTitleName:conflict.defender_title_name,defenderHolderName:conflict.defender_holder_name,
      objectiveSettlementId:conflict.objective_settlement_id,objectiveSettlementName:conflict.objective_settlement_name,
      reason:conflict.reason,status:conflict.status,openedTurn:Number(conflict.opened_turn),battleId:conflict.battle_id,
      battleStatus:conflict.battle_status,winnerTitleId:conflict.winner_title_id,winnerTitleName:conflict.winner_title_name,
      resolutionReason:conflict.resolution_reason}))
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
    if(title.tier==="KHAN"){
      const settlements=(await pool.query<{id:string}>(
        "SELECT id FROM settlements WHERE country_id=$1 ORDER BY name",[countryId]
      )).rows;
      return{tier:title.tier,titleName:title.title_name,holderName:title.holder_name,settlementIds:settlements.map((row)=>row.id)};
    }
    const holdings=(await pool.query<{settlement_id:string}>(
      "SELECT settlement_id FROM steppe_title_holdings WHERE title_id=$1 ORDER BY created_at",[title.id]
    )).rows;
    return{tier:title.tier,titleName:title.title_name,holderName:title.holder_name,settlementIds:holdings.map((row)=>row.settlement_id)};
  },

  async isActiveSteppeCountry(guildId:string,countryId:string):Promise<boolean>{
    return Boolean((await pool.query(`
      SELECT 1
        FROM steppe_confederations
       WHERE guild_id=$1 AND country_id=$2 AND status='ACTIVE'
       LIMIT 1`,[guildId,countryId])).rowCount);
  },

  async setup(input:{guildId:string;countryId:string;actorId:string;holderName:string;holderUserId?:string|null;authority?:number}){
    return withTransaction(async(client)=>{
      const country=(await client.query<{id:string;name:string;current_turn:number;is_steppe_state:boolean}>(`
        SELECT country.id,country.name,country.is_steppe_state,guild.current_turn FROM countries country JOIN guilds guild ON guild.discord_id=country.guild_id
         WHERE country.id=$1 AND country.guild_id=$2 AND country.status='ACTIVE' FOR UPDATE OF country`,[input.countryId,input.guildId])).rows[0];
      if(!country)throw new GameError("Etkin bozkır devleti bulunamadı.");
      if(!country.is_steppe_state)throw new GameError("Bozkır siyaseti yalnızca Xiongnu, Dingling ve Xianbei konfederasyonlarında kullanılabilir.");
      if((await confederation(client,input.guildId,input.countryId)))throw new GameError("Bu devletin bozkır iç siyaseti zaten kurulu.");
      const confed=(await client.query<{id:string}>(`
        INSERT INTO steppe_confederations(guild_id,country_id,authority,created_turn,created_by)
        VALUES($1,$2,$3,$4,$5) RETURNING id`,[input.guildId,input.countryId,clampSteppeAuthority(input.authority??70),country.current_turn,input.actorId])).rows[0]!;
      const title=(await client.query<{id:string}>(`
        INSERT INTO steppe_internal_titles(confederation_id,tier,title_name,holder_name,holder_user_id,loyalty,relation_score,created_turn)
        VALUES($1,'KHAN',$2,$3,$4,100,100,$5) RETURNING id`,
        [confed.id,`${country.name} Hanı`,input.holderName.trim(),input.holderUserId??null,country.current_turn])).rows[0]!;
      await ensureTitleDynasty(client,{guildId:input.guildId,countryId:country.id,countryName:country.name,titleId:title.id,tier:"KHAN",
        titleName:`${country.name} Hanı`,holderName:input.holderName.trim(),turn:Number(country.current_turn),actorId:input.actorId});
      await client.query(`
        INSERT INTO country_special_unit_unlocks(country_id,unit_type,granted_by)
        SELECT $1,unlocked.unit_type,$2
        FROM unnest($3::text[]) AS unlocked(unit_type)
        ON CONFLICT(country_id,unit_type) DO NOTHING`,
      [country.id,input.actorId,["steppe_horse_archer","steppe_cavalry","kurgan_shieldbearer","oba_archer"]]);
      await addEvent(client,{confederationId:confed.id,turn:Number(country.current_turn),type:"CONFEDERATION_FOUNDED",titleId:title.id,
        actorId:input.actorId,description:`${country.name} bozkır hiyerarşisi kuruldu.`});
      await audit(client,input.guildId,input.actorId,"STEPPE_POLITICS_SETUP","steppe_confederation",confed.id,input);
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async addTitle(input:{guildId:string;countryId:string;actorId:string;titleName:string;holderName:string;holderUserId?:string|null}){
    return withTransaction(async(client)=>{
      const confed=await confederation(client,input.guildId,input.countryId,true);if(!confed)throw new GameError("Önce bozkır iç siyasetini kurun.");
      const liege=(await client.query<{id:string}>(
        "SELECT id FROM steppe_internal_titles WHERE confederation_id=$1 AND tier='KHAN' AND status='ACTIVE' FOR UPDATE",[confed.id]
      )).rows[0];if(!liege)throw new GameError("Bu devletin Han kaydı bulunamadı.");
      const title=(await client.query<{id:string}>(`
        INSERT INTO steppe_internal_titles(confederation_id,tier,title_name,holder_name,holder_user_id,liege_title_id,loyalty,relation_score,created_turn)
        VALUES($1,'LANDHOLDER',$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[confed.id,input.titleName.trim(),input.holderName.trim(),input.holderUserId??null,
          liege.id,60,0,confed.current_turn])).rows[0]!;
      await ensureTitleDynasty(client,{guildId:input.guildId,countryId:input.countryId,countryName:confed.country_name,titleId:title.id,tier:"LANDHOLDER",
        titleName:input.titleName.trim(),holderName:input.holderName.trim(),turn:confed.current_turn,actorId:input.actorId});
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

  async setAuthority(input:{guildId:string;countryId:string;actorId:string;authority:number;reason:string}){
    return withTransaction(async(client)=>{
      const confed=await confederation(client,input.guildId,input.countryId,true);if(!confed)throw new GameError("Bozkır iç siyaseti kurulu değil.");
      const nextAuthority=clampSteppeAuthority(input.authority);
      await client.query("UPDATE steppe_confederations SET authority=$2,updated_at=NOW() WHERE id=$1",[confed.id,nextAuthority]);
      const authorityDelta=nextAuthority-Number(confed.authority);
      await addEvent(client,{confederationId:confed.id,turn:confed.current_turn,type:"MANUAL_AUTHORITY_ADJUSTMENT",actorId:input.actorId,
        authorityDelta,description:input.reason});
      await audit(client,input.guildId,input.actorId,"STEPPE_AUTHORITY_ADJUST","steppe_confederation",confed.id,input);
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
        title_name:string;holder_user_id:string|null;authority:number;
      }>(`SELECT call.confederation_id,confederation.country_id,guild.current_turn,call.status AS call_status,
                response.response AS response_status,title.title_name,title.holder_user_id,confederation.authority
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
      await client.query("UPDATE steppe_confederations SET authority=$2,updated_at=NOW() WHERE id=$1",
        [row.confederation_id,clampSteppeAuthority(Number(row.authority)+effect.authorityDelta)]);
      await client.query(`UPDATE steppe_war_call_responses SET response=$3,loyalty_delta=$4,relation_delta=$5,authority_delta=$6,
        responded_by=$7,responded_at=NOW() WHERE war_call_id=$1 AND title_id=$2`,
      [input.warCallId,input.titleId,input.response,0,0,effect.authorityDelta,input.actorId]);
      await addEvent(client,{confederationId:row.confederation_id,turn:Number(row.current_turn),type:"WAR_CALL_RESPONSE",titleId:input.titleId,
        actorId:input.actorId,authorityDelta:effect.authorityDelta,
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
      const pending=(await client.query<{title_id:string;title_name:string}>(`
        SELECT title.id AS title_id,title.title_name
          FROM steppe_war_call_responses response JOIN steppe_internal_titles title ON title.id=response.title_id
         WHERE response.war_call_id=$1 AND response.response='PENDING' FOR UPDATE OF response,title`,[call.id])).rows;
      let authority=Number(confed.authority);
      for(const title of pending){
        const effect=STEPPE_UNANSWERED_WAR_CALL;
        authority=clampSteppeAuthority(authority+effect.authorityDelta);
        await client.query(`UPDATE steppe_war_call_responses SET response='UNANSWERED',loyalty_delta=$3,relation_delta=$4,authority_delta=$5,
          responded_by=$6,responded_at=NOW() WHERE war_call_id=$1 AND title_id=$2`,
        [call.id,title.title_id,0,0,effect.authorityDelta,input.actorId]);
        await addEvent(client,{confederationId:confed.id,turn:confed.current_turn,type:"WAR_CALL_UNANSWERED",titleId:title.title_id,actorId:input.actorId,
          ...effect,description:`${title.title_name} savaş çağrısını cevapsız bıraktı.`,details:{warCallId:call.id}});
      }
      await client.query("UPDATE steppe_confederations SET authority=$2,updated_at=NOW() WHERE id=$1",[confed.id,authority]);
      await client.query("UPDATE steppe_war_calls SET status='CLOSED',closed_by=$2,closed_at=NOW() WHERE id=$1",[call.id,input.actorId]);
      await audit(client,input.guildId,input.actorId,"STEPPE_WAR_CALL_CLOSE","steppe_war_call",call.id,{unanswered:pending.length});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async titleChoices(guildId:string,countryId?:string|null){
    return (await pool.query<{id:string;title_name:string;holder_name:string;holder_user_id:string|null;tier:SteppeTitleTier;country_id:string;country_name:string}>(`
      SELECT title.id,title.title_name,title.holder_name,title.holder_user_id,title.tier,confederation.country_id,country.name AS country_name
        FROM steppe_internal_titles title
        JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
        JOIN countries country ON country.id=confederation.country_id
       WHERE confederation.guild_id=$1 AND confederation.status='ACTIVE' AND title.status='ACTIVE'
         AND ($2::uuid IS NULL OR confederation.country_id=$2)
       ORDER BY country.name,CASE title.tier WHEN 'KHAN' THEN 0 ELSE 1 END,title.title_name`,[guildId,countryId??null])).rows;
  },

  async armyChoices(guildId:string,titleValue:string){
    const client=await pool.connect();
    try{
      const title=await titleAcrossGuild(client,guildId,titleValue);if(!title)return[];
      return (await client.query<{id:string;name:string;total:number;steppe_title_id:string|null}>(`
        SELECT army.id,army.name,COALESCE(SUM(unit.quantity),0)::integer AS total,army.steppe_title_id
          FROM armies army LEFT JOIN army_units unit ON unit.army_id=army.id
         WHERE army.guild_id=$1 AND army.country_id=$2
         GROUP BY army.id,army.name,army.steppe_title_id ORDER BY army.name`,[guildId,title.country_id])).rows;
    }finally{client.release();}
  },

  async assignArmy(input:{guildId:string;actorId:string;title:string;army:string;gameMaster:boolean}){
    return withTransaction(async(client)=>{
      const title=await titleAcrossGuild(client,input.guildId,input.title,true);if(!title)throw new GameError("Bozkır unvanı bulunamadı.");
      if(!input.gameMaster&&title.holder_user_id!==input.actorId)throw new GameError("Bir orduyu yalnızca kendi bozkır unvanınıza bağlayabilirsiniz.");
      const army=(await client.query<{id:string;name:string;country_id:string}>(`
        SELECT id,name,country_id FROM armies WHERE guild_id=$1 AND country_id=$2 AND (id::text=$3 OR lower(name)=lower($3)) FOR UPDATE`,
      [input.guildId,title.country_id,input.army.trim()])).rows[0];
      if(!army)throw new GameError("Bu bozkır devletine ait ordu bulunamadı.");
      if((await client.query(`SELECT 1 FROM battle_army_assignments assignment
        JOIN battles battle ON battle.id=assignment.battle_id
        WHERE assignment.army_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,[army.id])).rowCount)
        throw new GameError("Etkin bir savaşta bulunan ordunun bozkır unvanı değiştirilemez.");
      const invalid=(await client.query<{name:string}>(`
        SELECT DISTINCT settlement.name FROM army_units unit
        JOIN settlements settlement ON settlement.id=unit.settlement_id
        WHERE unit.army_id=$1 AND NOT EXISTS(
          SELECT 1 FROM steppe_title_holdings holding WHERE holding.title_id=$2 AND holding.settlement_id=unit.settlement_id
        )`,[army.id,title.id])).rows;
      if(invalid.length)throw new GameError(`Ordu, unvanın mülkü olmayan yerleşkelerden birlik içeriyor: ${invalid.map((row)=>row.name).join(", ")}.`);
      if(!(await client.query("SELECT 1 FROM army_units WHERE army_id=$1 LIMIT 1",[army.id])).rowCount)
        throw new GameError("Boş bir ordu bozkır unvanına bağlanamaz.");
      await client.query("UPDATE armies SET steppe_title_id=$2,updated_at=NOW() WHERE id=$1",[army.id,title.id]);
      await addEvent(client,{confederationId:title.confederation_id,turn:title.current_turn,type:"TITLE_ARMY_ASSIGNED",titleId:title.id,
        actorId:input.actorId,description:`${army.name}, ${title.title_name} kuvveti olarak kaydedildi.`,details:{armyId:army.id}});
      await audit(client,input.guildId,input.actorId,"STEPPE_TITLE_ARMY_ASSIGN","army",army.id,{titleId:title.id,titleName:title.title_name});
      return{armyId:army.id,armyName:army.name,titleId:title.id,titleName:title.title_name,countryId:title.country_id,countryName:title.country_name};
    });
  },

  async openConflict(input:{guildId:string;actorId:string;attackerTitle:string;defenderTitle:string;objectiveSettlement?:string|null;reason:string;gameMaster:boolean}){
    return withTransaction(async(client)=>{
      const attacker=await titleAcrossGuild(client,input.guildId,input.attackerTitle,true);
      const defender=await titleAcrossGuild(client,input.guildId,input.defenderTitle,true);
      if(!attacker||!defender)throw new GameError("Saldıran veya savunan bozkır unvanı bulunamadı.");
      if(attacker.id===defender.id)throw new GameError("Bir unvan kendisine savaş açamaz.");
      if(!input.gameMaster&&attacker.holder_user_id!==input.actorId)throw new GameError("İç savaşı yalnızca saldıran unvanın sahibi veya oyun yöneticisi açabilir.");
      let type:SteppeConflictType;
      if(attacker.tier==="LANDHOLDER"&&defender.tier==="LANDHOLDER"&&attacker.confederation_id===defender.confederation_id)type="LANDHOLDER_FEUD";
      else if(attacker.tier==="KHAN"&&defender.tier==="LANDHOLDER"&&attacker.confederation_id===defender.confederation_id)type="KHAN_SUPPRESSION";
      else if(attacker.tier==="LANDHOLDER"&&defender.tier==="KHAN"&&attacker.confederation_id===defender.confederation_id)type="LANDHOLDER_REVOLT";
      else if(attacker.tier==="KHAN"&&defender.tier==="KHAN"&&attacker.confederation_id!==defender.confederation_id)type="KHAN_WAR";
      else throw new GameError("Bu iki bozkır unvanı arasında desteklenen bir savaş türü yok. Toprak Ağaları yalnız kendi konfederasyonlarında savaşabilir; Hanlar ise başka Hanlarla savaşabilir.");
      if(type==="KHAN_WAR"&&input.objectiveSettlement?.trim())
        throw new GameError("Hanlar arası savaşta ülke sınırı değiştiren yerleşke devri normal savaş sonucu ve yerleşke devir sistemiyle işlenmelidir; iç savaş hedefini boş bırakın.");
      if((await client.query(`SELECT 1 FROM steppe_internal_conflicts WHERE guild_id=$1 AND status='ACTIVE'
        AND ((attacker_title_id=$2 AND defender_title_id=$3) OR (attacker_title_id=$3 AND defender_title_id=$2)) LIMIT 1`,
      [input.guildId,attacker.id,defender.id])).rowCount)
        throw new GameError("Bu iki bozkır unvanı arasında zaten etkin bir savaş ilanı bulunuyor.");
      let objective:null|{id:string;name:string}=null;
      if(input.objectiveSettlement?.trim()){
        objective=(await client.query<{id:string;name:string}>(`
          SELECT settlement.id,settlement.name FROM steppe_title_holdings holding
          JOIN settlements settlement ON settlement.id=holding.settlement_id
          WHERE holding.title_id=$1 AND (settlement.id::text=$2 OR lower(settlement.name)=lower($2))`,
        [defender.id,input.objectiveSettlement.trim()])).rows[0]??null;
        if(!objective)throw new GameError("Savaş hedefi savunan unvana ait bir yerleşke olmalıdır.");
      }
      const conflict=(await client.query<{id:string}>(`
        INSERT INTO steppe_internal_conflicts(guild_id,attacker_title_id,defender_title_id,conflict_type,objective_settlement_id,reason,opened_turn,opened_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[input.guildId,attacker.id,defender.id,type,objective?.id??null,input.reason.trim(),attacker.current_turn,input.actorId])).rows[0]!;
      const description=`${attacker.title_name}, ${defender.title_name} unvanına karşı ${STEPPE_CONFLICT_LABELS[type]} başlattı.`;
      for(const confederationId of new Set([attacker.confederation_id,defender.confederation_id]))await addEvent(client,{confederationId,turn:attacker.current_turn,
        type:"INTERNAL_CONFLICT_OPENED",titleId:attacker.id,actorId:input.actorId,description,
        details:{conflictId:conflict.id,type,defenderTitleId:defender.id,objectiveSettlementId:objective?.id??null}});
      await audit(client,input.guildId,input.actorId,"STEPPE_INTERNAL_CONFLICT_OPEN","steppe_internal_conflict",conflict.id,input);
      return{id:conflict.id,type,label:STEPPE_CONFLICT_LABELS[type],attackerTitleName:attacker.title_name,defenderTitleName:defender.title_name,
        objectiveSettlementName:objective?.name??null,reason:input.reason.trim()};
    });
  },

  async resolveConflict(input:{guildId:string;actorId:string;conflictId:string;winnerTitle:string;reason:string}){
    return withTransaction(async(client)=>{
      const conflict=(await client.query<{
        id:string;attacker_title_id:string;defender_title_id:string;conflict_type:SteppeConflictType;objective_settlement_id:string|null;opened_turn:number;battle_id:string|null;
      }>(`SELECT id,attacker_title_id,defender_title_id,conflict_type,objective_settlement_id,opened_turn,battle_id
          FROM steppe_internal_conflicts WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' FOR UPDATE`,[input.conflictId,input.guildId])).rows[0];
      if(!conflict)throw new GameError("Etkin bozkır iç savaşı bulunamadı.");
      const winner=await titleAcrossGuild(client,input.guildId,input.winnerTitle,true);if(!winner||![conflict.attacker_title_id,conflict.defender_title_id].includes(winner.id))
        throw new GameError("Kazanan, iç savaşın iki tarafından biri olmalıdır.");
      const loserId=winner.id===conflict.attacker_title_id?conflict.defender_title_id:conflict.attacker_title_id;
      const loser=await titleAcrossGuild(client,input.guildId,loserId,true);if(!loser)throw new GameError("Kaybeden bozkır unvanı artık bulunamıyor.");
      if(conflict.battle_id){
        const battle=(await client.query<{status:string;winner_title_id:string|null}>(`
          SELECT battle.status,winner_side.steppe_title_id AS winner_title_id FROM battles battle
          LEFT JOIN battle_sides winner_side ON winner_side.battle_id=battle.id AND winner_side.side_key=battle.winner_side
          WHERE battle.id=$1`,[conflict.battle_id])).rows[0];
        if(!battle||battle.status!=="FINISHED")throw new GameError("Bağlı savaş dosyası henüz sonuçlanmadı.");
        if(battle.winner_title_id&&battle.winner_title_id!==winner.id)throw new GameError("Seçilen kazanan, bağlı savaş dosyasının kazanan tarafıyla uyuşmuyor.");
      }
      const turn=Number((await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[input.guildId])).rows[0]?.current_turn??conflict.opened_turn);
      if(conflict.conflict_type!=="KHAN_WAR"&&winner.id===conflict.attacker_title_id&&conflict.objective_settlement_id){
        await client.query(`UPDATE steppe_title_holdings SET title_id=$2,assigned_turn=$3,assigned_by=$4 WHERE settlement_id=$1`,
          [conflict.objective_settlement_id,winner.id,turn,input.actorId]);
      }
      await client.query(`UPDATE steppe_internal_conflicts SET status='RESOLVED',winner_title_id=$2,resolution_reason=$3,
        resolved_turn=$4,resolved_by=$5,updated_at=NOW() WHERE id=$1`,[conflict.id,winner.id,input.reason.trim(),turn,input.actorId]);
      await audit(client,input.guildId,input.actorId,"STEPPE_INTERNAL_CONFLICT_RESOLVE","steppe_internal_conflict",conflict.id,
        {winnerTitleId:winner.id,loserTitleId:loser.id,reason:input.reason});
      return{id:conflict.id,winnerTitleName:winner.title_name,turn};
    });
  }
};
