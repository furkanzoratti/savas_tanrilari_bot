import {randomInt} from "node:crypto";
import {pool,withTransaction,type DbClient} from "../db/pool.js";
import {
  BIRTH_ATTEMPT_COOLDOWN_TURNS,MATERNAL_ILLNESS_COOLDOWN_TURNS,
  MINIMUM_MARRIAGE_AGE,
  birthAgeModifier,birthAttemptSucceeded,birthComplication,dynastyDeathFailureMaximum,dynastyDeathSaveFailed,dynastyMemberCanBeBirthParent,
  dynastyMemberCanMarry,newbornGender,orderedDynastyCoupleIds,type DynastyGender,type DynastyHealth,type DynastyMemberStatus
} from "../domain/dynasty.js";
import {GameError} from "./game-service.js";

export interface DynastyMemberView{
  id:string;name:string;gender:DynastyGender;age:number|null;title:string;relation:string;
  status:DynastyMemberStatus;health:DynastyHealth;sick_until_turn:number|null;
  is_monarch:boolean;is_heir:boolean;succession_rank:number|null;
  birth_dynasty_id:string|null;birth_dynasty_name:string|null;birth_country_name:string|null;
  spouse_id:string|null;spouse_name:string|null;spouse_title:string|null;spouse_age:number|null;spouse_country_name:string|null;
  spouse_dynasty_name:string|null;spouse_birth_dynasty_name:string|null;spouse_birth_country_name:string|null;
  spouse_status:DynastyMemberStatus|null;
  mother_id:string|null;mother_name:string|null;
  father_id:string|null;father_name:string|null;born_turn:number|null;died_turn:number|null;death_reason:string|null;
}

export interface DynastyView{
  id:string;guild_id:string;country_id:string;country_name:string;name:string;
  current_turn:number;last_birth_attempt_turn:number|null;published_channel_id:string|null;published_message_id:string|null;
  members:DynastyMemberView[];
  events:Array<{id:string;game_turn:number;event_type:string;member_id:string|null;details:Record<string,unknown>;created_at:Date|string}>;
  birth_attempts:Array<{first_member_id:string;second_member_id:string;last_attempt_turn:number}>;
}

export interface DynastyTurnEvent{
  dynastyId:string;countryName:string;text:string;
}

export interface DynastyTurnResult{
  processed:number;events:DynastyTurnEvent[];deathChecks:number;failures:string[];
}

export interface DynastyDeathLogBatch{
  dynastyId:string;countryName:string;gameTurn:number;entries:string[];publishAttempts:number;
}

export interface DynastyDeathLogStatus{
  channelId:string|null;pendingBatches:number;pendingEntries:number;
}

export type DynastyMarriageStatus="PENDING"|"ACCEPTED"|"REJECTED"|"CANCELLED";
export interface DynastyMarriageProposalView{
  id:string;guild_id:string;proposer_country_id:string;target_country_id:string;
  proposer_member_id:string;target_member_id:string;status:DynastyMarriageStatus;
  created_turn:number;resolved_turn:number|null;created_by:string;resolved_by:string|null;
  created_at:Date|string;resolved_at:Date|string|null;
  public_channel_id:string|null;public_message_id:string|null;
  proposer_country_name:string;target_country_name:string;
  proposer_member_name:string;target_member_name:string;
}

type DynastyMarriageMember=DynastyMemberView&{
  dynasty_id:string;guild_id:string;country_id:string;country_name:string;dynasty_name:string;
};

async function activeCountry(client:DbClient,guildId:string,countryId:string):Promise<{id:string;name:string}>{
  const country=(await client.query<{id:string;name:string}>(
    "SELECT id,name FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' FOR UPDATE",
    [countryId,guildId]
  )).rows[0];
  if(!country)throw new GameError("Etkin devlet bulunamadı.");
  return country;
}

async function currentTurn(client:DbClient,guildId:string):Promise<number>{
  const row=(await client.query<{current_turn:number}>(
    "SELECT current_turn FROM guilds WHERE discord_id=$1",[guildId]
  )).rows[0];
  if(!row)throw new GameError("Sunucu oyun kaydı bulunamadı.");
  return Number(row.current_turn);
}

async function dynastyForCountry(client:DbClient,guildId:string,countryId:string,lock=false):Promise<{id:string;name:string;country_name:string;last_birth_attempt_turn:number|null}>{
  const row=(await client.query<{id:string;name:string;country_name:string;last_birth_attempt_turn:number|null}>(
    `SELECT dynasty.id,dynasty.name,country.name AS country_name,dynasty.last_birth_attempt_turn
       FROM dynasties dynasty JOIN countries country ON country.id=dynasty.country_id
      WHERE dynasty.country_id=$1 AND dynasty.guild_id=$2${lock?" FOR UPDATE OF dynasty":""}`,
    [countryId,guildId]
  )).rows[0];
  if(!row)throw new GameError("Bu devlet için henüz hanedan oluşturulmadı.");
  return row;
}

async function memberForDynasty(client:DbClient,dynastyId:string,memberId:string,lock=false):Promise<DynastyMemberView>{
  const row=(await client.query<DynastyMemberView>(
    `SELECT member.*,spouse.name AS spouse_name,spouse.title AS spouse_title,spouse.age AS spouse_age,
            spouse_country.name AS spouse_country_name,spouse_dynasty.name AS spouse_dynasty_name,
            birth_dynasty.name AS birth_dynasty_name,birth_country.name AS birth_country_name,
            spouse_birth_dynasty.name AS spouse_birth_dynasty_name,
            spouse_birth_country.name AS spouse_birth_country_name,
            spouse.status AS spouse_status,mother.name AS mother_name,father.name AS father_name
       FROM dynasty_members member
       LEFT JOIN dynasty_members spouse ON spouse.id=member.spouse_id
       LEFT JOIN dynasties spouse_dynasty ON spouse_dynasty.id=spouse.dynasty_id
       LEFT JOIN countries spouse_country ON spouse_country.id=spouse_dynasty.country_id
       LEFT JOIN dynasties birth_dynasty ON birth_dynasty.id=COALESCE(member.birth_dynasty_id,member.dynasty_id)
       LEFT JOIN countries birth_country ON birth_country.id=birth_dynasty.country_id
       LEFT JOIN dynasties spouse_birth_dynasty ON spouse_birth_dynasty.id=COALESCE(spouse.birth_dynasty_id,spouse.dynasty_id)
       LEFT JOIN countries spouse_birth_country ON spouse_birth_country.id=spouse_birth_dynasty.country_id
       LEFT JOIN dynasty_members mother ON mother.id=member.mother_id
       LEFT JOIN dynasty_members father ON father.id=member.father_id
      WHERE member.id=$1 AND member.dynasty_id=$2${lock?" FOR UPDATE OF member":""}`,
    [memberId,dynastyId]
  )).rows[0];
  if(!row)throw new GameError("Hanedan üyesi bulunamadı.");
  return row;
}

async function memberAcrossGuild(client:DbClient,guildId:string,memberId:string,lock=false):Promise<DynastyMarriageMember>{
  const row=(await client.query<DynastyMarriageMember>(
    `SELECT member.*,spouse.name AS spouse_name,spouse.title AS spouse_title,spouse.age AS spouse_age,
            spouse_country.name AS spouse_country_name,spouse_dynasty.name AS spouse_dynasty_name,
            birth_dynasty.name AS birth_dynasty_name,birth_country.name AS birth_country_name,
            spouse_birth_dynasty.name AS spouse_birth_dynasty_name,
            spouse_birth_country.name AS spouse_birth_country_name,
            spouse.status AS spouse_status,mother.name AS mother_name,father.name AS father_name,
            dynasty.id AS dynasty_id,dynasty.guild_id,dynasty.country_id,dynasty.name AS dynasty_name,
            country.name AS country_name
       FROM dynasty_members member
       JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
       JOIN countries country ON country.id=dynasty.country_id
       LEFT JOIN dynasty_members spouse ON spouse.id=member.spouse_id
       LEFT JOIN dynasties spouse_dynasty ON spouse_dynasty.id=spouse.dynasty_id
       LEFT JOIN countries spouse_country ON spouse_country.id=spouse_dynasty.country_id
       LEFT JOIN dynasties birth_dynasty ON birth_dynasty.id=COALESCE(member.birth_dynasty_id,member.dynasty_id)
       LEFT JOIN countries birth_country ON birth_country.id=birth_dynasty.country_id
       LEFT JOIN dynasties spouse_birth_dynasty ON spouse_birth_dynasty.id=COALESCE(spouse.birth_dynasty_id,spouse.dynasty_id)
       LEFT JOIN countries spouse_birth_country ON spouse_birth_country.id=spouse_birth_dynasty.country_id
       LEFT JOIN dynasty_members mother ON mother.id=member.mother_id
       LEFT JOIN dynasty_members father ON father.id=member.father_id
      WHERE member.id=$1 AND dynasty.guild_id=$2${lock?" FOR UPDATE OF member":""}`,
    [memberId,guildId]
  )).rows[0];
  if(!row)throw new GameError("Hanedan üyesi bulunamadı.");
  return row;
}

function requireMarriageEligibility(member:DynastyMemberView,label:string):void{
  if(member.status!=="ALIVE")throw new GameError(label+" hayatta değil.");
  if(member.age===null)throw new GameError(label+" için yaş bilgisi girilmeden evlilik yapılamaz.");
  if(member.age<MINIMUM_MARRIAGE_AGE)throw new GameError(label+" henüz "+MINIMUM_MARRIAGE_AGE+" yaşını doldurmadı.");
  if(member.spouse_id)throw new GameError(label+" zaten evli.");
  if(!dynastyMemberCanMarry(member.age,member.status,member.spouse_id))throw new GameError(label+" evlilik koşullarını karşılamıyor.");
}

async function lockMarriageMembers(client:DbClient,memberIds:string[]):Promise<void>{
  for(const id of [...new Set(memberIds)].sort())
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["dynasty-marriage-member:"+id]);
}

async function loadMarriageProposal(client:DbClient,guildId:string,proposalId:string,lock=false):Promise<DynastyMarriageProposalView>{
  const row=(await client.query<DynastyMarriageProposalView>(
    `SELECT proposal.*,proposer_country.name AS proposer_country_name,target_country.name AS target_country_name,
            proposer_member.name AS proposer_member_name,target_member.name AS target_member_name
       FROM dynasty_marriage_proposals proposal
       JOIN countries proposer_country ON proposer_country.id=proposal.proposer_country_id
       JOIN countries target_country ON target_country.id=proposal.target_country_id
       JOIN dynasty_members proposer_member ON proposer_member.id=proposal.proposer_member_id
       JOIN dynasty_members target_member ON target_member.id=proposal.target_member_id
      WHERE proposal.id=$1 AND proposal.guild_id=$2${lock?" FOR UPDATE OF proposal":""}`,
    [proposalId,guildId]
  )).rows[0];
  if(!row)throw new GameError("Evlilik teklifi bulunamadı.");
  return row;
}

async function establishMarriage(
  client:DbClient,left:DynastyMarriageMember,right:DynastyMarriageMember,turn:number,actorId:string,source:string
):Promise<void>{
  if(left.id===right.id)throw new GameError("Bir hanedan üyesi kendisiyle evlendirilemez.");
  requireMarriageEligibility(left,left.name);
  requireMarriageEligibility(right,right.name);
  const crossDynasty=left.dynasty_id!==right.dynasty_id;
  const woman=left.gender==="FEMALE"&&right.gender==="MALE"?left:right.gender==="FEMALE"&&left.gender==="MALE"?right:null;
  const husband=woman?.id===left.id?right:woman?.id===right.id?left:null;
  if(crossDynasty&&woman?.is_monarch)
    throw new GameError("Hükümdar olan kadın başka bir hanedana gelin gidemez. Önce hükümdarlık kaydını değiştirin.");
  await client.query("UPDATE dynasty_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2",[right.id,left.id]);
  await client.query("UPDATE dynasty_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2",[left.id,right.id]);
  const details={
    memberName:left.name,spouseName:right.name,memberCountry:left.country_name,spouseCountry:right.country_name,
    actorId,source,crossDynasty,womanJoinedHusbandsDynasty:Boolean(crossDynasty&&woman&&husband)
  };
  await addEvent(client,left.dynasty_id,turn,"MARRIAGE",left.id,details);
  if(right.dynasty_id!==left.dynasty_id)await addEvent(client,right.dynasty_id,turn,"MARRIAGE",right.id,{
    memberName:right.name,spouseName:left.name,memberCountry:right.country_name,spouseCountry:left.country_name,
    actorId,source,crossDynasty:true
  });
  if(crossDynasty&&woman&&husband){
    const sourceDynastyId=woman.dynasty_id;
    await client.query(
      `UPDATE dynasty_members
          SET birth_dynasty_id=COALESCE(birth_dynasty_id,dynasty_id),dynasty_id=$1,
              is_heir=FALSE,succession_rank=NULL,relation='Evlilik yoluyla hanedana katıldı',updated_at=NOW()
        WHERE id=$2`,
      [husband.dynasty_id,woman.id]
    );
    if(woman.is_heir){
      const successionEvents:string[]=[];
      await reconcileSuccession(client,sourceDynastyId,turn,woman.country_name,successionEvents);
    }
  }
  await client.query(
    `UPDATE dynasty_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
      WHERE status='PENDING' AND (proposer_member_id=ANY($3::uuid[]) OR target_member_id=ANY($3::uuid[]))`,
    [turn,actorId,[left.id,right.id]]
  );
}

async function addEvent(
  client:DbClient,dynastyId:string,turn:number,eventType:string,memberId:string|null,details:Record<string,unknown>
):Promise<void>{
  await client.query(
    "INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,member_id,details) VALUES($1,$2,$3,$4,$5::jsonb)",
    [dynastyId,turn,eventType,memberId,JSON.stringify(details)]
  );
}

async function reconcileSuccession(
  client:DbClient,dynastyId:string,turn:number,countryName:string,eventTexts:string[]
):Promise<void>{
  let monarch=(await client.query<{id:string;name:string;gender:DynastyGender}>(
    `SELECT id,name,gender FROM dynasty_members
      WHERE dynasty_id=$1 AND status='ALIVE' AND is_monarch=TRUE LIMIT 1 FOR UPDATE`,[dynastyId]
  )).rows[0];
  if(!monarch){
    const successor=(await client.query<{id:string;name:string;gender:DynastyGender}>(
      `SELECT id,name,gender FROM dynasty_members
        WHERE dynasty_id=$1 AND status='ALIVE' AND (is_heir=TRUE OR succession_rank IS NOT NULL)
        ORDER BY CASE WHEN gender='MALE' THEN 0 ELSE 1 END,
                 is_heir DESC,succession_rank NULLS LAST,age DESC,created_at LIMIT 1 FOR UPDATE`,[dynastyId]
    )).rows[0];
    if(!successor){
      await addEvent(client,dynastyId,turn,"SUCCESSION_CRISIS",null,{countryName,reason:"Yaşayan hanedan üyesi bulunmuyor"});
      eventTexts.push("⚠️ **"+countryName+"** devletinde yaşayan hanedan üyesi kalmadı; veraset krizi başladı.");
      return;
    }
    await client.query("UPDATE dynasty_members SET is_monarch=FALSE,is_heir=FALSE WHERE dynasty_id=$1",[dynastyId]);
    await client.query(
      "UPDATE dynasty_members SET is_monarch=TRUE,title=$1,relation='Hükümdar',updated_at=NOW() WHERE id=$2",
      [successor.gender==="MALE"?"Kral":"Kraliçe",successor.id]
    );
    monarch=successor;
    await addEvent(client,dynastyId,turn,"SUCCESSION",successor.id,{countryName,name:successor.name});
    eventTexts.push("👑 **"+countryName+"** tahtına **"+successor.name+"** geçti.");
    const spouse=(await client.query<{id:string;gender:DynastyGender}>(
      "SELECT id,gender FROM dynasty_members WHERE spouse_id=$1 AND status='ALIVE' LIMIT 1",[successor.id]
    )).rows[0];
    if(spouse)await client.query(
      "UPDATE dynasty_members SET title=$1,relation='Hükümdarın eşi',updated_at=NOW() WHERE id=$2 AND is_monarch=FALSE",
      [spouse.gender==="FEMALE"?"Kraliçe":"Kral Eşi",spouse.id]
    );
  }
  await client.query("UPDATE dynasty_members SET is_heir=FALSE WHERE dynasty_id=$1 AND id=$2",[dynastyId,monarch.id]);
  const existingHeir=(await client.query<{id:string}>(
    "SELECT id FROM dynasty_members WHERE dynasty_id=$1 AND status='ALIVE' AND is_heir=TRUE AND id<>$2 LIMIT 1",
    [dynastyId,monarch.id]
  )).rows[0];
  const next=(await client.query<{id:string;name:string}>(
    `SELECT id,name FROM dynasty_members
      WHERE dynasty_id=$1 AND status='ALIVE' AND id<>$2 AND (is_heir=TRUE OR succession_rank IS NOT NULL)
      ORDER BY CASE WHEN gender='MALE' THEN 0 ELSE 1 END,
               is_heir DESC,succession_rank NULLS LAST,age DESC,created_at LIMIT 1 FOR UPDATE`,
    [dynastyId,monarch.id]
  )).rows[0];
  if(next){
    await client.query("UPDATE dynasty_members SET is_heir=(id=$2),updated_at=NOW() WHERE dynasty_id=$1 AND status='ALIVE'",[dynastyId,next.id]);
    if(existingHeir?.id!==next.id){
      await addEvent(client,dynastyId,turn,"HEIR_DESIGNATED",next.id,{name:next.name,automatic:true,malePreference:true});
      eventTexts.push("📜 **"+next.name+"**, **"+countryName+"** tahtının yeni varisi oldu.");
    }
  }else{
    await client.query("UPDATE dynasty_members SET is_heir=FALSE,updated_at=NOW() WHERE dynasty_id=$1",[dynastyId]);
    await addEvent(client,dynastyId,turn,"SUCCESSION_CRISIS",monarch.id,{countryName,reason:"Uygun varis bulunmuyor"});
    eventTexts.push("⚠️ **"+countryName+"** devletinde uygun taht varisi bulunmuyor.");
  }
}

async function killMember(
  client:DbClient,dynastyId:string,member:DynastyMemberView,turn:number,reason:string,countryName:string,eventTexts:string[]
):Promise<void>{
  if(member.status!=="ALIVE")return;
  await client.query(
    `UPDATE dynasty_members SET status='DEAD',health='HEALTHY',sick_until_turn=NULL,
            is_monarch=FALSE,is_heir=FALSE,died_turn=$1,death_reason=$2,updated_at=NOW()
      WHERE id=$3`,[turn,reason,member.id]
  );
  await client.query(
    `UPDATE dynasty_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by='system:death',resolved_at=NOW()
      WHERE status='PENDING' AND (proposer_member_id=$2 OR target_member_id=$2)`,[turn,member.id]
  );
  if(member.spouse_id)await client.query(
    `UPDATE dynasty_members SET relation='Önceki hükümdarın eşi',
       title=CASE WHEN gender='FEMALE' THEN 'Dul Kraliçe' ELSE 'Dul Kral Eşi' END,updated_at=NOW()
      WHERE id=$1 AND status='ALIVE' AND is_monarch=FALSE AND $2=TRUE`,[member.spouse_id,member.is_monarch]
  );
  await addEvent(client,dynastyId,turn,"DEATH",member.id,{name:member.name,age:member.age,reason,wasMonarch:member.is_monarch,wasHeir:member.is_heir});
  const ageText=member.age===null?"yaşı bilinmiyorken":member.age+" yaşında";
  eventTexts.push("⚰️ **"+countryName+"** • **"+member.name+"**, "+ageText+" hayatını kaybetti. Sebep: **"+reason+"**.");
  if(member.is_monarch||member.is_heir)await reconcileSuccession(client,dynastyId,turn,countryName,eventTexts);
}

async function loadViewByClause(column:"country_id"|"id",value:string):Promise<DynastyView|null>{
  const dynasty=(await pool.query<Omit<DynastyView,"members"|"events">>(
    `SELECT dynasty.id,dynasty.guild_id,dynasty.country_id,country.name AS country_name,dynasty.name,
            guild.current_turn,dynasty.last_birth_attempt_turn,dynasty.published_channel_id,dynasty.published_message_id
       FROM dynasties dynasty JOIN countries country ON country.id=dynasty.country_id
       JOIN guilds guild ON guild.discord_id=dynasty.guild_id
      WHERE dynasty.${column}=$1`,[value]
  )).rows[0];
  if(!dynasty)return null;
  const members=(await pool.query<DynastyMemberView>(
    `SELECT member.*,spouse.name AS spouse_name,spouse.title AS spouse_title,spouse.age AS spouse_age,
            spouse_country.name AS spouse_country_name,spouse_dynasty.name AS spouse_dynasty_name,
            birth_dynasty.name AS birth_dynasty_name,birth_country.name AS birth_country_name,
            spouse_birth_dynasty.name AS spouse_birth_dynasty_name,
            spouse_birth_country.name AS spouse_birth_country_name,
            spouse.status AS spouse_status,mother.name AS mother_name,father.name AS father_name
       FROM dynasty_members member
       LEFT JOIN dynasty_members spouse ON spouse.id=member.spouse_id
       LEFT JOIN dynasties spouse_dynasty ON spouse_dynasty.id=spouse.dynasty_id
       LEFT JOIN countries spouse_country ON spouse_country.id=spouse_dynasty.country_id
       LEFT JOIN dynasties birth_dynasty ON birth_dynasty.id=COALESCE(member.birth_dynasty_id,member.dynasty_id)
       LEFT JOIN countries birth_country ON birth_country.id=birth_dynasty.country_id
       LEFT JOIN dynasties spouse_birth_dynasty ON spouse_birth_dynasty.id=COALESCE(spouse.birth_dynasty_id,spouse.dynasty_id)
       LEFT JOIN countries spouse_birth_country ON spouse_birth_country.id=spouse_birth_dynasty.country_id
       LEFT JOIN dynasty_members mother ON mother.id=member.mother_id
       LEFT JOIN dynasty_members father ON father.id=member.father_id
      WHERE member.dynasty_id=$1
      ORDER BY CASE WHEN member.status='ALIVE' THEN 0 ELSE 1 END,member.is_monarch DESC,member.is_heir DESC,
               member.succession_rank NULLS LAST,member.age DESC,member.created_at`,[dynasty.id]
  )).rows;
  const events=(await pool.query<DynastyView["events"][number]>(
    `SELECT id,game_turn,event_type,member_id,details,created_at FROM dynasty_events
      WHERE dynasty_id=$1 AND event_type<>'DEATH_SAVE_PASSED'
      ORDER BY game_turn DESC,created_at DESC LIMIT 50`,[dynasty.id]
  )).rows;
  const birthAttempts=(await pool.query<DynastyView["birth_attempts"][number]>(
    `SELECT first_member_id,second_member_id,last_attempt_turn
       FROM dynasty_couple_birth_attempts WHERE dynasty_id=$1
      ORDER BY last_attempt_turn DESC,first_member_id,second_member_id`,[dynasty.id]
  )).rows;
  return{...dynasty,members,events,birth_attempts:birthAttempts};
}

export const dynastyService={
  viewByCountry(countryId:string){return loadViewByClause("country_id",countryId);},
  viewById(dynastyId:string){return loadViewByClause("id",dynastyId);},

  async create(input:{guildId:string;countryId:string;actorId:string;name:string}):Promise<string>{
    return withTransaction(async(client)=>{
      const country=await activeCountry(client,input.guildId,input.countryId);
      const name=input.name.trim().replace(/\s+/g," ");
      if(name.length<2||name.length>80)throw new GameError("Hanedan adı 2-80 karakter arasında olmalıdır.");
      const duplicate=await client.query("SELECT 1 FROM dynasties WHERE country_id=$1",[country.id]);
      if(duplicate.rowCount)throw new GameError("Bu devletin hanedan kaydı zaten oluşturulmuş.");
      const created=(await client.query<{id:string}>(
        "INSERT INTO dynasties(guild_id,country_id,name,created_by) VALUES($1,$2,$3,$4) RETURNING id",
        [input.guildId,country.id,name,input.actorId]
      )).rows[0]!;
      const turn=await currentTurn(client,input.guildId);
      await addEvent(client,created.id,turn,"DYNASTY_CREATED",null,{countryName:country.name,name});
      return created.id;
    });
  },

  async addMember(input:{
    guildId:string;countryId:string;actorId:string;name:string;gender:DynastyGender;age:number;
    title:string;relation:string;isMonarch:boolean;isHeir:boolean;successionRank?:number|null;
    spouseId?:string|null;motherId?:string|null;fatherId?:string|null;
  }):Promise<string>{
    return withTransaction(async(client)=>{
      await activeCountry(client,input.guildId,input.countryId);
      const dynasty=await dynastyForCountry(client,input.guildId,input.countryId,true);
      const turn=await currentTurn(client,input.guildId);
      const name=input.name.trim().replace(/\s+/g," ");
      const title=input.title.trim().replace(/\s+/g," ");
      const relation=input.relation.trim().replace(/\s+/g," ");
      if(name.length<2||name.length>80||title.length<2||title.length>80||relation.length<2||relation.length>120)
        throw new GameError("Ad, unvan veya akrabalık açıklaması geçersiz uzunlukta.");
      if(!Number.isInteger(input.age)||input.age<0||input.age>120)throw new GameError("Yaş 0-120 arasında olmalıdır.");
      if(input.isMonarch&&input.isHeir)throw new GameError("Aynı üye hem hükümdar hem de taht varisi olarak eklenemez.");
      if(input.isMonarch&&input.gender==="FEMALE"){
        const eligibleMale=await client.query(
          `SELECT 1 FROM dynasty_members
            WHERE dynasty_id=$1 AND status='ALIVE' AND gender='MALE' AND is_monarch=FALSE
              AND (is_heir=TRUE OR succession_rank IS NOT NULL) LIMIT 1`,[dynasty.id]
        );
        if(eligibleMale.rowCount)throw new GameError("Yaşayan ve verasete uygun erkek varken kadın üye hükümdar yapılamaz.");
      }
      if(input.isHeir&&input.gender==="FEMALE"){
        const eligibleMale=await client.query(
          `SELECT 1 FROM dynasty_members
            WHERE dynasty_id=$1 AND status='ALIVE' AND gender='MALE' AND is_monarch=FALSE
              AND (is_heir=TRUE OR succession_rank IS NOT NULL) LIMIT 1`,[dynasty.id]
        );
        if(eligibleMale.rowCount)throw new GameError("Yaşayan ve verasete uygun erkek varken kadın üye taht varisi yapılamaz.");
      }
      if(input.isMonarch)await client.query("UPDATE dynasty_members SET is_monarch=FALSE WHERE dynasty_id=$1",[dynasty.id]);
      if(input.isHeir)await client.query("UPDATE dynasty_members SET is_heir=FALSE WHERE dynasty_id=$1",[dynasty.id]);
      for(const id of [input.spouseId,input.motherId,input.fatherId].filter((item):item is string=>Boolean(item)))
        await memberForDynasty(client,dynasty.id,id);
      const created=(await client.query<{id:string}>(
        `INSERT INTO dynasty_members(
           dynasty_id,name,gender,age,title,relation,is_monarch,is_heir,succession_rank,
           spouse_id,mother_id,father_id,born_turn
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [dynasty.id,name,input.gender,input.age,title,relation,input.isMonarch,input.isHeir,
          input.successionRank??null,input.spouseId??null,input.motherId??null,input.fatherId??null,turn-input.age]
      )).rows[0]!;
      if(input.spouseId)await client.query("UPDATE dynasty_members SET spouse_id=$1 WHERE id=$2",[created.id,input.spouseId]);
      await addEvent(client,dynasty.id,turn,"MEMBER_ADDED",created.id,{name,title,relation,age:input.age,actorId:input.actorId});
      if(input.isMonarch||input.isHeir||input.successionRank!==null&&input.successionRank!==undefined){
        const texts:string[]=[];
        await reconcileSuccession(client,dynasty.id,turn,dynasty.country_name,texts);
      }
      return created.id;
    });
  },

  async editMember(input:{
    guildId:string;countryId:string;actorId:string;memberId:string;name?:string|null;age?:number|null;
    title?:string|null;relation?:string|null;successionRank?:number|null;health?:DynastyHealth|null;
  }):Promise<void>{
    await withTransaction(async(client)=>{
      await activeCountry(client,input.guildId,input.countryId);
      const dynasty=await dynastyForCountry(client,input.guildId,input.countryId,true);
      const member=await memberForDynasty(client,dynasty.id,input.memberId,true);
      if(member.status!=="ALIVE")throw new GameError("Ölü hanedan üyeleri düzenlenemez.");
      const name=input.name?.trim().replace(/\s+/g," ")||member.name;
      const title=input.title?.trim().replace(/\s+/g," ")||member.title;
      const relation=input.relation?.trim().replace(/\s+/g," ")||member.relation;
      const age=input.age??member.age;
      if(name.length<2||name.length>80||title.length<2||title.length>80||relation.length<2||relation.length>120)
        throw new GameError("Ad, unvan veya akrabalık açıklaması geçersiz uzunlukta.");
      if(age===null||!Number.isInteger(age)||age<0||age>120)throw new GameError("Yaş 0-120 arasında olmalıdır.");
      await client.query(
        `UPDATE dynasty_members SET name=$1,age=$2,title=$3,relation=$4,succession_rank=$5,
                health=$6,sick_until_turn=CASE WHEN $6='HEALTHY' THEN NULL ELSE sick_until_turn END,updated_at=NOW()
          WHERE id=$7`,
        [name,age,title,relation,input.successionRank===undefined?member.succession_rank:input.successionRank,
          input.health??member.health,member.id]
      );
      await addEvent(client,dynasty.id,await currentTurn(client,input.guildId),"MEMBER_UPDATED",member.id,{name,age,title,relation,actorId:input.actorId});
    });
  },

  async linkSpouses(input:{guildId:string;countryId:string;actorId:string;memberId:string;spouseId:string}):Promise<void>{
    await withTransaction(async(client)=>{
      await activeCountry(client,input.guildId,input.countryId);
      const dynasty=await dynastyForCountry(client,input.guildId,input.countryId,true);
      await lockMarriageMembers(client,[input.memberId,input.spouseId]);
      const member=await memberForDynasty(client,dynasty.id,input.memberId,true);
      const spouse=await memberForDynasty(client,dynasty.id,input.spouseId,true);
      if(member.id===spouse.id)throw new GameError("Bir hanedan üyesi kendisiyle evlendirilemez.");
      requireMarriageEligibility(member,member.name);
      requireMarriageEligibility(spouse,spouse.name);
      await client.query("UPDATE dynasty_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2",[spouse.id,member.id]);
      await client.query("UPDATE dynasty_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2",[member.id,spouse.id]);
      const turn=await currentTurn(client,input.guildId);
      await client.query(
        `UPDATE dynasty_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
          WHERE status='PENDING' AND (proposer_member_id=ANY($3::uuid[]) OR target_member_id=ANY($3::uuid[]))`,
        [turn,input.actorId,[member.id,spouse.id]]
      );
      await addEvent(client,dynasty.id,turn,"MARRIAGE",member.id,{memberName:member.name,spouseName:spouse.name,actorId:input.actorId,source:"GM_SAME_DYNASTY"});
    });
  },

  async listMarriageProposals(guildId:string,countryId:string,status:DynastyMarriageStatus="PENDING"):Promise<DynastyMarriageProposalView[]>{
    return (await pool.query<DynastyMarriageProposalView>(
      `SELECT proposal.*,proposer_country.name AS proposer_country_name,target_country.name AS target_country_name,
              proposer_member.name AS proposer_member_name,target_member.name AS target_member_name
         FROM dynasty_marriage_proposals proposal
         JOIN countries proposer_country ON proposer_country.id=proposal.proposer_country_id
         JOIN countries target_country ON target_country.id=proposal.target_country_id
         JOIN dynasty_members proposer_member ON proposer_member.id=proposal.proposer_member_id
         JOIN dynasty_members target_member ON target_member.id=proposal.target_member_id
        WHERE proposal.guild_id=$1 AND proposal.status=$2
          AND (proposal.proposer_country_id=$3 OR proposal.target_country_id=$3)
        ORDER BY proposal.created_at DESC LIMIT 25`,[guildId,status,countryId]
    )).rows;
  },

  async marriageProposalById(guildId:string,proposalId:string):Promise<DynastyMarriageProposalView>{
    return withTransaction((client)=>loadMarriageProposal(client,guildId,proposalId));
  },

  async setMarriageProposalMessage(input:{guildId:string;proposalId:string;channelId:string;messageId:string}):Promise<void>{
    const result=await pool.query(
      `UPDATE dynasty_marriage_proposals
          SET public_channel_id=$1,public_message_id=$2
        WHERE id=$3 AND guild_id=$4`,
      [input.channelId,input.messageId,input.proposalId,input.guildId]
    );
    if(!result.rowCount)throw new GameError("Evlilik teklifi bulunamadı.");
  },

  async proposeMarriage(input:{
    guildId:string;proposerCountryId:string;targetCountryId:string;proposerMemberId:string;targetMemberId:string;actorId:string;
  }):Promise<DynastyMarriageProposalView>{
    return withTransaction(async(client)=>{
      if(input.proposerCountryId===input.targetCountryId)throw new GameError("Ülkeler arası teklif için iki farklı devlet seçilmelidir.");
      await activeCountry(client,input.guildId,input.proposerCountryId);
      await activeCountry(client,input.guildId,input.targetCountryId);
      await lockMarriageMembers(client,[input.proposerMemberId,input.targetMemberId]);
      const proposer=await memberAcrossGuild(client,input.guildId,input.proposerMemberId,true);
      const target=await memberAcrossGuild(client,input.guildId,input.targetMemberId,true);
      if(proposer.country_id!==input.proposerCountryId)throw new GameError("Teklifi yapan üye seçilen devlete ait değil.");
      if(target.country_id!==input.targetCountryId)throw new GameError("Hedef üye seçilen devlete ait değil.");
      requireMarriageEligibility(proposer,proposer.name);
      requireMarriageEligibility(target,target.name);
      const pending=await client.query(
        `SELECT 1 FROM dynasty_marriage_proposals WHERE status='PENDING'
          AND (proposer_member_id=ANY($1::uuid[]) OR target_member_id=ANY($1::uuid[])) LIMIT 1`,
        [[proposer.id,target.id]]
      );
      if(pending.rowCount)throw new GameError("Seçilen üyelerden biri için zaten bekleyen bir evlilik teklifi bulunuyor.");
      const turn=await currentTurn(client,input.guildId);
      const created=(await client.query<{id:string}>(
        `INSERT INTO dynasty_marriage_proposals(
           guild_id,proposer_country_id,target_country_id,proposer_member_id,target_member_id,created_turn,created_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [input.guildId,input.proposerCountryId,input.targetCountryId,proposer.id,target.id,turn,input.actorId]
      )).rows[0]!;
      return loadMarriageProposal(client,input.guildId,created.id);
    });
  },

  async respondMarriage(input:{
    guildId:string;responderCountryId:string;proposalId:string;actorId:string;decision:"ACCEPT"|"REJECT";
  }):Promise<{proposal:DynastyMarriageProposalView;dynastyIds:string[]}>{
    return withTransaction(async(client)=>{
      const proposal=await loadMarriageProposal(client,input.guildId,input.proposalId,true);
      if(proposal.status!=="PENDING")throw new GameError("Bu evlilik teklifi artık beklemede değil.");
      if(proposal.target_country_id!==input.responderCountryId)throw new GameError("Bu teklifi yalnızca hedef devlet yanıtlayabilir.");
      await activeCountry(client,input.guildId,input.responderCountryId);
      const turn=await currentTurn(client,input.guildId);
      if(input.decision==="REJECT"){
        await client.query(
          `UPDATE dynasty_marriage_proposals SET status='REJECTED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW() WHERE id=$3`,
          [turn,input.actorId,proposal.id]
        );
        return{proposal:{...proposal,status:"REJECTED",resolved_turn:turn,resolved_by:input.actorId},dynastyIds:[]};
      }
      await lockMarriageMembers(client,[proposal.proposer_member_id,proposal.target_member_id]);
      const proposer=await memberAcrossGuild(client,input.guildId,proposal.proposer_member_id,true);
      const target=await memberAcrossGuild(client,input.guildId,proposal.target_member_id,true);
      await establishMarriage(client,proposer,target,turn,input.actorId,"ACCEPTED_PROPOSAL");
      await client.query(
        `UPDATE dynasty_marriage_proposals SET status='ACCEPTED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW() WHERE id=$3`,
        [turn,input.actorId,proposal.id]
      );
      return{proposal:{...proposal,status:"ACCEPTED",resolved_turn:turn,resolved_by:input.actorId},dynastyIds:[proposer.dynasty_id,target.dynasty_id]};
    });
  },

  async withdrawMarriage(input:{guildId:string;proposerCountryId:string;proposalId:string;actorId:string}):Promise<DynastyMarriageProposalView>{
    return withTransaction(async(client)=>{
      const proposal=await loadMarriageProposal(client,input.guildId,input.proposalId,true);
      if(proposal.status!=="PENDING")throw new GameError("Bu evlilik teklifi artık beklemede değil.");
      if(proposal.proposer_country_id!==input.proposerCountryId)throw new GameError("Bu teklifi yalnızca gönderen devlet geri çekebilir.");
      await activeCountry(client,input.guildId,input.proposerCountryId);
      const turn=await currentTurn(client,input.guildId);
      await client.query(
        `UPDATE dynasty_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW() WHERE id=$3`,
        [turn,input.actorId,proposal.id]
      );
      return{...proposal,status:"CANCELLED",resolved_turn:turn,resolved_by:input.actorId};
    });
  },

  async forceCrossDynastyMarriage(input:{
    guildId:string;firstCountryId:string;secondCountryId:string;firstMemberId:string;secondMemberId:string;actorId:string;
  }):Promise<{first:DynastyMarriageMember;second:DynastyMarriageMember}>{
    return withTransaction(async(client)=>{
      if(input.firstCountryId===input.secondCountryId)throw new GameError("Bu işlem iki farklı devletin hanedan üyeleri içindir.");
      await activeCountry(client,input.guildId,input.firstCountryId);
      await activeCountry(client,input.guildId,input.secondCountryId);
      await lockMarriageMembers(client,[input.firstMemberId,input.secondMemberId]);
      const first=await memberAcrossGuild(client,input.guildId,input.firstMemberId,true);
      const second=await memberAcrossGuild(client,input.guildId,input.secondMemberId,true);
      if(first.country_id!==input.firstCountryId||second.country_id!==input.secondCountryId)
        throw new GameError("Seçilen hanedan üyesi belirtilen devlete ait değil.");
      await establishMarriage(client,first,second,await currentTurn(client,input.guildId),input.actorId,"GM_DIRECT");
      return{first,second};
    });
  },

  async designate(input:{guildId:string;countryId:string;actorId:string;memberId:string;kind:"MONARCH"|"HEIR"}):Promise<void>{
    await withTransaction(async(client)=>{
      const country=await activeCountry(client,input.guildId,input.countryId);
      const dynasty=await dynastyForCountry(client,input.guildId,input.countryId,true);
      const member=await memberForDynasty(client,dynasty.id,input.memberId,true);
      if(member.status!=="ALIVE")throw new GameError("Ölü bir hanedan üyesi seçilemez.");
      const turn=await currentTurn(client,input.guildId);
      if(input.kind==="MONARCH"){
        if(member.gender==="FEMALE"){
          const eligibleMale=await client.query(
            `SELECT 1 FROM dynasty_members
              WHERE dynasty_id=$1 AND status='ALIVE' AND gender='MALE' AND is_monarch=FALSE AND id<>$2
                AND (is_heir=TRUE OR succession_rank IS NOT NULL) LIMIT 1`,[dynasty.id,member.id]
          );
          if(eligibleMale.rowCount)throw new GameError("Yaşayan ve verasete uygun erkek varken kadın üye hükümdar yapılamaz.");
        }
        await client.query("UPDATE dynasty_members SET is_monarch=FALSE WHERE dynasty_id=$1",[dynasty.id]);
        await client.query("UPDATE dynasty_members SET is_monarch=TRUE,is_heir=FALSE,title=$1,relation='Hükümdar',updated_at=NOW() WHERE id=$2",[member.gender==="MALE"?"Kral":"Kraliçe",member.id]);
        await addEvent(client,dynasty.id,turn,"MONARCH_DESIGNATED",member.id,{name:member.name,actorId:input.actorId});
        const texts:string[]=[];
        await reconcileSuccession(client,dynasty.id,turn,country.name,texts);
      }else{
        if(member.is_monarch)throw new GameError("Hükümdar aynı zamanda taht varisi olamaz.");
        if(member.gender==="FEMALE"){
          const eligibleMale=await client.query(
            `SELECT 1 FROM dynasty_members
              WHERE dynasty_id=$1 AND status='ALIVE' AND gender='MALE' AND is_monarch=FALSE AND id<>$2
                AND (is_heir=TRUE OR succession_rank IS NOT NULL) LIMIT 1`,[dynasty.id,member.id]
          );
          if(eligibleMale.rowCount)throw new GameError("Yaşayan ve verasete uygun erkek varken kadın üye taht varisi yapılamaz.");
        }
        await client.query("UPDATE dynasty_members SET is_heir=FALSE WHERE dynasty_id=$1",[dynasty.id]);
        await client.query("UPDATE dynasty_members SET is_heir=TRUE,updated_at=NOW() WHERE id=$1",[member.id]);
        await addEvent(client,dynasty.id,turn,"HEIR_DESIGNATED",member.id,{name:member.name,actorId:input.actorId,automatic:false});
      }
    });
  },

  async manualDeath(input:{guildId:string;countryId:string;actorId:string;memberId:string;reason:string}):Promise<void>{
    await withTransaction(async(client)=>{
      const country=await activeCountry(client,input.guildId,input.countryId);
      const dynasty=await dynastyForCountry(client,input.guildId,input.countryId,true);
      const member=await memberForDynasty(client,dynasty.id,input.memberId,true);
      const reason=input.reason.trim();
      if(reason.length<2||reason.length>200)throw new GameError("Ölüm nedeni 2-200 karakter arasında olmalıdır.");
      const texts:string[]=[];
      await killMember(client,dynasty.id,member,await currentTurn(client,input.guildId),reason,country.name,texts);
    });
  },

  async attemptBirth(input:{
    guildId:string;countryId:string;actorId:string;parentMemberId?:string|null;
    allowAnyMarriedMember?:boolean;
  }):Promise<{
    success:boolean;attemptRoll:number;ageModifier:number;pendingBirthId:string|null;childGender:DynastyGender|null;
    genderRoll:number|null;complication:"DEATH"|"ILLNESS"|"HEALTHY"|null;complicationRoll:number|null;
    motherName:string;fatherName:string;
  }>{
    return withTransaction(async(client)=>{
      await activeCountry(client,input.guildId,input.countryId);
      const dynasty=await dynastyForCountry(client,input.guildId,input.countryId,true);
      const turn=await currentTurn(client,input.guildId);
      const pendingName=await client.query(
        "SELECT 1 FROM dynasty_birth_sessions WHERE dynasty_id=$1 AND status='PENDING_NAME' LIMIT 1",
        [dynasty.id]
      );
      if(pendingName.rowCount)throw new GameError("Bu hanedanda adı henüz konulmamış bir çocuk bulunuyor. Önce mevcut doğumu isimlendirin.");
      const monarch=await client.query<DynastyMemberView>(
        "SELECT * FROM dynasty_members WHERE dynasty_id=$1 AND status='ALIVE' AND is_monarch=TRUE LIMIT 1 FOR UPDATE",
        [dynasty.id]
      );
      const ruler=monarch.rows[0];
      if(!ruler)throw new GameError("Hanedanda yaşayan bir hükümdar bulunmuyor.");
      const parent=input.parentMemberId
        ?await memberForDynasty(client,dynasty.id,input.parentMemberId,true)
        :ruler;
      const regularBirthParent=dynastyMemberCanBeBirthParent({
        memberId:parent.id,monarchId:ruler.id,status:parent.status,spouseId:parent.spouse_id,
        motherId:parent.mother_id,fatherId:parent.father_id
      });
      const managerBirthParent=input.allowAnyMarriedMember&&parent.status==="ALIVE"&&Boolean(parent.spouse_id);
      if(!regularBirthParent&&!managerBirthParent)
        throw new GameError("Yalnızca hükümdar, hükümdarın evli doğrudan çocuğu veya yönetici tarafından seçilen yaşayan ve evli bir hanedan üyesi için gebelik zarı atılabilir.");
      if(!parent.spouse_id)throw new GameError((parent.id===ruler.id?"Hükümdarın":"Seçilen hanedan üyesinin")+" yaşayan bir eşi bulunmalıdır.");
      const spouse=await memberAcrossGuild(client,input.guildId,parent.spouse_id,true);
      if(spouse.status!=="ALIVE")throw new GameError((parent.id===ruler.id?"Hükümdarın":"Seçilen hanedan üyesinin")+" yaşayan bir eşi bulunmalıdır.");
      if(spouse.spouse_id!==parent.id)throw new GameError("Seçilen çiftin evlilik kaydı karşılıklı değil; yönetici düzeltmesi gerekiyor.");
      if(spouse.dynasty_id!==dynasty.id)
        throw new GameError("Gebelik denemesi yalnızca çiftin kayıtlı olduğu yeni hanedanın yöneticisi tarafından yapılabilir.");
      const mother=parent.gender==="FEMALE"?parent:spouse.gender==="FEMALE"?spouse:null;
      const father=parent.gender==="MALE"?parent:spouse.gender==="MALE"?spouse:null;
      if(!mother||!father)throw new GameError("Bu doğum mekaniği için yaşayan bir anne ve baba kaydı gerekir.");
      if(mother.health==="SICK"){
        if(mother.sick_until_turn!==null&&turn<=mother.sick_until_turn)
          throw new GameError(mother.name+" hastalığı nedeniyle Tur "+(mother.sick_until_turn+1)+" öncesinde yeni gebelik deneyemez.");
        if(mother.sick_until_turn===null)throw new GameError(mother.name+" hasta olduğu için yeni gebelik deneyemez.");
      }
      const motherAge=Number(mother.age);
      const modifier=birthAgeModifier(motherAge);
      if(modifier===null)throw new GameError("Doğum yapacak eş 18-44 yaş aralığında olmalıdır.");
      const [firstMemberId,secondMemberId]=orderedDynastyCoupleIds(mother.id,father.id);
      const coupleAttempt=(await client.query<{last_attempt_turn:number}>(
        `SELECT last_attempt_turn FROM dynasty_couple_birth_attempts
          WHERE dynasty_id=$1 AND first_member_id=$2 AND second_member_id=$3 FOR UPDATE`,
        [dynasty.id,firstMemberId,secondMemberId]
      )).rows[0];
      if(coupleAttempt&&turn-coupleAttempt.last_attempt_turn<BIRTH_ATTEMPT_COOLDOWN_TURNS)
        throw new GameError(mother.name+" ile "+father.name+" için yeni çocuk denemesi Tur "+
          (coupleAttempt.last_attempt_turn+BIRTH_ATTEMPT_COOLDOWN_TURNS)+" itibarıyla yapılabilir.");
      await client.query(
        `INSERT INTO dynasty_couple_birth_attempts(dynasty_id,first_member_id,second_member_id,last_attempt_turn)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(dynasty_id,first_member_id,second_member_id)
         DO UPDATE SET last_attempt_turn=EXCLUDED.last_attempt_turn,updated_at=NOW()`,
        [dynasty.id,firstMemberId,secondMemberId,turn]
      );
      await client.query("UPDATE dynasties SET last_birth_attempt_turn=$1,updated_at=NOW() WHERE id=$2",[turn,dynasty.id]);
      const attemptRoll=randomInt(1,21);
      if(!birthAttemptSucceeded(motherAge,attemptRoll)){
        await addEvent(client,dynasty.id,turn,"BIRTH_ATTEMPT_FAILED",mother.id,{motherName:mother.name,fatherName:father.name,parentMemberId:parent.id,roll:attemptRoll,modifier});
        return{
          success:false,attemptRoll,ageModifier:modifier,pendingBirthId:null,childGender:null,genderRoll:null,
          complication:null,complicationRoll:null,motherName:mother.name,fatherName:father.name
        };
      }
      const genderRoll=randomInt(1,3);
      const childGender=newbornGender(genderRoll);
      const directMonarchChild=parent.mother_id===ruler.id||parent.father_id===ruler.id;
      const childRelation=parent.id===ruler.id
        ?"Hükümdarın çocuğu"
        :directMonarchChild
          ?"Hükümdarın torunu"
          :"Hanedan üyesinin çocuğu";
      const complicationRoll=randomInt(1,21);
      const complication=birthComplication(complicationRoll);
      const pending=(await client.query<{id:string}>(
        `INSERT INTO dynasty_birth_sessions(
           dynasty_id,initiated_by,parent_member_id,mother_id,father_id,game_turn,
           attempt_roll,age_modifier,gender_roll,gender,complication_roll,complication,child_relation
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [dynasty.id,input.actorId,parent.id,mother.id,father.id,turn,attemptRoll,modifier,genderRoll,
          childGender,complicationRoll,complication,childRelation]
      )).rows[0]!;
      await addEvent(client,dynasty.id,turn,"BIRTH_AWAITING_NAME",mother.id,{
        pendingBirthId:pending.id,gender:childGender,motherName:mother.name,fatherName:father.name,
        parentMemberId:parent.id,attemptRoll,modifier,genderRoll,complicationRoll,complication,
        managerOverride:Boolean(input.allowAnyMarriedMember)
      });
      if(complication==="ILLNESS"){
        await client.query(
          "UPDATE dynasty_members SET health='SICK',sick_until_turn=$1,updated_at=NOW() WHERE id=$2",
          [turn+MATERNAL_ILLNESS_COOLDOWN_TURNS,mother.id]
        );
        await addEvent(client,dynasty.id,turn,"MATERNAL_ILLNESS",mother.id,{name:mother.name,blockedThroughTurn:turn+MATERNAL_ILLNESS_COOLDOWN_TURNS});
      }else if(complication==="DEATH"){
        const texts:string[]=[];
        await killMember(client,dynasty.id,mother,turn,"Doğum komplikasyonu",dynasty.country_name,texts);
      }
      return{
        success:true,attemptRoll,ageModifier:modifier,pendingBirthId:pending.id,childGender,genderRoll,
        complication,complicationRoll,motherName:mother.name,fatherName:father.name
      };
    });
  },

  async nameBirth(input:{
    guildId:string;countryId:string;actorId:string;pendingBirthId:string;childName:string;allowManager?:boolean;
  }):Promise<{dynastyId:string;childId:string;childName:string;childGender:DynastyGender;motherName:string;fatherName:string}>{
    return withTransaction(async(client)=>{
      await activeCountry(client,input.guildId,input.countryId);
      const dynasty=await dynastyForCountry(client,input.guildId,input.countryId,true);
      type PendingBirth={
        id:string;initiated_by:string;parent_member_id:string;mother_id:string;father_id:string;game_turn:number;
        attempt_roll:number;age_modifier:number;gender_roll:number;gender:DynastyGender;
        complication_roll:number;complication:"DEATH"|"ILLNESS"|"HEALTHY";child_relation:string;status:string;
        mother_name:string;father_name:string;
      };
      const pending=(await client.query<PendingBirth>(
        `SELECT session.*,mother.name AS mother_name,father.name AS father_name
           FROM dynasty_birth_sessions session
           JOIN dynasty_members mother ON mother.id=session.mother_id
           JOIN dynasty_members father ON father.id=session.father_id
          WHERE session.id=$1 AND session.dynasty_id=$2
          FOR UPDATE OF session`,[input.pendingBirthId,dynasty.id]
      )).rows[0];
      if(!pending)throw new GameError("İsimlendirilecek doğum kaydı bulunamadı.");
      if(pending.status!=="PENDING_NAME")throw new GameError("Bu çocuğa daha önce isim verilmiş.");
      if(pending.initiated_by!==input.actorId&&!input.allowManager)
        throw new GameError("Bu çocuğa yalnızca doğum zarını atan oyuncu veya oyun yöneticisi isim verebilir.");
      const childName=input.childName.trim().replace(/\s+/g," ");
      if(childName.length<2||childName.length>80)throw new GameError("Çocuk adı 2-80 karakter arasında olmalıdır.");
      const duplicate=await client.query(
        "SELECT 1 FROM dynasty_members WHERE dynasty_id=$1 AND lower(name)=lower($2)",[dynasty.id,childName]
      );
      if(duplicate.rowCount)throw new GameError("Hanedanda aynı adlı bir üye zaten bulunuyor.");
      const rank=Number((await client.query<{rank:number}>(
        "SELECT COALESCE(MAX(succession_rank),0)::integer+1 AS rank FROM dynasty_members WHERE dynasty_id=$1",
        [dynasty.id]
      )).rows[0]?.rank??1);
      const child=(await client.query<{id:string}>(
        `INSERT INTO dynasty_members(
           dynasty_id,name,gender,age,title,relation,succession_rank,mother_id,father_id,born_turn
         ) VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [dynasty.id,childName,pending.gender,pending.gender==="MALE"?"Prens":"Prenses",
          pending.child_relation,rank,pending.mother_id,pending.father_id,pending.game_turn]
      )).rows[0]!;
      await client.query(
        "UPDATE dynasty_birth_sessions SET status='COMPLETED',child_id=$1,completed_at=NOW() WHERE id=$2",
        [child.id,pending.id]
      );
      await addEvent(client,dynasty.id,pending.game_turn,"BIRTH",child.id,{
        childName,gender:pending.gender,motherName:pending.mother_name,fatherName:pending.father_name,
        parentMemberId:pending.parent_member_id,attemptRoll:pending.attempt_roll,modifier:pending.age_modifier,
        genderRoll:pending.gender_roll,complicationRoll:pending.complication_roll,complication:pending.complication
      });
      const texts:string[]=[];
      await reconcileSuccession(client,dynasty.id,pending.game_turn,dynasty.country_name,texts);
      return{
        dynastyId:dynasty.id,childId:child.id,childName,childGender:pending.gender,
        motherName:pending.mother_name,fatherName:pending.father_name
      };
    });
  },

  async setPublishedMessage(input:{dynastyId:string;channelId:string;messageId:string}):Promise<void>{
    await pool.query(
      "UPDATE dynasties SET published_channel_id=$1,published_message_id=$2,updated_at=NOW() WHERE id=$3",
      [input.channelId,input.messageId,input.dynastyId]
    );
  },

  async publishedDynastyIds(guildId:string):Promise<string[]>{
    return (await pool.query<{id:string}>(
      "SELECT id FROM dynasties WHERE guild_id=$1 AND published_channel_id IS NOT NULL AND published_message_id IS NOT NULL",
      [guildId]
    )).rows.map((row)=>row.id);
  },

  async setDeathLogChannel(guildId:string,channelId:string|null):Promise<void>{
    await pool.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING",[guildId]);
    await pool.query(
      "UPDATE guilds SET dynasty_death_log_channel_id=$1,updated_at=NOW() WHERE discord_id=$2",
      [channelId,guildId]
    );
  },

  async deathLogChannel(guildId:string):Promise<string|null>{
    return (await pool.query<{channel_id:string|null}>(
      "SELECT dynasty_death_log_channel_id AS channel_id FROM guilds WHERE discord_id=$1",
      [guildId]
    )).rows[0]?.channel_id??null;
  },

  async pendingDeathLogBatches(guildId:string):Promise<DynastyDeathLogBatch[]>{
    return (await pool.query<{
      dynasty_id:string;country_name:string;game_turn:number;entries:unknown;publish_attempts:number;
    }>(
      `SELECT resolution.dynasty_id,country.name AS country_name,resolution.game_turn,
              resolution.details->'deathLogs' AS entries,
              resolution.death_log_publish_attempts AS publish_attempts
         FROM dynasty_turn_resolutions resolution
         JOIN dynasties dynasty ON dynasty.id=resolution.dynasty_id
         JOIN countries country ON country.id=dynasty.country_id
        WHERE dynasty.guild_id=$1 AND resolution.death_log_published_at IS NULL
          AND jsonb_array_length(COALESCE(resolution.details->'deathLogs','[]'::jsonb))>0
        ORDER BY resolution.game_turn,resolution.processed_at
        LIMIT 50`,[guildId]
    )).rows.map((row)=>({
      dynastyId:row.dynasty_id,countryName:row.country_name,gameTurn:Number(row.game_turn),
      entries:Array.isArray(row.entries)?row.entries.map(String):[],publishAttempts:Number(row.publish_attempts)
    }));
  },

  async markDeathLogPublished(dynastyId:string,gameTurn:number):Promise<void>{
    await pool.query(
      `UPDATE dynasty_turn_resolutions
          SET death_log_published_at=NOW(),death_log_publish_attempts=death_log_publish_attempts+1,death_log_last_error=NULL
        WHERE dynasty_id=$1 AND game_turn=$2`,[dynastyId,gameTurn]
    );
  },

  async markDeathLogFailed(dynastyId:string,gameTurn:number,error:string):Promise<void>{
    await pool.query(
      `UPDATE dynasty_turn_resolutions
          SET death_log_publish_attempts=death_log_publish_attempts+1,death_log_last_error=$3
        WHERE dynasty_id=$1 AND game_turn=$2`,[dynastyId,gameTurn,error.slice(0,1000)]
    );
  },

  async deathLogStatus(guildId:string):Promise<DynastyDeathLogStatus>{
    const [channelId,batches]=await Promise.all([
      this.deathLogChannel(guildId),this.pendingDeathLogBatches(guildId)
    ]);
    return{
      channelId,pendingBatches:batches.length,
      pendingEntries:batches.reduce((total,batch)=>total+batch.entries.length,0)
    };
  },

  async processTurn(guildId:string,turn:number):Promise<DynastyTurnResult>{
    const dynasties=(await pool.query<{id:string;country_name:string}>(
      `SELECT dynasty.id,country.name AS country_name FROM dynasties dynasty
        JOIN countries country ON country.id=dynasty.country_id
       WHERE dynasty.guild_id=$1 AND country.status='ACTIVE' ORDER BY country.name`,[guildId]
    )).rows;
    const events:DynastyTurnEvent[]=[];
    const failures:string[]=[];
    let processed=0;
    let deathChecks=0;
    for(const dynasty of dynasties){
      try{
        const resolution=await withTransaction(async(client)=>{
          const claimed=await client.query(
            "INSERT INTO dynasty_turn_resolutions(dynasty_id,game_turn) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING dynasty_id",
            [dynasty.id,turn]
          );
          if(!claimed.rowCount)return null;
          const turnTexts:string[]=[];
          const deathLogs:string[]=[];
          await client.query("UPDATE dynasty_members SET age=age+1,updated_at=NOW() WHERE dynasty_id=$1 AND status='ALIVE'",[dynasty.id]);
          const recovered=(await client.query<{id:string;name:string}>(
            `UPDATE dynasty_members SET health='HEALTHY',sick_until_turn=NULL,updated_at=NOW()
              WHERE dynasty_id=$1 AND status='ALIVE' AND health='SICK' AND sick_until_turn<$2
            RETURNING id,name`,[dynasty.id,turn]
          )).rows;
          for(const member of recovered){
            await addEvent(client,dynasty.id,turn,"RECOVERY",member.id,{name:member.name});
            turnTexts.push("💚 **"+dynasty.country_name+"** • **"+member.name+"** hastalıktan kurtuldu.");
          }
          const elderly=(await client.query<DynastyMemberView>(
            `SELECT * FROM dynasty_members WHERE dynasty_id=$1 AND status='ALIVE' AND age>60
              ORDER BY is_monarch DESC,is_heir DESC,age DESC FOR UPDATE`,[dynasty.id]
          )).rows;
          for(const snapshot of elderly){
            const current=(await client.query<DynastyMemberView>("SELECT * FROM dynasty_members WHERE id=$1",[snapshot.id])).rows[0];
            if(!current||current.status!=="ALIVE")continue;
            const roll=randomInt(1,21);
            const currentAge=Number(current.age);
            const failureMaximum=dynastyDeathFailureMaximum(currentAge);
            const failed=dynastyDeathSaveFailed(currentAge,roll);
            await addEvent(client,dynasty.id,turn,failed?"DEATH_SAVE_FAILED":"DEATH_SAVE_PASSED",current.id,{name:current.name,age:current.age,roll});
            deathLogs.push(
              "🎲 **"+dynasty.country_name+" • "+current.title+" "+current.name+"** — "+currentAge+" yaş\n"+
              "↳ Ölüm zarı: **1d20 "+roll+"** • Ölüm aralığı: **1–"+failureMaximum+"** • Sonuç: **"+(failed?"ÖLDÜ":"HAYATTA")+"**"
            );
            if(failed)await killMember(client,dynasty.id,current,turn,"Yaşlılık • Ölüm zarı: 1d20 "+roll,dynasty.country_name,turnTexts);
          }
          await client.query(
            "UPDATE dynasty_turn_resolutions SET details=$1::jsonb WHERE dynasty_id=$2 AND game_turn=$3",
            [JSON.stringify({events:turnTexts,deathLogs}),dynasty.id,turn]
          );
          return{turnTexts,deathChecks:deathLogs.length};
        });
        if(resolution===null)continue;
        processed+=1;
        deathChecks+=resolution.deathChecks;
        events.push(...resolution.turnTexts.map((text)=>({dynastyId:dynasty.id,countryName:dynasty.country_name,text})));
      }catch(error){
        failures.push(dynasty.country_name+": "+(error instanceof Error?error.message:String(error)));
      }
    }
    return{processed,events,deathChecks,failures};
  }
};
