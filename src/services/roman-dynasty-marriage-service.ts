import {randomInt} from "node:crypto";
import {pool,withTransaction,type DbClient} from "../db/pool.js";
import {
  BIRTH_ATTEMPT_COOLDOWN_TURNS,MATERNAL_ILLNESS_COOLDOWN_TURNS,MINIMUM_MARRIAGE_AGE,
  birthAgeModifier,birthAttemptSucceeded,birthComplication,newbornGender,
  type BirthComplication,type DynastyGender
} from "../domain/dynasty.js";
import {GameError} from "./game-service.js";
import {rollNobleTraitKey} from "./noble-trait-service.js";
import {romanFamilyMembership} from "./roman-family-access.js";

export type RomanDynastyMarriageStatus="PENDING"|"ACCEPTED"|"REJECTED"|"CANCELLED";
export interface RomanDynastyMarriageProposalView{
  id:string;republic_id:string;proposer_family_id:string;roman_member_id:string;
  target_country_id:string;target_dynasty_id:string;dynasty_member_id:string;
  status:RomanDynastyMarriageStatus;created_turn:number;resolved_turn:number|null;
  created_by:string;resolved_by:string|null;public_channel_id:string|null;public_message_id:string|null;
  roman_country_name:string;proposer_family_name:string;roman_member_name:string;
  roman_country_id:string;
  target_country_name:string;target_dynasty_name:string;dynasty_member_name:string;
}

export interface CrossHouseBirthAttemptResult{
  success:boolean;resumed:boolean;attemptRoll:number;ageModifier:number;pendingBirthId:string|null;
  childGender:DynastyGender|null;genderRoll:number|null;complication:BirthComplication|null;
  complicationRoll:number|null;motherName:string;fatherName:string;
}

type HouseholdType="ROMAN_FAMILY"|"DYNASTY";
type CrossMember={
  id:string;name:string;gender:DynastyGender;age:number;status:"ALIVE"|"DEAD";health:"HEALTHY"|"SICK";
  sick_until_turn:number|null;kidnapped:boolean;spouse_id:string|null;external_spouse_id:string|null;
};

async function currentTurn(client:DbClient,guildId:string):Promise<number>{
  const row=(await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[guildId])).rows[0];
  if(!row)throw new GameError("Sunucu oyun kaydı bulunamadı.");
  return Number(row.current_turn);
}

async function proposal(client:DbClient,guildId:string,id:string,lock=false):Promise<RomanDynastyMarriageProposalView>{
  const row=(await client.query<RomanDynastyMarriageProposalView>(`
    SELECT proposal.*,republic.country_id AS roman_country_id,roman_country.name AS roman_country_name,family.name AS proposer_family_name,
           roman_member.name AS roman_member_name,target_country.name AS target_country_name,
           dynasty.name AS target_dynasty_name,dynasty_member.name AS dynasty_member_name
      FROM roman_dynasty_marriage_proposals proposal
      JOIN roman_republics republic ON republic.id=proposal.republic_id AND republic.guild_id=$2
      JOIN countries roman_country ON roman_country.id=republic.country_id
      JOIN roman_families family ON family.id=proposal.proposer_family_id
      JOIN roman_family_members roman_member ON roman_member.id=proposal.roman_member_id
      JOIN countries target_country ON target_country.id=proposal.target_country_id
      JOIN dynasties dynasty ON dynasty.id=proposal.target_dynasty_id
      JOIN dynasty_members dynasty_member ON dynasty_member.id=proposal.dynasty_member_id
     WHERE proposal.id=$1${lock?" FOR UPDATE OF proposal":""}`,[id,guildId])).rows[0];
  if(!row)throw new GameError("Roma–hanedan evlilik teklifi bulunamadı.");
  return row;
}

async function romanMember(client:DbClient,guildId:string,id:string,lock=false):Promise<CrossMember&{family_id:string;republic_id:string;country_id:string}>{
  const row=(await client.query<CrossMember&{family_id:string;republic_id:string;country_id:string}>(`
    SELECT member.id,member.name,member.gender,member.age,member.status,member.health,member.sick_until_turn,
           member.spouse_id,member.dynasty_spouse_id AS external_spouse_id,member.family_id,
           family.republic_id,republic.country_id,
           EXISTS(SELECT 1 FROM espionage_captivities captivity WHERE captivity.captive_type='ROMAN_FAMILY'
             AND captivity.captive_id=member.id AND captivity.status='HELD') AS kidnapped
      FROM roman_family_members member
      JOIN roman_families family ON family.id=member.family_id
      JOIN roman_republics republic ON republic.id=family.republic_id
     WHERE member.id=$1 AND republic.guild_id=$2${lock?" FOR UPDATE OF member":""}`,[id,guildId])).rows[0];
  if(!row)throw new GameError("Roma siyasi aile üyesi bulunamadı.");
  return{...row,age:Number(row.age)};
}

async function dynastyMember(client:DbClient,guildId:string,id:string,lock=false):Promise<CrossMember&{dynasty_id:string;country_id:string}>{
  const row=(await client.query<CrossMember&{dynasty_id:string;country_id:string}>(`
    SELECT member.id,member.name,member.gender,member.age,member.status,member.health,member.sick_until_turn,
           member.spouse_id,member.roman_spouse_id AS external_spouse_id,member.dynasty_id,dynasty.country_id,
           EXISTS(SELECT 1 FROM espionage_captivities captivity WHERE captivity.captive_type='DYNASTY'
             AND captivity.captive_id=member.id AND captivity.status='HELD') AS kidnapped
      FROM dynasty_members member JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
      JOIN countries country ON country.id=dynasty.country_id
     WHERE member.id=$1 AND dynasty.guild_id=$2 AND country.status='ACTIVE'${lock?" FOR UPDATE OF member":""}`,[id,guildId])).rows[0];
  if(!row)throw new GameError("Hanedan üyesi bulunamadı.");
  if(row.age===null)throw new GameError(row.name+" için yaş bilgisi bulunmuyor.");
  return{...row,age:Number(row.age)};
}

function marriageEligible(item:CrossMember):void{
  if(item.status!=="ALIVE")throw new GameError(item.name+" hayatta değil.");
  if(item.kidnapped)throw new GameError(item.name+" kaçırılmış durumda olduğu için evlendirilemez.");
  if(item.age<MINIMUM_MARRIAGE_AGE)throw new GameError(item.name+" henüz "+MINIMUM_MARRIAGE_AGE+" yaşını doldurmadı.");
  if(item.spouse_id||item.external_spouse_id)throw new GameError(item.name+" zaten evli.");
}

async function requireRomanLeader(client:DbClient,republicId:string,familyId:string,userId:string,gameMaster:boolean):Promise<void>{
  if(gameMaster)return;
  const membership=await romanFamilyMembership(client,republicId,userId);
  if(!membership||membership.familyId!==familyId)throw new GameError("Bu Roma siyasi ailesine atanmış değilsiniz.");
  if(!membership.isLeader)throw new GameError("Bu işlemi yalnızca siyasi aile lideri yapabilir.");
}

function householdFor(roman:CrossMember,dynasty:CrossMember):HouseholdType{
  if(roman.gender==="MALE"&&dynasty.gender==="FEMALE")return"ROMAN_FAMILY";
  if(dynasty.gender==="MALE"&&roman.gender==="FEMALE")return"DYNASTY";
  return"ROMAN_FAMILY";
}

async function activeMarriage(client:DbClient,guildId:string,side:"ROMAN_FAMILY"|"DYNASTY",memberId:string,lock=false){
  return (await client.query<{
    id:string;republic_id:string;family_id:string;roman_member_id:string;dynasty_id:string;dynasty_member_id:string;
    household_type:HouseholdType;roman_country_id:string;dynasty_country_id:string;
  }>(`
    SELECT marriage.*,republic.country_id AS roman_country_id,dynasty.country_id AS dynasty_country_id
      FROM roman_dynasty_marriages marriage
      JOIN roman_republics republic ON republic.id=marriage.republic_id AND republic.guild_id=$1
      JOIN dynasties dynasty ON dynasty.id=marriage.dynasty_id AND dynasty.guild_id=$1
     WHERE ${side==="ROMAN_FAMILY"?"marriage.roman_member_id":"marriage.dynasty_member_id"}=$2
       AND (marriage.status='ACTIVE' OR EXISTS(
         SELECT 1 FROM roman_dynasty_birth_sessions session
          WHERE session.marriage_id=marriage.id AND session.status='PENDING_NAME'
       ))
     ${lock?"FOR UPDATE OF marriage":""}`,[guildId,memberId])).rows[0]??null;
}

async function attemptBirth(input:{
  guildId:string;actorId:string;side:"ROMAN_FAMILY"|"DYNASTY";memberId:string;gameMaster?:boolean;expectedDynastyId?:string;
}):Promise<CrossHouseBirthAttemptResult|null>{
  return withTransaction(async(client)=>{
    const marriage=await activeMarriage(client,input.guildId,input.side,input.memberId,true);
    if(!marriage)return null;
    if(input.expectedDynastyId&&marriage.dynasty_id!==input.expectedDynastyId)
      throw new GameError("Seçilen üye yönettiğiniz hanedana ait değil.");
    if(marriage.household_type!==input.side)
      throw new GameError("Bu evlilikte çocuk babanın hanesine kaydolur. Çocuk denemesini "+
        (marriage.household_type==="ROMAN_FAMILY"?"Roma ailesi":"devlet hanedanı")+" üzerinden yapın.");
    const roman=await romanMember(client,input.guildId,marriage.roman_member_id,true);
    const dynasty=await dynastyMember(client,input.guildId,marriage.dynasty_member_id,true);
    if(input.side==="ROMAN_FAMILY")await requireRomanLeader(client,roman.republic_id,roman.family_id,input.actorId,Boolean(input.gameMaster));
    const pending=(await client.query<{
      id:string;attempt_roll:number;age_modifier:number;gender:DynastyGender;gender_roll:number;
      complication:BirthComplication;complication_roll:number;
    }>(`SELECT id,attempt_roll,age_modifier,gender,gender_roll,complication,complication_roll
          FROM roman_dynasty_birth_sessions WHERE marriage_id=$1 AND status='PENDING_NAME'
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[marriage.id])).rows[0];
    const mother=roman.gender==="FEMALE"?roman:dynasty.gender==="FEMALE"?dynasty:null;
    const father=roman.gender==="MALE"?roman:dynasty.gender==="MALE"?dynasty:null;
    if(!mother||!father)throw new GameError("Mevcut doğum sistemi için yaşayan bir anne ve baba kaydı gerekir.");
    if(pending)return{
      success:true,resumed:true,attemptRoll:Number(pending.attempt_roll),ageModifier:Number(pending.age_modifier),
      pendingBirthId:pending.id,childGender:pending.gender,genderRoll:Number(pending.gender_roll),
      complication:pending.complication,complicationRoll:Number(pending.complication_roll),motherName:mother.name,fatherName:father.name
    };
    if(roman.status!=="ALIVE"||dynasty.status!=="ALIVE"||roman.external_spouse_id!==dynasty.id||dynasty.external_spouse_id!==roman.id)
      throw new GameError("Çiftin karşılıklı ve yaşayan evlilik kaydı bulunamadı.");
    if(roman.kidnapped||dynasty.kidnapped)throw new GameError("Kaçırılmış bir aile veya hanedan üyesi çocuk denemesi yapamaz.");
    const turn=await currentTurn(client,input.guildId);
    if(mother.health==="SICK"&&(mother.sick_until_turn===null||turn<=mother.sick_until_turn))
      throw new GameError(mother.name+" hasta olduğu için yeni gebelik deneyemez.");
    const modifier=birthAgeModifier(mother.age);
    if(modifier===null)throw new GameError("Doğum yapacak eş 18-44 yaş aralığında olmalıdır.");
    const prior=(await client.query<{last_attempt_turn:number}>(
      "SELECT last_attempt_turn FROM roman_dynasty_birth_attempts WHERE marriage_id=$1 FOR UPDATE",[marriage.id]
    )).rows[0];
    if(prior&&turn-Number(prior.last_attempt_turn)<BIRTH_ATTEMPT_COOLDOWN_TURNS)
      throw new GameError("Bu çift için yeni çocuk denemesi Tur "+(Number(prior.last_attempt_turn)+BIRTH_ATTEMPT_COOLDOWN_TURNS)+" itibarıyla yapılabilir.");
    await client.query(`INSERT INTO roman_dynasty_birth_attempts(marriage_id,last_attempt_turn) VALUES($1,$2)
      ON CONFLICT(marriage_id) DO UPDATE SET last_attempt_turn=EXCLUDED.last_attempt_turn,updated_at=NOW()`,[marriage.id,turn]);
    const attemptRoll=randomInt(1,21);
    if(!birthAttemptSucceeded(mother.age,attemptRoll))return{
      success:false,resumed:false,attemptRoll,ageModifier:modifier,pendingBirthId:null,childGender:null,genderRoll:null,
      complication:null,complicationRoll:null,motherName:mother.name,fatherName:father.name
    };
    const genderRoll=randomInt(1,3);
    const childGender=newbornGender(genderRoll);
    const complicationRoll=randomInt(1,21);
    const complication=birthComplication(complicationRoll);
    const childRelation=marriage.household_type==="ROMAN_FAMILY"
      ?(childGender==="MALE"?"Aile üyesinin oğlu":"Aile üyesinin kızı")
      :"Hanedan üyesinin çocuğu";
    const session=(await client.query<{id:string}>(`INSERT INTO roman_dynasty_birth_sessions(
        marriage_id,household_type,family_id,dynasty_id,initiated_by,roman_member_id,dynasty_member_id,mother_system,
        game_turn,attempt_roll,age_modifier,gender_roll,gender,complication_roll,complication,child_relation
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,[
      marriage.id,marriage.household_type,marriage.household_type==="ROMAN_FAMILY"?marriage.family_id:null,
      marriage.household_type==="DYNASTY"?marriage.dynasty_id:null,input.actorId,roman.id,dynasty.id,
      roman.gender==="FEMALE"?"ROMAN_FAMILY":"DYNASTY",turn,attemptRoll,modifier,genderRoll,childGender,
      complicationRoll,complication,childRelation
    ])).rows[0]!;
    if(complication==="ILLNESS")await client.query(
      mother.id===roman.id
        ?"UPDATE roman_family_members SET health='SICK',sick_until_turn=$2,updated_at=NOW() WHERE id=$1"
        :"UPDATE dynasty_members SET health='SICK',sick_until_turn=$2,updated_at=NOW() WHERE id=$1",
      [mother.id,turn+MATERNAL_ILLNESS_COOLDOWN_TURNS]
    );
    if(complication==="DEATH"){
      await client.query(
        mother.id===roman.id
          ?"UPDATE roman_family_members SET status='DEAD',health='HEALTHY',sick_until_turn=NULL,died_turn=$2,death_reason='Doğum komplikasyonu',dynasty_spouse_id=NULL,updated_at=NOW() WHERE id=$1"
          :"UPDATE dynasty_members SET status='DEAD',health='HEALTHY',sick_until_turn=NULL,died_turn=$2,death_reason='Doğum komplikasyonu',roman_spouse_id=NULL,updated_at=NOW() WHERE id=$1",
        [mother.id,turn]
      );
      await client.query(
        mother.id===roman.id
          ?"UPDATE dynasty_members SET roman_spouse_id=NULL,updated_at=NOW() WHERE id=$1"
          :"UPDATE roman_family_members SET dynasty_spouse_id=NULL,updated_at=NOW() WHERE id=$1",
        [mother.id===roman.id?dynasty.id:roman.id]
      );
      await client.query("UPDATE roman_dynasty_marriages SET status='ENDED',ended_turn=$2,ended_reason='Doğum komplikasyonu',ended_at=NOW() WHERE id=$1",[marriage.id,turn]);
    }
    return{success:true,resumed:false,attemptRoll,ageModifier:modifier,pendingBirthId:session.id,childGender,genderRoll,
      complication,complicationRoll,motherName:mother.name,fatherName:father.name};
  });
}

export const romanDynastyMarriageService={
  async propose(input:{guildId:string;countryId:string;actorId:string;romanMemberId:string;targetCountryId:string;dynastyMemberId:string;gameMaster:boolean}){
    return withTransaction(async(client)=>{
      const rep=(await client.query<{id:string;current_turn:number}>(`
        SELECT republic.id,guild.current_turn FROM roman_republics republic
        JOIN guilds guild ON guild.discord_id=republic.guild_id
        WHERE republic.guild_id=$1 AND republic.country_id=$2 AND republic.status='ACTIVE' FOR UPDATE OF republic`,
      [input.guildId,input.countryId])).rows[0];
      if(!rep)throw new GameError("Bu devlet için Roma Cumhuriyeti sistemi kurulmamış.");
      const roman=await romanMember(client,input.guildId,input.romanMemberId,true);
      const dynasty=await dynastyMember(client,input.guildId,input.dynastyMemberId,true);
      if(roman.republic_id!==rep.id)throw new GameError("Seçilen Roma üyesi bu cumhuriyete ait değil.");
      if(dynasty.country_id!==input.targetCountryId)throw new GameError("Seçilen hanedan üyesi hedef devlete ait değil.");
      await requireRomanLeader(client,rep.id,roman.family_id,input.actorId,input.gameMaster);
      marriageEligible(roman);marriageEligible(dynasty);
      const conflicting=await client.query(`
        SELECT 1 FROM roman_family_marriage_proposals WHERE status='PENDING'
          AND (proposer_member_id=$1 OR target_member_id=$1)
        UNION ALL SELECT 1 FROM dynasty_marriage_proposals WHERE status='PENDING'
          AND (proposer_member_id=$2 OR target_member_id=$2)
        UNION ALL SELECT 1 FROM roman_dynasty_marriage_proposals WHERE status='PENDING'
          AND (roman_member_id=$1 OR dynasty_member_id=$2) LIMIT 1`,[roman.id,dynasty.id]);
      if(conflicting.rowCount)throw new GameError("Seçilen üyelerden biri için zaten bekleyen bir evlilik teklifi bulunuyor.");
      const created=(await client.query<{id:string}>(`INSERT INTO roman_dynasty_marriage_proposals(
        republic_id,proposer_family_id,roman_member_id,target_country_id,target_dynasty_id,dynasty_member_id,created_turn,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[
        rep.id,roman.family_id,roman.id,input.targetCountryId,dynasty.dynasty_id,dynasty.id,Number(rep.current_turn),input.actorId
      ])).rows[0]!;
      return proposal(client,input.guildId,created.id);
    });
  },

  async proposalById(guildId:string,id:string){return withTransaction((client)=>proposal(client,guildId,id));},

  async proposalByIdOrNull(guildId:string,id:string):Promise<RomanDynastyMarriageProposalView|null>{
    try{return await withTransaction((client)=>proposal(client,guildId,id));}catch(error){
      if(error instanceof GameError&&error.message==="Roma–hanedan evlilik teklifi bulunamadı.")return null;
      throw error;
    }
  },

  async setProposalMessage(input:{guildId:string;proposalId:string;channelId:string;messageId:string}){
    const result=await pool.query(`UPDATE roman_dynasty_marriage_proposals proposal
      SET public_channel_id=$1,public_message_id=$2 FROM roman_republics republic
      WHERE proposal.id=$3 AND proposal.republic_id=republic.id AND republic.guild_id=$4`,
    [input.channelId,input.messageId,input.proposalId,input.guildId]);
    if(!result.rowCount)throw new GameError("Roma–hanedan evlilik teklifi bulunamadı.");
  },

  async listForRomanFamily(guildId:string,republicId:string,familyId:string){
    return (await pool.query<RomanDynastyMarriageProposalView>(`
      SELECT proposal.*,republic.country_id AS roman_country_id,roman_country.name AS roman_country_name,family.name AS proposer_family_name,
             roman_member.name AS roman_member_name,target_country.name AS target_country_name,
             dynasty.name AS target_dynasty_name,dynasty_member.name AS dynasty_member_name
        FROM roman_dynasty_marriage_proposals proposal
        JOIN roman_republics republic ON republic.id=proposal.republic_id AND republic.guild_id=$1
        JOIN countries roman_country ON roman_country.id=republic.country_id
        JOIN roman_families family ON family.id=proposal.proposer_family_id
        JOIN roman_family_members roman_member ON roman_member.id=proposal.roman_member_id
        JOIN countries target_country ON target_country.id=proposal.target_country_id
        JOIN dynasties dynasty ON dynasty.id=proposal.target_dynasty_id
        JOIN dynasty_members dynasty_member ON dynasty_member.id=proposal.dynasty_member_id
       WHERE proposal.republic_id=$2 AND proposal.proposer_family_id=$3 AND proposal.status='PENDING'
       ORDER BY proposal.created_at DESC LIMIT 25`,[guildId,republicId,familyId])).rows;
  },

  async listForDynasty(guildId:string,dynastyId:string){
    return (await pool.query<RomanDynastyMarriageProposalView>(`
      SELECT proposal.*,republic.country_id AS roman_country_id,roman_country.name AS roman_country_name,family.name AS proposer_family_name,
             roman_member.name AS roman_member_name,target_country.name AS target_country_name,
             dynasty.name AS target_dynasty_name,dynasty_member.name AS dynasty_member_name
        FROM roman_dynasty_marriage_proposals proposal
        JOIN roman_republics republic ON republic.id=proposal.republic_id AND republic.guild_id=$1
        JOIN countries roman_country ON roman_country.id=republic.country_id
        JOIN roman_families family ON family.id=proposal.proposer_family_id
        JOIN roman_family_members roman_member ON roman_member.id=proposal.roman_member_id
        JOIN countries target_country ON target_country.id=proposal.target_country_id
        JOIN dynasties dynasty ON dynasty.id=proposal.target_dynasty_id
        JOIN dynasty_members dynasty_member ON dynasty_member.id=proposal.dynasty_member_id
       WHERE proposal.target_dynasty_id=$2 AND proposal.status='PENDING'
       ORDER BY proposal.created_at DESC LIMIT 25`,[guildId,dynastyId])).rows;
  },

  async respond(input:{guildId:string;proposalId:string;targetDynastyId:string;actorId:string;decision:"ACCEPT"|"REJECT"}){
    return withTransaction(async(client)=>{
      const item=await proposal(client,input.guildId,input.proposalId,true);
      if(item.status!=="PENDING"||item.target_dynasty_id!==input.targetDynastyId)throw new GameError("Bekleyen evlilik teklifi bulunamadı.");
      const turn=await currentTurn(client,input.guildId);
      if(input.decision==="REJECT"){
        await client.query("UPDATE roman_dynasty_marriage_proposals SET status='REJECTED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW() WHERE id=$3",[turn,input.actorId,item.id]);
        return{...item,status:"REJECTED" as const,resolved_turn:turn,resolved_by:input.actorId};
      }
      const roman=await romanMember(client,input.guildId,item.roman_member_id,true);
      const dynasty=await dynastyMember(client,input.guildId,item.dynasty_member_id,true);
      marriageEligible(roman);marriageEligible(dynasty);
      await client.query("UPDATE roman_family_members SET dynasty_spouse_id=$1,updated_at=NOW() WHERE id=$2",[dynasty.id,roman.id]);
      await client.query("UPDATE dynasty_members SET roman_spouse_id=$1,updated_at=NOW() WHERE id=$2",[roman.id,dynasty.id]);
      await client.query(`INSERT INTO roman_dynasty_marriages(
        republic_id,family_id,roman_member_id,dynasty_id,dynasty_member_id,household_type,married_turn,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[
        item.republic_id,item.proposer_family_id,roman.id,item.target_dynasty_id,dynasty.id,householdFor(roman,dynasty),turn,input.actorId
      ]);
      await client.query("UPDATE roman_dynasty_marriage_proposals SET status='ACCEPTED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW() WHERE id=$3",[turn,input.actorId,item.id]);
      await client.query(`UPDATE roman_family_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
        WHERE status='PENDING' AND (proposer_member_id=$3 OR target_member_id=$3)`,[turn,input.actorId,roman.id]);
      await client.query(`UPDATE dynasty_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
        WHERE status='PENDING' AND (proposer_member_id=$3 OR target_member_id=$3)`,[turn,input.actorId,dynasty.id]);
      return{...item,status:"ACCEPTED" as const,resolved_turn:turn,resolved_by:input.actorId};
    });
  },

  async withdraw(input:{guildId:string;proposalId:string;familyId:string;actorId:string;gameMaster:boolean}){
    return withTransaction(async(client)=>{
      const item=await proposal(client,input.guildId,input.proposalId,true);
      if(item.status!=="PENDING"||item.proposer_family_id!==input.familyId)throw new GameError("Bekleyen evlilik teklifi bulunamadı.");
      await requireRomanLeader(client,item.republic_id,item.proposer_family_id,input.actorId,input.gameMaster);
      const turn=await currentTurn(client,input.guildId);
      await client.query("UPDATE roman_dynasty_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW() WHERE id=$3",[turn,input.actorId,item.id]);
      return{...item,status:"CANCELLED" as const,resolved_turn:turn,resolved_by:input.actorId};
    });
  },

  attemptRomanBirth(input:{guildId:string;actorId:string;romanMemberId:string;gameMaster:boolean}){
    return attemptBirth({guildId:input.guildId,actorId:input.actorId,side:"ROMAN_FAMILY",memberId:input.romanMemberId,gameMaster:input.gameMaster});
  },
  attemptDynastyBirth(input:{guildId:string;actorId:string;dynastyMemberId:string;dynastyId:string}){
    return attemptBirth({guildId:input.guildId,actorId:input.actorId,side:"DYNASTY",memberId:input.dynastyMemberId,expectedDynastyId:input.dynastyId});
  },

  async pendingBirthContext(guildId:string,sessionId:string){
    const row=(await pool.query<{
      household_type:HouseholdType;family_id:string|null;dynasty_id:string|null;roman_country_id:string;dynasty_country_id:string;
    }>(`SELECT session.household_type,session.family_id,session.dynasty_id,
              republic.country_id AS roman_country_id,dynasty.country_id AS dynasty_country_id
         FROM roman_dynasty_birth_sessions session
         JOIN roman_dynasty_marriages marriage ON marriage.id=session.marriage_id
         JOIN roman_republics republic ON republic.id=marriage.republic_id AND republic.guild_id=$2
         JOIN dynasties dynasty ON dynasty.id=marriage.dynasty_id
        WHERE session.id=$1`,[sessionId,guildId])).rows[0];
    return row??null;
  },

  async nameBirth(input:{guildId:string;sessionId:string;actorId:string;childName:string;allowManager?:boolean}){
    return withTransaction(async(client)=>{
      const session=(await client.query<{
        id:string;household_type:HouseholdType;family_id:string|null;dynasty_id:string|null;initiated_by:string;
        roman_member_id:string;dynasty_member_id:string;mother_system:HouseholdType;game_turn:number;
        gender:DynastyGender;child_relation:string;status:string;roman_name:string;dynasty_name:string;
      }>(`SELECT session.*,roman.name AS roman_name,dynasty_member.name AS dynasty_name
            FROM roman_dynasty_birth_sessions session
            JOIN roman_dynasty_marriages marriage ON marriage.id=session.marriage_id
            JOIN roman_republics republic ON republic.id=marriage.republic_id AND republic.guild_id=$2
            JOIN roman_family_members roman ON roman.id=session.roman_member_id
            JOIN dynasty_members dynasty_member ON dynasty_member.id=session.dynasty_member_id
           WHERE session.id=$1 FOR UPDATE OF session`,[input.sessionId,input.guildId])).rows[0];
      if(!session||session.status!=="PENDING_NAME")throw new GameError("Adlandırılmayı bekleyen karma hane doğumu bulunamadı.");
      if(session.household_type==="ROMAN_FAMILY"){
        const roman=await romanMember(client,input.guildId,session.roman_member_id);
        await requireRomanLeader(client,roman.republic_id,session.family_id!,input.actorId,Boolean(input.allowManager));
      }else if(session.initiated_by!==input.actorId&&!input.allowManager)
        throw new GameError("Bu çocuğa yalnızca doğum zarını atan oyuncu veya oyun yöneticisi isim verebilir.");
      const name=input.childName.trim().replace(/\s+/g," ");
      if(name.length<2||name.length>80)throw new GameError("Çocuk adı 2-80 karakter arasında olmalıdır.");
      let childId:string;
      if(session.household_type==="ROMAN_FAMILY"){
        if(!session.family_id)throw new GameError("Çocuğun Roma ailesi kaydı eksik.");
        const duplicate=await client.query("SELECT 1 FROM roman_family_members WHERE family_id=$1 AND lower(name)=lower($2)",[session.family_id,name]);
        if(duplicate.rowCount)throw new GameError("Bu siyasi ailede aynı adlı bir üye zaten bulunuyor.");
        const order=Number((await client.query<{value:number}>("SELECT COALESCE(MAX(sort_order),0)+1 AS value FROM roman_family_members WHERE family_id=$1",[session.family_id])).rows[0]?.value??1);
        childId=(await client.query<{id:string}>(`INSERT INTO roman_family_members(
          family_id,birth_family_id,name,gender,age,position,relation,mother_id,father_id,dynasty_mother_id,dynasty_father_id,born_turn,sort_order
        ) VALUES($1,$1,$2,$3,0,'CHILD',$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[
          session.family_id,name,session.gender,session.child_relation,
          session.mother_system==="ROMAN_FAMILY"?session.roman_member_id:null,
          session.mother_system!=="ROMAN_FAMILY"?session.roman_member_id:null,
          session.mother_system==="DYNASTY"?session.dynasty_member_id:null,
          session.mother_system!=="DYNASTY"?session.dynasty_member_id:null,
          session.game_turn,order
        ])).rows[0]!.id;
        await client.query("UPDATE roman_dynasty_birth_sessions SET status='COMPLETED',roman_child_id=$1,completed_at=NOW() WHERE id=$2",[childId,session.id]);
      }else{
        if(!session.dynasty_id)throw new GameError("Çocuğun hanedan kaydı eksik.");
        const duplicate=await client.query("SELECT 1 FROM dynasty_members WHERE dynasty_id=$1 AND lower(name)=lower($2)",[session.dynasty_id,name]);
        if(duplicate.rowCount)throw new GameError("Hanedanda aynı adlı bir üye zaten bulunuyor.");
        const rank=Number((await client.query<{value:number}>("SELECT COALESCE(MAX(succession_rank),0)+1 AS value FROM dynasty_members WHERE dynasty_id=$1",[session.dynasty_id])).rows[0]?.value??1);
        childId=(await client.query<{id:string}>(`INSERT INTO dynasty_members(
          dynasty_id,name,gender,age,title,relation,succession_rank,mother_id,father_id,roman_mother_id,roman_father_id,born_turn,trait_key
        ) VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[
          session.dynasty_id,name,session.gender,session.gender==="MALE"?"Prens":"Prenses",session.child_relation,rank,
          session.mother_system==="DYNASTY"?session.dynasty_member_id:null,
          session.mother_system!=="DYNASTY"?session.dynasty_member_id:null,
          session.mother_system==="ROMAN_FAMILY"?session.roman_member_id:null,
          session.mother_system!=="ROMAN_FAMILY"?session.roman_member_id:null,
          session.game_turn,rollNobleTraitKey()
        ])).rows[0]!.id;
        await client.query("UPDATE roman_dynasty_birth_sessions SET status='COMPLETED',dynasty_child_id=$1,completed_at=NOW() WHERE id=$2",[childId,session.id]);
      }
      return{
        householdType:session.household_type,childId,childName:name,childGender:session.gender,
        motherName:session.mother_system==="ROMAN_FAMILY"?session.roman_name:session.dynasty_name,
        fatherName:session.mother_system==="ROMAN_FAMILY"?session.dynasty_name:session.roman_name,
        familyId:session.family_id,dynastyId:session.dynasty_id
      };
    });
  }
};
