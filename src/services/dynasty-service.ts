import {randomInt} from "node:crypto";
import {pool,withTransaction,type DbClient} from "../db/pool.js";
import type {CultureGroup} from "../domain/cultures.js";
import {availableCulturalDynastyName} from "../domain/dynasty-names.js";
import {localNobleMarriageCandidates,type LocalNobleCandidate} from "../domain/dynasty-local-nobles.js";
import {
  BIRTH_ATTEMPT_COOLDOWN_TURNS,MATERNAL_ILLNESS_COOLDOWN_TURNS,
  automaticDynastyRelations,
  MINIMUM_MARRIAGE_AGE,
  birthAgeModifier,birthAttemptSucceeded,birthComplication,dynastyDeathFailureMaximum,dynastyDeathSaveFailed,dynastyMemberCanBeBirthParent,
  dynastyMemberCanMarry,newbornGender,orderedDynastyCoupleIds,type DynastyGender,type DynastyHealth,type DynastyMemberStatus
} from "../domain/dynasty.js";
import {GameError} from "./game-service.js";
import {fallbackDynastyCandidateSql,lineageAwareDynastyCandidateSql,recomputeLineageAwareSuccessionRanksSql} from "./dynasty-succession.js";
import {rollNobleTraitKey} from "./noble-trait-service.js";
import type {NobleTraitKey} from "../domain/noble-traits.js";

export interface DynastyMemberView{
  id:string;name:string;gender:DynastyGender;age:number|null;title:string;relation:string;
  status:DynastyMemberStatus;health:DynastyHealth;sick_until_turn:number|null;
  is_monarch:boolean;is_heir:boolean;succession_rank:number|null;
  birth_dynasty_id:string|null;birth_dynasty_name:string|null;birth_country_name:string|null;
  spouse_id:string|null;spouse_name:string|null;spouse_title:string|null;spouse_age:number|null;spouse_country_name:string|null;
  spouse_dynasty_name:string|null;spouse_birth_dynasty_name:string|null;spouse_birth_country_name:string|null;
  spouse_status:DynastyMemberStatus|null;
  roman_spouse_id:string|null;
  roman_mother_id:string|null;roman_father_id:string|null;
  mother_id:string|null;mother_name:string|null;
  father_id:string|null;father_name:string|null;born_turn:number|null;died_turn:number|null;death_reason:string|null;
  kidnapped:boolean;captor_country_name:string|null;captured_settlement_name:string|null;
  trait_key:NobleTraitKey|null;
}

export interface DynastyView{
  id:string;guild_id:string;country_id:string;country_name:string;name:string;
  steppe_title_id:string|null;steppe_title_name:string|null;steppe_title_tier:"KHAN"|"LANDHOLDER"|null;
  steppe_holder_user_id:string|null;
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
  npcBirths:number;npcMarriages:number;
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
  proposer_dynasty_id:string;target_dynasty_id:string;
  proposer_member_id:string;target_member_id:string;status:DynastyMarriageStatus;
  created_turn:number;resolved_turn:number|null;created_by:string;resolved_by:string|null;
  created_at:Date|string;resolved_at:Date|string|null;
  public_channel_id:string|null;public_message_id:string|null;
  proposer_country_name:string;target_country_name:string;
  proposer_dynasty_name:string;target_dynasty_name:string;
  proposer_member_name:string;target_member_name:string;
  proposer_steppe_title_id:string|null;target_steppe_title_id:string|null;
  proposer_holder_user_id:string|null;target_holder_user_id:string|null;
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
      WHERE dynasty.country_id=$1 AND dynasty.guild_id=$2 AND dynasty.steppe_title_id IS NULL${lock?" FOR UPDATE OF dynasty":""}`,
    [countryId,guildId]
  )).rows[0];
  if(!row)throw new GameError("Bu devlet için henüz hanedan oluşturulmadı.");
  return row;
}

async function dynastyForContext(
  client:DbClient,guildId:string,countryId:string,dynastyId:string|undefined,lock=false
):Promise<{id:string;name:string;country_name:string;last_birth_attempt_turn:number|null}>{
  if(!dynastyId)return dynastyForCountry(client,guildId,countryId,lock);
  const row=(await client.query<{id:string;name:string;country_name:string;last_birth_attempt_turn:number|null}>(
    `SELECT dynasty.id,dynasty.name,country.name AS country_name,dynasty.last_birth_attempt_turn
       FROM dynasties dynasty JOIN countries country ON country.id=dynasty.country_id
      WHERE dynasty.id=$1 AND dynasty.country_id=$2 AND dynasty.guild_id=$3${lock?" FOR UPDATE OF dynasty":""}`,
    [dynastyId,countryId,guildId]
  )).rows[0];
  if(!row)throw new GameError("Bu hane için hanedan kaydı bulunamadı.");
  return row;
}

async function memberForDynasty(client:DbClient,dynastyId:string,memberId:string,lock=false):Promise<DynastyMemberView>{
  const row=(await client.query<DynastyMemberView>(
    `SELECT member.*,COALESCE(spouse.name,roman_spouse.name) AS spouse_name,
            COALESCE(spouse.title,roman_spouse.position) AS spouse_title,COALESCE(spouse.age,roman_spouse.age) AS spouse_age,
            COALESCE(spouse_country.name,roman_spouse_country.name) AS spouse_country_name,
            COALESCE(spouse_dynasty.name,roman_spouse_family.name) AS spouse_dynasty_name,
            birth_dynasty.name AS birth_dynasty_name,birth_country.name AS birth_country_name,
            spouse_birth_dynasty.name AS spouse_birth_dynasty_name,
            spouse_birth_country.name AS spouse_birth_country_name,
            COALESCE(spouse.status,roman_spouse.status) AS spouse_status,
            COALESCE(mother.name,roman_mother.name) AS mother_name,COALESCE(father.name,roman_father.name) AS father_name,
            (captivity.id IS NOT NULL) AS kidnapped,captor.name AS captor_country_name,
            captive_settlement.name AS captured_settlement_name
       FROM dynasty_members member
       LEFT JOIN dynasty_members spouse ON spouse.id=member.spouse_id
       LEFT JOIN roman_family_members roman_spouse ON roman_spouse.id=member.roman_spouse_id
       LEFT JOIN roman_families roman_spouse_family ON roman_spouse_family.id=roman_spouse.family_id
       LEFT JOIN roman_republics roman_spouse_republic ON roman_spouse_republic.id=roman_spouse_family.republic_id
       LEFT JOIN countries roman_spouse_country ON roman_spouse_country.id=roman_spouse_republic.country_id
       LEFT JOIN dynasties spouse_dynasty ON spouse_dynasty.id=spouse.dynasty_id
       LEFT JOIN countries spouse_country ON spouse_country.id=spouse_dynasty.country_id
       LEFT JOIN dynasties birth_dynasty ON birth_dynasty.id=COALESCE(member.birth_dynasty_id,member.dynasty_id)
       LEFT JOIN countries birth_country ON birth_country.id=birth_dynasty.country_id
       LEFT JOIN dynasties spouse_birth_dynasty ON spouse_birth_dynasty.id=COALESCE(spouse.birth_dynasty_id,spouse.dynasty_id)
       LEFT JOIN countries spouse_birth_country ON spouse_birth_country.id=spouse_birth_dynasty.country_id
       LEFT JOIN dynasty_members mother ON mother.id=member.mother_id
       LEFT JOIN dynasty_members father ON father.id=member.father_id
       LEFT JOIN roman_family_members roman_mother ON roman_mother.id=member.roman_mother_id
       LEFT JOIN roman_family_members roman_father ON roman_father.id=member.roman_father_id
       LEFT JOIN LATERAL (
         SELECT held.id,held.captor_country_id,held.captured_settlement_id
           FROM espionage_captivities held
          WHERE held.captive_type='DYNASTY' AND held.captive_id=member.id AND held.status='HELD'
          ORDER BY held.created_at DESC LIMIT 1
       ) captivity ON TRUE
       LEFT JOIN countries captor ON captor.id=captivity.captor_country_id
       LEFT JOIN settlements captive_settlement ON captive_settlement.id=captivity.captured_settlement_id
      WHERE member.id=$1 AND member.dynasty_id=$2${lock?" FOR UPDATE OF member":""}`,
    [memberId,dynastyId]
  )).rows[0];
  if(!row)throw new GameError("Hanedan üyesi bulunamadı.");
  return row;
}

async function memberAcrossGuild(client:DbClient,guildId:string,memberId:string,lock=false):Promise<DynastyMarriageMember>{
  const row=(await client.query<DynastyMarriageMember>(
    `SELECT member.*,COALESCE(spouse.name,roman_spouse.name) AS spouse_name,
            COALESCE(spouse.title,roman_spouse.position) AS spouse_title,COALESCE(spouse.age,roman_spouse.age) AS spouse_age,
            COALESCE(spouse_country.name,roman_spouse_country.name) AS spouse_country_name,
            COALESCE(spouse_dynasty.name,roman_spouse_family.name) AS spouse_dynasty_name,
            birth_dynasty.name AS birth_dynasty_name,birth_country.name AS birth_country_name,
            spouse_birth_dynasty.name AS spouse_birth_dynasty_name,
            spouse_birth_country.name AS spouse_birth_country_name,
            COALESCE(spouse.status,roman_spouse.status) AS spouse_status,
            COALESCE(mother.name,roman_mother.name) AS mother_name,COALESCE(father.name,roman_father.name) AS father_name,
            (captivity.id IS NOT NULL) AS kidnapped,captor.name AS captor_country_name,
            captive_settlement.name AS captured_settlement_name,
            dynasty.id AS dynasty_id,dynasty.guild_id,dynasty.country_id,dynasty.name AS dynasty_name,
            country.name AS country_name
       FROM dynasty_members member
       JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
       JOIN countries country ON country.id=dynasty.country_id
       LEFT JOIN dynasty_members spouse ON spouse.id=member.spouse_id
       LEFT JOIN roman_family_members roman_spouse ON roman_spouse.id=member.roman_spouse_id
       LEFT JOIN roman_families roman_spouse_family ON roman_spouse_family.id=roman_spouse.family_id
       LEFT JOIN roman_republics roman_spouse_republic ON roman_spouse_republic.id=roman_spouse_family.republic_id
       LEFT JOIN countries roman_spouse_country ON roman_spouse_country.id=roman_spouse_republic.country_id
       LEFT JOIN dynasties spouse_dynasty ON spouse_dynasty.id=spouse.dynasty_id
       LEFT JOIN countries spouse_country ON spouse_country.id=spouse_dynasty.country_id
       LEFT JOIN dynasties birth_dynasty ON birth_dynasty.id=COALESCE(member.birth_dynasty_id,member.dynasty_id)
       LEFT JOIN countries birth_country ON birth_country.id=birth_dynasty.country_id
       LEFT JOIN dynasties spouse_birth_dynasty ON spouse_birth_dynasty.id=COALESCE(spouse.birth_dynasty_id,spouse.dynasty_id)
       LEFT JOIN countries spouse_birth_country ON spouse_birth_country.id=spouse_birth_dynasty.country_id
       LEFT JOIN dynasty_members mother ON mother.id=member.mother_id
       LEFT JOIN dynasty_members father ON father.id=member.father_id
       LEFT JOIN roman_family_members roman_mother ON roman_mother.id=member.roman_mother_id
       LEFT JOIN roman_family_members roman_father ON roman_father.id=member.roman_father_id
       LEFT JOIN LATERAL (
         SELECT held.id,held.captor_country_id,held.captured_settlement_id
           FROM espionage_captivities held
          WHERE held.captive_type='DYNASTY' AND held.captive_id=member.id AND held.status='HELD'
          ORDER BY held.created_at DESC LIMIT 1
       ) captivity ON TRUE
       LEFT JOIN countries captor ON captor.id=captivity.captor_country_id
       LEFT JOIN settlements captive_settlement ON captive_settlement.id=captivity.captured_settlement_id
      WHERE member.id=$1 AND dynasty.guild_id=$2${lock?" FOR UPDATE OF member":""}`,
    [memberId,guildId]
  )).rows[0];
  if(!row)throw new GameError("Hanedan üyesi bulunamadı.");
  return row;
}

function requireMarriageEligibility(member:DynastyMemberView,label:string):void{
  if(member.status!=="ALIVE")throw new GameError(label+" hayatta değil.");
  if(member.kidnapped)throw new GameError(label+" kaçırılmış durumda olduğu için evlendirilemez.");
  if(member.age===null)throw new GameError(label+" için yaş bilgisi girilmeden evlilik yapılamaz.");
  if(member.age<MINIMUM_MARRIAGE_AGE)throw new GameError(label+" henüz "+MINIMUM_MARRIAGE_AGE+" yaşını doldurmadı.");
  if(member.spouse_id||member.roman_spouse_id)throw new GameError(label+" zaten evli.");
  if(!dynastyMemberCanMarry(member.age,member.status,member.spouse_id??member.roman_spouse_id??null))throw new GameError(label+" evlilik koşullarını karşılamıyor.");
}

function requireLocalNobleMarriageEligibility(member:DynastyMemberView):void{
  if(member.status!=="ALIVE")throw new GameError(member.name+" hayatta değil.");
  if(member.kidnapped)throw new GameError(member.name+" kaçırılmış durumda olduğu için evlendirilemez.");
  if(member.age===null)throw new GameError(member.name+" için yaş bilgisi girilmeden evlilik yapılamaz.");
  if(member.age<MINIMUM_MARRIAGE_AGE)throw new GameError(member.name+" henüz "+MINIMUM_MARRIAGE_AGE+" yaşını doldurmadı.");
  if((member.spouse_id||member.roman_spouse_id)&&member.spouse_status!=="DEAD")throw new GameError(member.name+" zaten evli.");
}

async function localNobleCandidatesForMember(
  client:DbClient,input:{guildId:string;countryId:string;dynastyId?:string;memberId:string},lock=false
):Promise<{dynasty:{id:string;name:string;country_name:string};member:DynastyMemberView;turn:number;candidates:LocalNobleCandidate[]} >{
  if(lock)await activeCountry(client,input.guildId,input.countryId);
  else{
    const active=await client.query(
      "SELECT 1 FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'",
      [input.countryId,input.guildId]
    );
    if(!active.rowCount)throw new GameError("Etkin devlet bulunamadı.");
  }
  const dynasty=await dynastyForContext(client,input.guildId,input.countryId,input.dynastyId,lock);
  if(lock)await lockMarriageMembers(client,[input.memberId]);
  const member=await memberForDynasty(client,dynasty.id,input.memberId,lock);
  requireLocalNobleMarriageEligibility(member);
  const culture=(await client.query<{primary_culture_group:CultureGroup}>(
    "SELECT primary_culture_group FROM countries WHERE id=$1 AND guild_id=$2",
    [input.countryId,input.guildId]
  )).rows[0]?.primary_culture_group??"UNASSIGNED";
  const turn=await currentTurn(client,input.guildId);
  const names=(await client.query<{name:string}>(
    "SELECT name FROM dynasty_members WHERE dynasty_id=$1",[dynasty.id]
  )).rows.map((row)=>row.name);
  return{dynasty,member,turn,candidates:localNobleMarriageCandidates({
    dynastyId:dynasty.id,memberId:member.id,memberGender:member.gender,memberAge:member.age!,
    cultureGroup:culture,currentTurn:turn,usedNames:names
  })};
}

async function lockMarriageMembers(client:DbClient,memberIds:string[]):Promise<void>{
  for(const id of [...new Set(memberIds)].sort())
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["dynasty-marriage-member:"+id]);
}

async function loadMarriageProposal(client:DbClient,guildId:string,proposalId:string,lock=false):Promise<DynastyMarriageProposalView>{
  const row=(await client.query<DynastyMarriageProposalView>(
    `SELECT proposal.*,proposer_country.name AS proposer_country_name,target_country.name AS target_country_name,
            proposer_member.dynasty_id AS proposer_dynasty_id,target_member.dynasty_id AS target_dynasty_id,
            proposer_dynasty.name AS proposer_dynasty_name,target_dynasty.name AS target_dynasty_name,
            proposer_member.name AS proposer_member_name,target_member.name AS target_member_name,
            proposer_dynasty.steppe_title_id AS proposer_steppe_title_id,target_dynasty.steppe_title_id AS target_steppe_title_id,
            proposer_title.holder_user_id AS proposer_holder_user_id,target_title.holder_user_id AS target_holder_user_id
       FROM dynasty_marriage_proposals proposal
       JOIN countries proposer_country ON proposer_country.id=proposal.proposer_country_id
       JOIN countries target_country ON target_country.id=proposal.target_country_id
       JOIN dynasty_members proposer_member ON proposer_member.id=proposal.proposer_member_id
       JOIN dynasty_members target_member ON target_member.id=proposal.target_member_id
       JOIN dynasties proposer_dynasty ON proposer_dynasty.id=proposer_member.dynasty_id
       JOIN dynasties target_dynasty ON target_dynasty.id=target_member.dynasty_id
       LEFT JOIN steppe_internal_titles proposer_title ON proposer_title.id=proposer_dynasty.steppe_title_id
       LEFT JOIN steppe_internal_titles target_title ON target_title.id=target_dynasty.steppe_title_id
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

export async function reconcileSuccession(
  client:DbClient,dynastyId:string,turn:number,countryName:string,eventTexts:string[],formerMonarchId:string|null=null
):Promise<void>{
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["dynasty-succession:"+dynastyId]);
  const steppeTitle=(await client.query<{title_name:string;tier:"KHAN"|"LANDHOLDER"}>(`
    SELECT title.title_name,title.tier FROM dynasties dynasty
    JOIN steppe_internal_titles title ON title.id=dynasty.steppe_title_id WHERE dynasty.id=$1`,[dynastyId])).rows[0]??null;
  let monarch=(await client.query<{id:string;name:string;gender:DynastyGender}>(
    `SELECT id,name,gender FROM dynasty_members
      WHERE dynasty_id=$1 AND status='ALIVE' AND is_monarch=TRUE LIMIT 1 FOR UPDATE`,[dynastyId]
  )).rows[0];
  if(!monarch){
    const successor=(await client.query<{id:string;name:string;gender:DynastyGender}>(
      formerMonarchId?lineageAwareDynastyCandidateSql:fallbackDynastyCandidateSql,
      [dynastyId,formerMonarchId]
    )).rows[0];
    if(!successor){
      await addEvent(client,dynastyId,turn,"SUCCESSION_CRISIS",null,{countryName,reason:"Yaşayan hanedan üyesi bulunmuyor"});
      eventTexts.push("⚠️ **"+countryName+"** devletinde yaşayan hanedan üyesi kalmadı; veraset krizi başladı.");
      return;
    }
    await client.query("UPDATE dynasty_members SET is_monarch=FALSE,is_heir=FALSE WHERE dynasty_id=$1",[dynastyId]);
    await client.query(
      "UPDATE dynasty_members SET is_monarch=TRUE,title=$1,relation=$2,updated_at=NOW() WHERE id=$3",
      [steppeTitle?.title_name??(successor.gender==="MALE"?"Kral":"Kraliçe"),steppeTitle?"Hane Reisi":"Hükümdar",successor.id]
    );
    monarch=successor;
    await addEvent(client,dynastyId,turn,"SUCCESSION",successor.id,{countryName,name:successor.name});
    eventTexts.push(steppeTitle
      ?"👑 **"+successor.name+"**, **"+steppeTitle.title_name+"** hanesinin başına geçti."
      :"👑 **"+countryName+"** tahtına **"+successor.name+"** geçti.");
    const spouse=(await client.query<{id:string;gender:DynastyGender}>(
      "SELECT id,gender FROM dynasty_members WHERE spouse_id=$1 AND status='ALIVE' LIMIT 1",[successor.id]
    )).rows[0];
    if(spouse)await client.query(
      "UPDATE dynasty_members SET title=$1,relation=$2,updated_at=NOW() WHERE id=$3 AND is_monarch=FALSE",
      [steppeTitle?(steppeTitle.tier==="KHAN"?"Han Eşi":"Toprak Ağası Eşi"):(spouse.gender==="FEMALE"?"Kraliçe":"Kral Eşi"),
        steppeTitle?"Hane Reisinin Eşi":"Hükümdarın eşi",spouse.id]
    );
  }
  await client.query("UPDATE dynasty_members SET is_heir=FALSE WHERE dynasty_id=$1 AND id=$2",[dynastyId,monarch.id]);
  await client.query("UPDATE dynasty_members SET succession_rank=NULL WHERE dynasty_id=$1 AND id=$2",[dynastyId,monarch.id]);
  await client.query(recomputeLineageAwareSuccessionRanksSql,[dynastyId,monarch.id]);
  const existingHeir=(await client.query<{id:string}>(
    "SELECT id FROM dynasty_members WHERE dynasty_id=$1 AND status='ALIVE' AND is_heir=TRUE AND id<>$2 LIMIT 1",
    [dynastyId,monarch.id]
  )).rows[0];
  const next=(await client.query<{id:string;name:string}>(
    lineageAwareDynastyCandidateSql,
    [dynastyId,monarch.id]
  )).rows[0];
  if(next){
    // Kısmi benzersiz indeks aynı hanedanda yalnızca tek yaşayan varise izin verir.
    // Eski ve yeni varisi tek UPDATE içinde değiştirmek PostgreSQL'in satır işleme
    // sırasına göre geçici bir çift-varis çakışması üretebilir; bu yüzden önce
    // mevcut işareti tamamen kaldırıp ardından seçilen üyeyi varis yapıyoruz.
    await client.query("UPDATE dynasty_members SET is_heir=FALSE,updated_at=NOW() WHERE dynasty_id=$1 AND is_heir=TRUE",[dynastyId]);
    await client.query("UPDATE dynasty_members SET is_heir=TRUE,updated_at=NOW() WHERE dynasty_id=$1 AND id=$2 AND status='ALIVE'",[dynastyId,next.id]);
    if(existingHeir?.id!==next.id){
      await addEvent(client,dynastyId,turn,"HEIR_DESIGNATED",next.id,{name:next.name,automatic:true,malePreference:true});
      eventTexts.push(steppeTitle
        ?"📜 **"+next.name+"**, **"+steppeTitle.title_name+"** hanesinin yeni varisi oldu."
        :"📜 **"+next.name+"**, **"+countryName+"** tahtının yeni varisi oldu.");
    }
  }else{
    await client.query("UPDATE dynasty_members SET is_heir=FALSE,updated_at=NOW() WHERE dynasty_id=$1",[dynastyId]);
    await addEvent(client,dynastyId,turn,"SUCCESSION_CRISIS",monarch.id,{countryName,reason:"Uygun varis bulunmuyor"});
    eventTexts.push(steppeTitle
      ?"⚠️ **"+steppeTitle.title_name+"** hanesinde uygun varis bulunmuyor."
      :"⚠️ **"+countryName+"** devletinde uygun taht varisi bulunmuyor.");
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
  if(member.spouse_id&&member.is_monarch){
    const steppeTitle=(await client.query<{tier:"KHAN"|"LANDHOLDER"}>(`SELECT title.tier FROM dynasties dynasty
      JOIN steppe_internal_titles title ON title.id=dynasty.steppe_title_id WHERE dynasty.id=$1`,[dynastyId])).rows[0]??null;
    await client.query(`UPDATE dynasty_members SET relation=$2,
       title=CASE WHEN $3::boolean THEN $4 WHEN gender='FEMALE' THEN 'Dul Kraliçe' ELSE 'Dul Kral Eşi' END,updated_at=NOW()
      WHERE id=$1 AND status='ALIVE' AND is_monarch=FALSE`,[member.spouse_id,
      steppeTitle?"Önceki Hane Reisinin Eşi":"Önceki hükümdarın eşi",Boolean(steppeTitle),
      steppeTitle?.tier==="KHAN"?"Dul Han Eşi":"Dul Toprak Ağası Eşi"]);
  }
  await addEvent(client,dynastyId,turn,"DEATH",member.id,{name:member.name,age:member.age,reason,wasMonarch:member.is_monarch,wasHeir:member.is_heir});
  const ageText=member.age===null?"yaşı bilinmiyorken":member.age+" yaşında";
  eventTexts.push("⚰️ **"+countryName+"** • **"+member.name+"**, "+ageText+" hayatını kaybetti. Sebep: **"+reason+"**.");
  if(member.is_monarch||member.is_heir)await reconcileSuccession(
    client,dynastyId,turn,countryName,eventTexts,member.is_monarch?member.id:null
  );
}

export async function killDynastyMemberFromEspionage(
  client:DbClient,memberId:string,turn:number,reason="Suikast"
):Promise<void>{
  const row=(await client.query<DynastyMemberView&{dynasty_id:string;country_name:string}>(
    `SELECT member.*,dynasty.id AS dynasty_id,country.name AS country_name,
            spouse.name AS spouse_name,mother.name AS mother_name,father.name AS father_name
       FROM dynasty_members member
       JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
       JOIN countries country ON country.id=dynasty.country_id
       LEFT JOIN dynasty_members spouse ON spouse.id=member.spouse_id
       LEFT JOIN dynasty_members mother ON mother.id=member.mother_id
       LEFT JOIN dynasty_members father ON father.id=member.father_id
      WHERE member.id=$1 FOR UPDATE OF member`,[memberId]
  )).rows[0];
  if(!row||row.status!=="ALIVE")return;
  await killMember(client,row.dynasty_id,row,turn,reason,row.country_name,[]);
}

interface NpcDynastyCountry{
  country_id:string;country_name:string;dynasty_id:string;culture_group:CultureGroup;
}

interface NpcDynastyLocation{
  country_id:string;q:number;r:number;region_key:string|null;
}

interface NpcMarriageCandidate{
  id:string;dynasty_id:string;country_id:string;country_name:string;dynasty_name:string;
  name:string;gender:DynastyGender;age:number;is_monarch:boolean;
  birth_dynasty_id:string|null;mother_id:string|null;father_id:string|null;
}

interface NpcDynastyAutomationResult{
  births:number;marriages:number;events:DynastyTurnEvent[];
}

const NPC_MARRIAGE_MAX_HEX_DISTANCE=6;

function axialDistance(left:NpcDynastyLocation,right:NpcDynastyLocation):number{
  const dq=left.q-right.q;
  const dr=left.r-right.r;
  return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));
}

function nearbyNpcCountries(left:NpcDynastyLocation[],right:NpcDynastyLocation[]):{nearby:boolean;distance:number}{
  if(!left.length||!right.length)return{nearby:false,distance:Number.POSITIVE_INFINITY};
  let distance=Number.POSITIVE_INFINITY;
  for(const first of left)for(const second of right)distance=Math.min(distance,axialDistance(first,second));
  const sharedRegion=left.some((first)=>first.region_key&&right.some((second)=>second.region_key===first.region_key));
  return{nearby:sharedRegion||distance<=NPC_MARRIAGE_MAX_HEX_DISTANCE,distance};
}

async function nextNpcChildName(
  client:DbClient,dynastyId:string,culture:CultureGroup,gender:DynastyGender
):Promise<string>{
  const names=(await client.query<{name:string}>("SELECT name FROM dynasty_members WHERE dynasty_id=$1",[dynastyId])).rows.map((row)=>row.name);
  return availableCulturalDynastyName(culture,gender,names,(maximum)=>randomInt(0,maximum));
}

async function insertNpcChild(input:{
  client:DbClient;country:NpcDynastyCountry;turn:number;mother:DynastyMemberView;father:DynastyMemberView;
  gender:DynastyGender;attemptRoll:number;modifier:number;genderRoll:number;
  complicationRoll:number;complication:"DEATH"|"ILLNESS"|"HEALTHY";childRelation:string;
}):Promise<{childId:string;childName:string;eventTexts:string[]}>{
  const {client,country,turn,mother,father}=input;
  const childName=await nextNpcChildName(client,country.dynasty_id,country.culture_group,input.gender);
  const rank=Number((await client.query<{rank:number}>(
    "SELECT COALESCE(MAX(succession_rank),0)::integer+1 AS rank FROM dynasty_members WHERE dynasty_id=$1",
    [country.dynasty_id]
  )).rows[0]?.rank??1);
  const child=(await client.query<{id:string}>(
    `INSERT INTO dynasty_members(
       dynasty_id,name,gender,age,title,relation,succession_rank,mother_id,father_id,born_turn,birth_dynasty_id,trait_key
     ) VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,$1,$10) RETURNING id`,
    [country.dynasty_id,childName,input.gender,input.gender==="MALE"?"Prens":"Prenses",input.childRelation,
      rank,mother.id,father.id,turn,rollNobleTraitKey()]
  )).rows[0]!;
  await client.query(
    `INSERT INTO dynasty_birth_sessions(
       dynasty_id,initiated_by,parent_member_id,mother_id,father_id,game_turn,
       attempt_roll,age_modifier,gender_roll,gender,complication_roll,complication,child_relation,status,child_id,completed_at
     ) VALUES($1,'system:npc-dynasty',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'COMPLETED',$13,NOW())`,
    [country.dynasty_id,father.id,mother.id,father.id,turn,input.attemptRoll,input.modifier,input.genderRoll,
      input.gender,input.complicationRoll,input.complication,input.childRelation,child.id]
  );
  await addEvent(client,country.dynasty_id,turn,"BIRTH",child.id,{
    childName,gender:input.gender,motherName:mother.name,fatherName:father.name,parentMemberId:father.id,
    attemptRoll:input.attemptRoll,modifier:input.modifier,genderRoll:input.genderRoll,
    complicationRoll:input.complicationRoll,complication:input.complication,automaticNpc:true
  });
  const eventTexts=["👶 **"+country.country_name+"** • **"+mother.name+"** ile **"+father.name+"** çiftinin "+
    (input.gender==="MALE"?"oğlu":"kızı")+" **"+childName+"** dünyaya geldi."];
  if(input.complication==="ILLNESS"){
    await client.query(
      "UPDATE dynasty_members SET health='SICK',sick_until_turn=$1,updated_at=NOW() WHERE id=$2",
      [turn+MATERNAL_ILLNESS_COOLDOWN_TURNS,mother.id]
    );
    await addEvent(client,country.dynasty_id,turn,"MATERNAL_ILLNESS",mother.id,{
      name:mother.name,blockedThroughTurn:turn+MATERNAL_ILLNESS_COOLDOWN_TURNS,automaticNpc:true
    });
    eventTexts.push("🩺 **"+mother.name+"** doğum komplikasyonu nedeniyle hastalandı.");
  }else if(input.complication==="DEATH"){
    await killMember(client,country.dynasty_id,mother,turn,"Doğum komplikasyonu",country.country_name,eventTexts);
  }
  await reconcileSuccession(client,country.dynasty_id,turn,country.country_name,eventTexts);
  return{childId:child.id,childName,eventTexts};
}

async function completePendingNpcBirths(
  client:DbClient,country:NpcDynastyCountry,turn:number
):Promise<{births:number;eventTexts:string[]}>{
  type Pending={
    id:string;game_turn:number;mother_id:string;father_id:string;gender:DynastyGender;attempt_roll:number;
    age_modifier:number;gender_roll:number;complication_roll:number;complication:"DEATH"|"ILLNESS"|"HEALTHY";
    child_relation:string;
  };
  const pending=(await client.query<Pending>(
    `SELECT * FROM dynasty_birth_sessions WHERE dynasty_id=$1 AND status='PENDING_NAME'
      ORDER BY created_at LIMIT 1 FOR UPDATE`,[country.dynasty_id]
  )).rows[0];
  if(!pending)return{births:0,eventTexts:[]};
  const mother=await memberForDynasty(client,country.dynasty_id,pending.mother_id,true);
  const father=await memberForDynasty(client,country.dynasty_id,pending.father_id,true);
  const childName=await nextNpcChildName(client,country.dynasty_id,country.culture_group,pending.gender);
  const rank=Number((await client.query<{rank:number}>(
    "SELECT COALESCE(MAX(succession_rank),0)::integer+1 AS rank FROM dynasty_members WHERE dynasty_id=$1",
    [country.dynasty_id]
  )).rows[0]?.rank??1);
  const child=(await client.query<{id:string}>(
    `INSERT INTO dynasty_members(
       dynasty_id,name,gender,age,title,relation,succession_rank,mother_id,father_id,born_turn,birth_dynasty_id,trait_key
     ) VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,$1,$10) RETURNING id`,
    [country.dynasty_id,childName,pending.gender,pending.gender==="MALE"?"Prens":"Prenses",pending.child_relation,
      rank,mother.id,father.id,pending.game_turn,rollNobleTraitKey()]
  )).rows[0]!;
  await client.query(
    "UPDATE dynasty_birth_sessions SET status='COMPLETED',child_id=$1,completed_at=NOW() WHERE id=$2",
    [child.id,pending.id]
  );
  await addEvent(client,country.dynasty_id,pending.game_turn,"BIRTH",child.id,{
    childName,gender:pending.gender,motherName:mother.name,fatherName:father.name,
    attemptRoll:pending.attempt_roll,modifier:pending.age_modifier,genderRoll:pending.gender_roll,
    complicationRoll:pending.complication_roll,complication:pending.complication,automaticNpcName:true
  });
  const texts=["👶 **"+country.country_name+"** hanesinde adı bekleyen çocuk kültürel olarak **"+childName+"** adıyla kaydedildi."];
  await reconcileSuccession(client,country.dynasty_id,turn,country.country_name,texts);
  return{births:1,eventTexts:texts};
}

async function processNpcBirthsForCountry(
  client:DbClient,country:NpcDynastyCountry,turn:number
):Promise<{births:number;eventTexts:string[]}>{
  let births=0;
  const eventTexts:string[]=[];
  const completed=await completePendingNpcBirths(client,country,turn);
  births+=completed.births;
  eventTexts.push(...completed.eventTexts);
  const monarch=(await client.query<{id:string}>(
    "SELECT id FROM dynasty_members WHERE dynasty_id=$1 AND status='ALIVE' AND is_monarch=TRUE LIMIT 1",
    [country.dynasty_id]
  )).rows[0];
  if(!monarch)return{births,eventTexts};
  const couples=(await client.query<{mother:DynastyMemberView;father:DynastyMemberView}>(
    `SELECT to_jsonb(mother) AS mother,to_jsonb(father) AS father
       FROM dynasty_members mother
       JOIN dynasty_members father ON father.id=mother.spouse_id AND father.spouse_id=mother.id
      WHERE mother.dynasty_id=$1 AND father.dynasty_id=$1
        AND mother.gender='FEMALE' AND father.gender='MALE'
        AND mother.status='ALIVE' AND father.status='ALIVE'
        AND NOT EXISTS(SELECT 1 FROM espionage_captivities captivity
          WHERE captivity.captive_type='DYNASTY' AND captivity.status='HELD'
            AND captivity.captive_id IN (mother.id,father.id))
        AND mother.age BETWEEN 18 AND 44
        AND mother.health='HEALTHY'
      ORDER BY mother.is_monarch DESC,father.is_monarch DESC,mother.age,mother.id
      FOR UPDATE OF mother,father`,[country.dynasty_id]
  )).rows;
  for(const couple of couples){
    const mother=couple.mother;
    const father=couple.father;
    const [firstMemberId,secondMemberId]=orderedDynastyCoupleIds(mother.id,father.id);
    const prior=(await client.query<{last_attempt_turn:number}>(
      `SELECT last_attempt_turn FROM dynasty_couple_birth_attempts
        WHERE dynasty_id=$1 AND first_member_id=$2 AND second_member_id=$3 FOR UPDATE`,
      [country.dynasty_id,firstMemberId,secondMemberId]
    )).rows[0];
    if(prior?.last_attempt_turn===turn)continue;
    await client.query(
      `INSERT INTO dynasty_couple_birth_attempts(dynasty_id,first_member_id,second_member_id,last_attempt_turn)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(dynasty_id,first_member_id,second_member_id)
       DO UPDATE SET last_attempt_turn=EXCLUDED.last_attempt_turn,updated_at=NOW()`,
      [country.dynasty_id,firstMemberId,secondMemberId,turn]
    );
    await client.query("UPDATE dynasties SET last_birth_attempt_turn=$1,updated_at=NOW() WHERE id=$2",[turn,country.dynasty_id]);
    const modifier=birthAgeModifier(Number(mother.age));
    if(modifier===null)continue;
    const attemptRoll=randomInt(1,21);
    if(!birthAttemptSucceeded(Number(mother.age),attemptRoll)){
      await addEvent(client,country.dynasty_id,turn,"BIRTH_ATTEMPT_FAILED",mother.id,{
        motherName:mother.name,fatherName:father.name,parentMemberId:father.id,roll:attemptRoll,modifier,automaticNpc:true
      });
      continue;
    }
    const genderRoll=randomInt(1,3);
    const gender=newbornGender(genderRoll);
    const complicationRoll=randomInt(1,21);
    const complication=birthComplication(complicationRoll);
    const directMonarchChild=mother.mother_id===monarch.id||mother.father_id===monarch.id||
      father.mother_id===monarch.id||father.father_id===monarch.id;
    const childRelation=mother.id===monarch.id||father.id===monarch.id
      ?"Hükümdarın çocuğu"
      :directMonarchChild?"Hükümdarın torunu":"Hanedan üyesinin çocuğu";
    const created=await insertNpcChild({
      client,country,turn,mother,father,gender,attemptRoll,modifier,genderRoll,
      complicationRoll,complication,childRelation
    });
    births+=1;
    eventTexts.push(...created.eventTexts);
  }
  return{births,eventTexts};
}

async function processNpcMarriages(
  client:DbClient,guildId:string,turn:number,countries:NpcDynastyCountry[]
):Promise<{marriages:number;events:DynastyTurnEvent[]}>{
  if(countries.length<2)return{marriages:0,events:[]};
  const locations=(await client.query<NpcDynastyLocation>(
    `SELECT settlement.country_id,hex.q,hex.r,hex.region_key
       FROM settlements settlement
       JOIN settlement_map_positions position ON position.settlement_id=settlement.id
       JOIN map_hexes hex ON hex.id=position.hex_id
      WHERE hex.guild_id=$1 AND settlement.country_id=ANY($2::uuid[])`,
    [guildId,countries.map((country)=>country.country_id)]
  )).rows;
  const locationsByCountry=new Map<string,NpcDynastyLocation[]>();
  for(const location of locations){
    const rows=locationsByCountry.get(location.country_id)??[];
    rows.push(location);locationsByCountry.set(location.country_id,rows);
  }
  const candidates=(await client.query<NpcMarriageCandidate>(
    `SELECT member.id,member.dynasty_id,dynasty.country_id,country.name AS country_name,dynasty.name AS dynasty_name,
            member.name,member.gender,member.age,member.is_monarch,member.birth_dynasty_id,member.mother_id,member.father_id
       FROM dynasty_members member
       JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
       JOIN countries country ON country.id=dynasty.country_id
       LEFT JOIN steppe_internal_titles steppe_title ON steppe_title.id=dynasty.steppe_title_id
      WHERE dynasty.guild_id=$1 AND country.status='ACTIVE' AND COALESCE(country.is_system_faction,FALSE)=FALSE
        AND ((dynasty.steppe_title_id IS NULL AND NOT EXISTS(SELECT 1 FROM country_members player WHERE player.country_id=country.id))
          OR (dynasty.steppe_title_id IS NOT NULL AND steppe_title.holder_user_id IS NULL))
        AND member.status='ALIVE' AND member.spouse_id IS NULL AND member.roman_spouse_id IS NULL AND member.age>=$2
        AND NOT EXISTS(SELECT 1 FROM espionage_captivities captivity
          WHERE captivity.captive_type='DYNASTY' AND captivity.captive_id=member.id AND captivity.status='HELD')
        AND NOT EXISTS(SELECT 1 FROM dynasty_marriage_proposals proposal
          WHERE proposal.status='PENDING'
            AND member.id IN (proposal.proposer_member_id,proposal.target_member_id))
        AND NOT EXISTS(SELECT 1 FROM roman_dynasty_marriage_proposals proposal
          WHERE proposal.status='PENDING' AND proposal.dynasty_member_id=member.id)
      ORDER BY country.name,member.age DESC,member.name`,[guildId,MINIMUM_MARRIAGE_AGE]
  )).rows.map((row)=>({...row,age:Number(row.age)}));
  const possible:Array<{man:NpcMarriageCandidate;woman:NpcMarriageCandidate;score:number}>=[];
  for(const man of candidates.filter((member)=>member.gender==="MALE")){
    for(const woman of candidates.filter((member)=>member.gender==="FEMALE"&&!member.is_monarch)){
      if(man.country_id===woman.country_id||Math.abs(man.age-woman.age)>25)continue;
      if(man.birth_dynasty_id&&woman.birth_dynasty_id&&man.birth_dynasty_id===woman.birth_dynasty_id)continue;
      if(man.mother_id&&[woman.mother_id,woman.father_id].includes(man.mother_id))continue;
      if(man.father_id&&[woman.mother_id,woman.father_id].includes(man.father_id))continue;
      const proximity=nearbyNpcCountries(locationsByCountry.get(man.country_id)??[],locationsByCountry.get(woman.country_id)??[]);
      if(!proximity.nearby)continue;
      possible.push({man,woman,score:proximity.distance*100+Math.abs(man.age-woman.age)*3+randomInt(0,31)});
    }
  }
  possible.sort((left,right)=>left.score-right.score);
  const usedCountries=new Set<string>();
  const usedMembers=new Set<string>();
  const events:DynastyTurnEvent[]=[];
  let marriages=0;
  for(const match of possible){
    if(usedCountries.has(match.man.country_id)||usedCountries.has(match.woman.country_id)||
      usedMembers.has(match.man.id)||usedMembers.has(match.woman.id))continue;
    await lockMarriageMembers(client,[match.man.id,match.woman.id]);
    const man=await memberAcrossGuild(client,guildId,match.man.id,true);
    const woman=await memberAcrossGuild(client,guildId,match.woman.id,true);
    if(!dynastyMemberCanMarry(man.age,man.status,man.spouse_id??man.roman_spouse_id??null)||
      !dynastyMemberCanMarry(woman.age,woman.status,woman.spouse_id??woman.roman_spouse_id??null))continue;
    const pending=await client.query(
      `SELECT 1 FROM dynasty_marriage_proposals proposal
        WHERE proposal.status='PENDING'
          AND (proposal.proposer_member_id=ANY($1::uuid[]) OR proposal.target_member_id=ANY($1::uuid[]))
       UNION ALL
       SELECT 1 FROM roman_dynasty_marriage_proposals proposal
        WHERE proposal.status='PENDING' AND proposal.dynasty_member_id=ANY($1::uuid[])
       LIMIT 1`,[[man.id,woman.id]]
    );
    if(pending.rowCount)continue;
    const proposal=(await client.query<{id:string}>(
      `INSERT INTO dynasty_marriage_proposals(
         guild_id,proposer_country_id,target_country_id,proposer_member_id,target_member_id,
         status,created_turn,resolved_turn,created_by,resolved_by,resolved_at
       ) VALUES($1,$2,$3,$4,$5,'PENDING',$6,NULL,'system:npc-dynasty',NULL,NULL) RETURNING id`,
      [guildId,man.country_id,woman.country_id,man.id,woman.id,turn]
    )).rows[0]!;
    await establishMarriage(client,man,woman,turn,"system:npc-dynasty","NPC_AUTO_ACCEPTED_PROPOSAL");
    await client.query(
      `UPDATE dynasty_marriage_proposals
          SET status='ACCEPTED',resolved_turn=$1,resolved_by='system:npc-dynasty',resolved_at=NOW()
        WHERE id=$2`,[turn,proposal.id]
    );
    const text="💍 **"+man.country_name+"** hanesinden **"+man.name+"** ile **"+woman.country_name+
      "** hanesinden **"+woman.name+"**, komşu NPC hanedanları arasında yapılan otomatik teklifle evlendi.";
    events.push({dynastyId:man.dynasty_id,countryName:man.country_name,text});
    events.push({dynastyId:woman.dynasty_id,countryName:woman.country_name,text});
    usedCountries.add(man.country_id);usedCountries.add(woman.country_id);
    usedMembers.add(man.id);usedMembers.add(woman.id);
    marriages+=1;
  }
  return{marriages,events};
}

async function processNpcDynastyTurn(client:DbClient,guildId:string,turn:number):Promise<NpcDynastyAutomationResult|null>{
  const claimed=await client.query(
    `INSERT INTO dynasty_npc_turn_resolutions(guild_id,game_turn)
     VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING guild_id`,[guildId,turn]
  );
  if(!claimed.rowCount)return null;
  const countries=(await client.query<NpcDynastyCountry>(
    `SELECT country.id AS country_id,country.name AS country_name,dynasty.id AS dynasty_id,
            country.primary_culture_group AS culture_group
       FROM countries country
       JOIN dynasties dynasty ON dynasty.country_id=country.id
       LEFT JOIN steppe_internal_titles steppe_title ON steppe_title.id=dynasty.steppe_title_id
      WHERE country.guild_id=$1 AND country.status='ACTIVE' AND COALESCE(country.is_system_faction,FALSE)=FALSE
        AND ((dynasty.steppe_title_id IS NULL AND NOT EXISTS(SELECT 1 FROM country_members player WHERE player.country_id=country.id))
          OR (dynasty.steppe_title_id IS NOT NULL AND steppe_title.holder_user_id IS NULL))
      ORDER BY country.name FOR UPDATE OF dynasty`,[guildId]
  )).rows;
  const events:DynastyTurnEvent[]=[];
  let births=0;
  for(const country of countries){
    const result=await processNpcBirthsForCountry(client,country,turn);
    births+=result.births;
    events.push(...result.eventTexts.map((text)=>({dynastyId:country.dynasty_id,countryName:country.country_name,text})));
  }
  const marriageResult=await processNpcMarriages(client,guildId,turn,countries);
  events.push(...marriageResult.events);
  await client.query(
    "UPDATE dynasty_npc_turn_resolutions SET details=$1::jsonb WHERE guild_id=$2 AND game_turn=$3",
    [JSON.stringify({births,marriages:marriageResult.marriages,events}),guildId,turn]
  );
  return{births,marriages:marriageResult.marriages,events};
}

async function loadViewByClause(column:"country_id"|"id"|"steppe_title_id",value:string):Promise<DynastyView|null>{
  const dynasty=(await pool.query<Omit<DynastyView,"members"|"events">>(
    `SELECT dynasty.id,dynasty.guild_id,dynasty.country_id,country.name AS country_name,dynasty.name,
            dynasty.steppe_title_id,title.title_name AS steppe_title_name,title.tier AS steppe_title_tier,
            title.holder_user_id AS steppe_holder_user_id,
            guild.current_turn,dynasty.last_birth_attempt_turn,dynasty.published_channel_id,dynasty.published_message_id
       FROM dynasties dynasty JOIN countries country ON country.id=dynasty.country_id
       JOIN guilds guild ON guild.discord_id=dynasty.guild_id
       LEFT JOIN steppe_internal_titles title ON title.id=dynasty.steppe_title_id
      WHERE dynasty.${column}=$1${column==="country_id"?" AND dynasty.steppe_title_id IS NULL":""}`,[value]
  )).rows[0];
  if(!dynasty)return null;
  const storedMembers=(await pool.query<DynastyMemberView>(
    `SELECT member.*,COALESCE(spouse.name,roman_spouse.name) AS spouse_name,
            COALESCE(spouse.title,roman_spouse.position) AS spouse_title,COALESCE(spouse.age,roman_spouse.age) AS spouse_age,
            COALESCE(spouse_country.name,roman_spouse_country.name) AS spouse_country_name,
            COALESCE(spouse_dynasty.name,roman_spouse_family.name) AS spouse_dynasty_name,
            birth_dynasty.name AS birth_dynasty_name,birth_country.name AS birth_country_name,
            spouse_birth_dynasty.name AS spouse_birth_dynasty_name,
            spouse_birth_country.name AS spouse_birth_country_name,
            COALESCE(spouse.status,roman_spouse.status) AS spouse_status,
            COALESCE(mother.name,roman_mother.name) AS mother_name,COALESCE(father.name,roman_father.name) AS father_name
       FROM dynasty_members member
       LEFT JOIN dynasty_members spouse ON spouse.id=member.spouse_id
       LEFT JOIN roman_family_members roman_spouse ON roman_spouse.id=member.roman_spouse_id
       LEFT JOIN roman_families roman_spouse_family ON roman_spouse_family.id=roman_spouse.family_id
       LEFT JOIN roman_republics roman_spouse_republic ON roman_spouse_republic.id=roman_spouse_family.republic_id
       LEFT JOIN countries roman_spouse_country ON roman_spouse_country.id=roman_spouse_republic.country_id
       LEFT JOIN dynasties spouse_dynasty ON spouse_dynasty.id=spouse.dynasty_id
       LEFT JOIN countries spouse_country ON spouse_country.id=spouse_dynasty.country_id
       LEFT JOIN dynasties birth_dynasty ON birth_dynasty.id=COALESCE(member.birth_dynasty_id,member.dynasty_id)
       LEFT JOIN countries birth_country ON birth_country.id=birth_dynasty.country_id
       LEFT JOIN dynasties spouse_birth_dynasty ON spouse_birth_dynasty.id=COALESCE(spouse.birth_dynasty_id,spouse.dynasty_id)
       LEFT JOIN countries spouse_birth_country ON spouse_birth_country.id=spouse_birth_dynasty.country_id
       LEFT JOIN dynasty_members mother ON mother.id=member.mother_id
       LEFT JOIN dynasty_members father ON father.id=member.father_id
       LEFT JOIN roman_family_members roman_mother ON roman_mother.id=member.roman_mother_id
       LEFT JOIN roman_family_members roman_father ON roman_father.id=member.roman_father_id
      WHERE member.dynasty_id=$1
      ORDER BY CASE WHEN member.status='ALIVE' THEN 0 ELSE 1 END,member.is_monarch DESC,member.is_heir DESC,
               member.succession_rank NULLS LAST,member.age DESC,member.created_at`,[dynasty.id]
  )).rows;
  const members=automaticDynastyRelations(storedMembers);
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
  viewBySteppeTitle(titleId:string){return loadViewByClause("steppe_title_id",titleId);},

  async viewForSteppeTitleHolder(guildId:string,userId:string):Promise<DynastyView|null>{
    const row=(await pool.query<{dynasty_id:string}>(`
      SELECT dynasty.id AS dynasty_id
        FROM steppe_internal_titles title
        JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
        JOIN dynasties dynasty ON dynasty.steppe_title_id=title.id
       WHERE confederation.guild_id=$1 AND confederation.status='ACTIVE' AND title.status='ACTIVE'
         AND title.holder_user_id=$2
       ORDER BY CASE title.tier WHEN 'KHAN' THEN 0 ELSE 1 END,title.created_at LIMIT 1`,[guildId,userId])).rows[0];
    return row?loadViewByClause("id",row.dynasty_id):null;
  },

  async marriageCandidatesForCountry(guildId:string,countryId:string,excludeDynastyId?:string|null){
    return (await pool.query<{
      id:string;name:string;title:string;age:number|null;status:DynastyMemberStatus;spouse_id:string|null;roman_spouse_id:string|null;
      dynasty_id:string;dynasty_name:string;
    }>(`SELECT member.id,member.name,member.title,member.age,member.status,member.spouse_id,member.roman_spouse_id,
               dynasty.id AS dynasty_id,dynasty.name AS dynasty_name
          FROM dynasties dynasty JOIN dynasty_members member ON member.dynasty_id=dynasty.id
         WHERE dynasty.guild_id=$1 AND dynasty.country_id=$2 AND member.status='ALIVE'
           AND NOT EXISTS(SELECT 1 FROM espionage_captivities captivity
             WHERE captivity.captive_type='DYNASTY' AND captivity.captive_id=member.id AND captivity.status='HELD')
           AND ($3::uuid IS NULL OR dynasty.id<>$3)
         ORDER BY dynasty.name,member.is_monarch DESC,member.is_heir DESC,member.age DESC`,
      [guildId,countryId,excludeDynastyId??null])).rows;
  },

  async localNobleMarriageCandidates(input:{
    guildId:string;countryId:string;dynastyId?:string;memberId:string;
  }):Promise<LocalNobleCandidate[]>{
    return withTransaction(async(client)=>(await localNobleCandidatesForMember(client,input)).candidates);
  },

  async marryLocalNoble(input:{
    guildId:string;countryId:string;dynastyId?:string;memberId:string;candidateKey:string;actorId:string;
  }):Promise<{
    dynastyId:string;memberId:string;memberName:string;spouseId:string;spouseName:string;
    spouseAge:number;spouseGender:DynastyGender;cultureLabel:string;traitKey:NobleTraitKey;
  }>{
    return withTransaction(async(client)=>{
      const context=await localNobleCandidatesForMember(client,input,true);
      const candidate=context.candidates.find((item)=>item.key===input.candidateKey);
      if(!candidate)throw new GameError("Seçilen yerel soylu adayı artık geçerli değil. Aday listesini yeniden açın.");
      const pending=await client.query(
        `SELECT 1 FROM dynasty_marriage_proposals
          WHERE status='PENDING' AND (proposer_member_id=$1 OR target_member_id=$1)
         UNION ALL
         SELECT 1 FROM roman_dynasty_marriage_proposals
          WHERE status='PENDING' AND dynasty_member_id=$1 LIMIT 1`,[context.member.id]
      );
      if(pending.rowCount)throw new GameError("Bu üye için bekleyen bir evlilik teklifi var. Önce teklifi sonuçlandırın veya geri çekin.");
      const traitKey=rollNobleTraitKey();
      if(context.member.spouse_id&&context.member.spouse_status==="DEAD"){
        await client.query(
          "UPDATE dynasty_members SET spouse_id=NULL,updated_at=NOW() WHERE id=$1 AND spouse_id=$2",
          [context.member.spouse_id,context.member.id]
        );
      }
      if(context.member.roman_spouse_id&&context.member.spouse_status==="DEAD"){
        await client.query(
          "UPDATE roman_family_members SET dynasty_spouse_id=NULL,updated_at=NOW() WHERE id=$1 AND dynasty_spouse_id=$2",
          [context.member.roman_spouse_id,context.member.id]
        );
      }
      const spouse=(await client.query<{id:string}>(
        `INSERT INTO dynasty_members(
           dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,
           succession_rank,spouse_id,born_turn,trait_key
         ) VALUES($1,$2,$3,$4,$5,'Yerel soylu eş','ALIVE','HEALTHY',FALSE,FALSE,NULL,$6,$7,$8)
         RETURNING id`,
        [context.dynasty.id,candidate.name,candidate.gender,candidate.age,candidate.title,
          context.member.id,context.turn-candidate.age,traitKey]
      )).rows[0]!;
      await client.query(
        "UPDATE dynasty_members SET spouse_id=$1,roman_spouse_id=NULL,updated_at=NOW() WHERE id=$2",
        [spouse.id,context.member.id]
      );
      await addEvent(client,context.dynasty.id,context.turn,"MARRIAGE",context.member.id,{
        memberName:context.member.name,spouseName:candidate.name,spouseAge:candidate.age,
        spouseGender:candidate.gender,cultureGroup:candidate.cultureGroup,actorId:input.actorId,
        source:"PLAYER_LOCAL_NOBLE"
      });
      return{
        dynastyId:context.dynasty.id,memberId:context.member.id,memberName:context.member.name,
        spouseId:spouse.id,spouseName:candidate.name,spouseAge:candidate.age,
        spouseGender:candidate.gender,cultureLabel:candidate.cultureLabel,traitKey
      };
    });
  },

  async create(input:{guildId:string;countryId:string;actorId:string;name:string}):Promise<string>{
    return withTransaction(async(client)=>{
      const country=await activeCountry(client,input.guildId,input.countryId);
      const name=input.name.trim().replace(/\s+/g," ");
      if(name.length<2||name.length>80)throw new GameError("Hanedan adı 2-80 karakter arasında olmalıdır.");
      const duplicate=await client.query("SELECT 1 FROM dynasties WHERE country_id=$1 AND steppe_title_id IS NULL",[country.id]);
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
           spouse_id,mother_id,father_id,born_turn,trait_key
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [dynasty.id,name,input.gender,input.age,title,relation,input.isMonarch,input.isHeir,
          input.successionRank??null,input.spouseId??null,input.motherId??null,input.fatherId??null,turn-input.age,rollNobleTraitKey()]
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
    const ids=(await pool.query<{id:string}>(`SELECT proposal.id FROM dynasty_marriage_proposals proposal
      WHERE proposal.guild_id=$1 AND proposal.status=$2
        AND (proposal.proposer_country_id=$3 OR proposal.target_country_id=$3)
      ORDER BY proposal.created_at DESC LIMIT 25`,[guildId,status,countryId])).rows;
    const client=await pool.connect();
    try{const rows:DynastyMarriageProposalView[]=[];for(const row of ids)rows.push(await loadMarriageProposal(client,guildId,row.id));return rows;}finally{client.release();}
  },

  async listMarriageProposalsByDynasty(guildId:string,dynastyId:string,status:DynastyMarriageStatus="PENDING"):Promise<DynastyMarriageProposalView[]>{
    const ids=(await pool.query<{id:string}>(`SELECT proposal.id FROM dynasty_marriage_proposals proposal
      JOIN dynasty_members proposer ON proposer.id=proposal.proposer_member_id
      JOIN dynasty_members target ON target.id=proposal.target_member_id
      WHERE proposal.guild_id=$1 AND proposal.status=$2 AND (proposer.dynasty_id=$3 OR target.dynasty_id=$3)
      ORDER BY proposal.created_at DESC LIMIT 25`,[guildId,status,dynastyId])).rows;
    const client=await pool.connect();
    try{const rows:DynastyMarriageProposalView[]=[];for(const row of ids)rows.push(await loadMarriageProposal(client,guildId,row.id));return rows;}finally{client.release();}
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
    proposerDynastyId?:string;
  }):Promise<DynastyMarriageProposalView>{
    return withTransaction(async(client)=>{
      await activeCountry(client,input.guildId,input.proposerCountryId);
      await activeCountry(client,input.guildId,input.targetCountryId);
      await lockMarriageMembers(client,[input.proposerMemberId,input.targetMemberId]);
      const proposer=await memberAcrossGuild(client,input.guildId,input.proposerMemberId,true);
      const target=await memberAcrossGuild(client,input.guildId,input.targetMemberId,true);
      if(proposer.country_id!==input.proposerCountryId)throw new GameError("Teklifi yapan üye seçilen devlete ait değil.");
      if(target.country_id!==input.targetCountryId)throw new GameError("Hedef üye seçilen devlete ait değil.");
      if(input.proposerDynastyId&&proposer.dynasty_id!==input.proposerDynastyId)throw new GameError("Teklifi yapan üye yönettiğiniz haneye ait değil.");
      if(proposer.dynasty_id===target.dynasty_id)throw new GameError("Aynı hane içindeki evlilikler teklif sistemiyle yapılamaz.");
      requireMarriageEligibility(proposer,proposer.name);
      requireMarriageEligibility(target,target.name);
      const pending=await client.query(
        `SELECT 1 FROM dynasty_marriage_proposals WHERE status='PENDING'
          AND (proposer_member_id=ANY($1::uuid[]) OR target_member_id=ANY($1::uuid[])) LIMIT 1`,
        [[proposer.id,target.id]]
      );
      if(pending.rowCount)throw new GameError("Seçilen üyelerden biri için zaten bekleyen bir evlilik teklifi bulunuyor.");
      const crossPending=await client.query(
        `SELECT 1 FROM roman_dynasty_marriage_proposals WHERE status='PENDING'
          AND dynasty_member_id=ANY($1::uuid[]) LIMIT 1`,[[proposer.id,target.id]]
      );
      if(crossPending.rowCount)throw new GameError("Seçilen üyelerden biri için zaten bekleyen bir Roma–hanedan evlilik teklifi bulunuyor.");
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
    guildId:string;responderCountryId:string;proposalId:string;actorId:string;decision:"ACCEPT"|"REJECT";responderDynastyId?:string;
  }):Promise<{proposal:DynastyMarriageProposalView;dynastyIds:string[]}>{
    return withTransaction(async(client)=>{
      const proposal=await loadMarriageProposal(client,input.guildId,input.proposalId,true);
      if(proposal.status!=="PENDING")throw new GameError("Bu evlilik teklifi artık beklemede değil.");
      if(proposal.target_country_id!==input.responderCountryId)throw new GameError("Bu teklifi yalnızca hedef devlet yanıtlayabilir.");
      if(input.responderDynastyId&&proposal.target_dynasty_id!==input.responderDynastyId)
        throw new GameError("Bu teklifi yalnızca hedef hanenin yöneticisi yanıtlayabilir.");
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

  async withdrawMarriage(input:{guildId:string;proposerCountryId:string;proposalId:string;actorId:string;proposerDynastyId?:string}):Promise<DynastyMarriageProposalView>{
    return withTransaction(async(client)=>{
      const proposal=await loadMarriageProposal(client,input.guildId,input.proposalId,true);
      if(proposal.status!=="PENDING")throw new GameError("Bu evlilik teklifi artık beklemede değil.");
      if(proposal.proposer_country_id!==input.proposerCountryId)throw new GameError("Bu teklifi yalnızca gönderen devlet geri çekebilir.");
      if(input.proposerDynastyId&&proposal.proposer_dynasty_id!==input.proposerDynastyId)
        throw new GameError("Bu teklifi yalnızca gönderen hanenin yöneticisi geri çekebilir.");
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
    allowAnyMarriedMember?:boolean;allowManager?:boolean;dynastyId?:string;
  }):Promise<{
    success:boolean;resumed:boolean;attemptRoll:number;ageModifier:number;pendingBirthId:string|null;childGender:DynastyGender|null;
    genderRoll:number|null;complication:"DEATH"|"ILLNESS"|"HEALTHY"|null;complicationRoll:number|null;
    motherName:string;fatherName:string;
  }>{
    return withTransaction(async(client)=>{
      await activeCountry(client,input.guildId,input.countryId);
      const dynasty=await dynastyForContext(client,input.guildId,input.countryId,input.dynastyId,true);
      const turn=await currentTurn(client,input.guildId);
      const pendingName=(await client.query<{
        id:string;initiated_by:string;attempt_roll:number;age_modifier:number;gender_roll:number;
        gender:DynastyGender;complication_roll:number;complication:"DEATH"|"ILLNESS"|"HEALTHY";
        mother_name:string;father_name:string;
      }>(
        `SELECT session.id,session.initiated_by,session.attempt_roll,session.age_modifier,
                session.gender_roll,session.gender,session.complication_roll,session.complication,
                mother.name AS mother_name,father.name AS father_name
           FROM dynasty_birth_sessions session
           JOIN dynasty_members mother ON mother.id=session.mother_id
           JOIN dynasty_members father ON father.id=session.father_id
          WHERE session.dynasty_id=$1 AND session.status='PENDING_NAME'
          ORDER BY session.created_at DESC
          LIMIT 1
          FOR UPDATE OF session`,
        [dynasty.id]
      )).rows[0];
      if(pendingName){
        if(pendingName.initiated_by!==input.actorId&&!input.allowManager)
          throw new GameError("Bu hanedanda başka bir oyuncunun isimlendirmesini bekleyen çocuk bulunuyor. Doğum zarını atan oyuncu `/hanedan cocuk-dene` komutuyla isimlendirme formunu yeniden açabilir.");
        return{
          success:true,resumed:true,attemptRoll:Number(pendingName.attempt_roll),ageModifier:Number(pendingName.age_modifier),
          pendingBirthId:pendingName.id,childGender:pendingName.gender,genderRoll:Number(pendingName.gender_roll),
          complication:pendingName.complication,complicationRoll:Number(pendingName.complication_roll),
          motherName:pendingName.mother_name,fatherName:pendingName.father_name
        };
      }
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
        throw new GameError("Yalnızca hanedandaki yaşayan ve evli bir çift için gebelik zarı atılabilir.");
      if(!parent.spouse_id)throw new GameError((parent.id===ruler.id?"Hükümdarın":"Seçilen hanedan üyesinin")+" yaşayan bir eşi bulunmalıdır.");
      const spouse=await memberAcrossGuild(client,input.guildId,parent.spouse_id,true);
      if(spouse.status!=="ALIVE")throw new GameError((parent.id===ruler.id?"Hükümdarın":"Seçilen hanedan üyesinin")+" yaşayan bir eşi bulunmalıdır.");
      const captiveCouple=await client.query(
        `SELECT 1 FROM espionage_captivities
          WHERE captive_type='DYNASTY' AND captive_id=ANY($1::uuid[]) AND status='HELD' LIMIT 1`,
        [[parent.id,spouse.id]]
      );
      if(captiveCouple.rowCount)throw new GameError("Kaçırılmış bir hanedan üyesi çocuk denemesi yapamaz.");
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
          success:false,resumed:false,attemptRoll,ageModifier:modifier,pendingBirthId:null,childGender:null,genderRoll:null,
          complication:null,complicationRoll:null,motherName:mother.name,fatherName:father.name
        };
      }
      const genderRoll=randomInt(1,3);
      const childGender=newbornGender(genderRoll);
      const rulerCouple=parent.id===ruler.id||spouse.id===ruler.id;
      const directMonarchChild=[parent,spouse].some((member)=>member.mother_id===ruler.id||member.father_id===ruler.id);
      const childRelation=rulerCouple
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
        managerOverride:Boolean(input.allowManager)
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
        success:true,resumed:false,attemptRoll,ageModifier:modifier,pendingBirthId:pending.id,childGender,genderRoll,
        complication,complicationRoll,motherName:mother.name,fatherName:father.name
      };
    });
  },

  async nameBirth(input:{
    guildId:string;countryId:string;actorId:string;pendingBirthId:string;childName:string;allowManager?:boolean;dynastyId?:string;
  }):Promise<{dynastyId:string;childId:string;childName:string;childGender:DynastyGender;motherName:string;fatherName:string}>{
    return withTransaction(async(client)=>{
      await activeCountry(client,input.guildId,input.countryId);
      const dynasty=await dynastyForContext(client,input.guildId,input.countryId,input.dynastyId,true);
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
           dynasty_id,name,gender,age,title,relation,succession_rank,mother_id,father_id,born_turn,trait_key
         ) VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [dynasty.id,childName,pending.gender,pending.gender==="MALE"?"Prens":"Prenses",
          pending.child_relation,rank,pending.mother_id,pending.father_id,pending.game_turn,rollNobleTraitKey()]
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

  async pendingBirthContext(guildId:string,pendingBirthId:string):Promise<{countryId:string;dynastyId:string}|null>{
    const row=(await pool.query<{country_id:string;dynasty_id:string}>(
      `SELECT dynasty.country_id,session.dynasty_id
         FROM dynasty_birth_sessions session
         JOIN dynasties dynasty ON dynasty.id=session.dynasty_id
         JOIN countries country ON country.id=dynasty.country_id
        WHERE session.id=$1 AND dynasty.guild_id=$2 AND country.status='ACTIVE'
        LIMIT 1`,
      [pendingBirthId,guildId]
    )).rows[0];
    return row?{countryId:row.country_id,dynastyId:row.dynasty_id}:null;
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
    let npcBirths=0;
    let npcMarriages=0;
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
    try{
      const npc=await withTransaction((client)=>processNpcDynastyTurn(client,guildId,turn));
      if(npc){
        npcBirths=npc.births;
        npcMarriages=npc.marriages;
        events.push(...npc.events);
      }
    }catch(error){
      failures.push("NPC hanedan otomasyonu: "+(error instanceof Error?error.message:String(error)));
    }
    return{processed,events,deathChecks,failures,npcBirths,npcMarriages};
  }
};
