import {randomInt} from "node:crypto";
import {pool,withTransaction,type DbClient} from "../db/pool.js";
import {
  BIRTH_ATTEMPT_COOLDOWN_TURNS,MATERNAL_ILLNESS_COOLDOWN_TURNS,MINIMUM_MARRIAGE_AGE,
  birthAgeModifier,birthAttemptSucceeded,birthComplication,newbornGender,orderedDynastyCoupleIds,
  type BirthComplication,type DynastyGender
} from "../domain/dynasty.js";
import {GameError} from "./game-service.js";
import {romanFamilyMembership} from "./roman-family-access.js";

export type RomanFamilyMarriageStatus="PENDING"|"ACCEPTED"|"REJECTED"|"CANCELLED";

export interface RomanFamilyMarriageProposalView{
  id:string;republic_id:string;country_id:string;proposer_family_id:string;target_family_id:string;
  proposer_member_id:string;target_member_id:string;status:RomanFamilyMarriageStatus;
  created_turn:number;resolved_turn:number|null;created_by:string;resolved_by:string|null;
  public_channel_id:string|null;public_message_id:string|null;
  proposer_family_name:string;target_family_name:string;proposer_member_name:string;target_member_name:string;
}

export interface RomanFamilyBirthAttemptResult{
  success:boolean;attemptRoll:number;ageModifier:number;pendingBirthId:string|null;
  childGender:DynastyGender|null;genderRoll:number|null;complication:BirthComplication|null;
  complicationRoll:number|null;motherName:string;fatherName:string;
}

interface RepublicRow{id:string;country_id:string;current_turn:number}
interface FamilyMemberRow{
  id:string;family_id:string;family_name:string;name:string;gender:DynastyGender;age:number;
  position:string;relation:string;spouse_id:string|null;status:"ALIVE"|"DEAD";
  health:"HEALTHY"|"SICK";sick_until_turn:number|null;
}

async function republic(client:DbClient,guildId:string,countryId:string,lock=false):Promise<RepublicRow>{
  const row=(await client.query<RepublicRow>(`
    SELECT republic.id,republic.country_id,guild.current_turn
      FROM roman_republics republic JOIN guilds guild ON guild.discord_id=republic.guild_id
     WHERE republic.guild_id=$1 AND republic.country_id=$2 AND republic.status='ACTIVE'
     ${lock?"FOR UPDATE OF republic":""}`,[guildId,countryId])).rows[0];
  if(!row)throw new GameError("Bu devlet için Roma Cumhuriyeti sistemi kurulmamış.");
  return row;
}

async function member(client:DbClient,republicId:string,value:string,lock=false):Promise<FamilyMemberRow>{
  const row=(await client.query<FamilyMemberRow>(`
    SELECT member.id,member.family_id,family.name AS family_name,member.name,member.gender,member.age,
           member.position,member.relation,member.spouse_id,member.status,member.health,member.sick_until_turn
      FROM roman_family_members member JOIN roman_families family ON family.id=member.family_id
     WHERE family.republic_id=$1 AND family.status='ACTIVE'
       AND (member.id::text=$2 OR lower(member.name)=lower($2))
     LIMIT 1 ${lock?"FOR UPDATE OF member":""}`,[republicId,value.trim()])).rows[0];
  if(!row)throw new GameError("Roma siyasi aile üyesi bulunamadı.");
  return{...row,age:Number(row.age)};
}

async function requireFamilyLeader(
  client:DbClient,republicId:string,familyId:string,userId:string,gameMaster:boolean
):Promise<void>{
  if(gameMaster)return;
  const membership=await romanFamilyMembership(client,republicId,userId);
  if(!membership||membership.familyId!==familyId)throw new GameError("Bu Roma siyasi ailesine atanmış değilsiniz.");
  if(!membership.isLeader)throw new GameError("Bu işlemi yalnızca siyasi aile lideri yapabilir.");
}

function requireMarriageEligibility(item:FamilyMemberRow):void{
  if(item.status!=="ALIVE")throw new GameError(item.name+" hayatta değil.");
  if(item.age<MINIMUM_MARRIAGE_AGE)throw new GameError(item.name+" henüz "+MINIMUM_MARRIAGE_AGE+" yaşını doldurmadı.");
  if(item.spouse_id)throw new GameError(item.name+" zaten evli.");
}

async function loadProposal(
  client:DbClient,guildId:string,proposalId:string,lock=false
):Promise<RomanFamilyMarriageProposalView>{
  const row=(await client.query<RomanFamilyMarriageProposalView>(`
    SELECT proposal.*,republic.country_id,proposer_family.name AS proposer_family_name,target_family.name AS target_family_name,
           proposer_member.name AS proposer_member_name,target_member.name AS target_member_name
      FROM roman_family_marriage_proposals proposal
      JOIN roman_republics republic ON republic.id=proposal.republic_id
      JOIN roman_families proposer_family ON proposer_family.id=proposal.proposer_family_id
      JOIN roman_families target_family ON target_family.id=proposal.target_family_id
      JOIN roman_family_members proposer_member ON proposer_member.id=proposal.proposer_member_id
      JOIN roman_family_members target_member ON target_member.id=proposal.target_member_id
     WHERE proposal.id=$1 AND republic.guild_id=$2 ${lock?"FOR UPDATE OF proposal":""}`,
    [proposalId,guildId]
  )).rows[0];
  if(!row)throw new GameError("Roma aile evliliği teklifi bulunamadı.");
  return row;
}

async function addEvent(
  client:DbClient,republicId:string,turn:number,eventType:string,familyId:string,actorId:string,details:unknown
):Promise<void>{
  await client.query(
    `INSERT INTO roman_republic_events(republic_id,game_turn,event_type,actor_user_id,family_id,details)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [republicId,turn,eventType,actorId,familyId,JSON.stringify(details)]
  );
}

export const romanFamilyLifeService={
  async listProposals(guildId:string,countryId:string,userId:string,gameMaster:boolean):Promise<RomanFamilyMarriageProposalView[]>{
    const rep=await withTransaction((client)=>republic(client,guildId,countryId));
    let familyId:string|null=null;
    if(!gameMaster){
      familyId=(await withTransaction((client)=>romanFamilyMembership(client,rep.id,userId)))?.familyId??null;
      if(!familyId)throw new GameError("Bir Roma siyasi ailesine atanmış değilsiniz.");
    }
    return (await pool.query<RomanFamilyMarriageProposalView>(`
      SELECT proposal.*,republic.country_id,proposer_family.name AS proposer_family_name,target_family.name AS target_family_name,
             proposer_member.name AS proposer_member_name,target_member.name AS target_member_name
        FROM roman_family_marriage_proposals proposal
        JOIN roman_republics republic ON republic.id=proposal.republic_id
        JOIN roman_families proposer_family ON proposer_family.id=proposal.proposer_family_id
        JOIN roman_families target_family ON target_family.id=proposal.target_family_id
        JOIN roman_family_members proposer_member ON proposer_member.id=proposal.proposer_member_id
        JOIN roman_family_members target_member ON target_member.id=proposal.target_member_id
       WHERE proposal.republic_id=$1 AND proposal.status='PENDING'
         AND ($2::uuid IS NULL OR proposal.proposer_family_id=$2 OR proposal.target_family_id=$2)
       ORDER BY proposal.created_at DESC LIMIT 25`,[rep.id,familyId]
    )).rows;
  },

  async proposalById(guildId:string,proposalId:string):Promise<RomanFamilyMarriageProposalView>{
    return withTransaction((client)=>loadProposal(client,guildId,proposalId));
  },

  async setProposalMessage(input:{guildId:string;proposalId:string;channelId:string;messageId:string}):Promise<void>{
    const result=await pool.query(
      `UPDATE roman_family_marriage_proposals proposal
          SET public_channel_id=$1,public_message_id=$2
         FROM roman_republics republic
        WHERE proposal.id=$3 AND proposal.republic_id=republic.id AND republic.guild_id=$4`,
      [input.channelId,input.messageId,input.proposalId,input.guildId]
    );
    if(!result.rowCount)throw new GameError("Roma aile evliliği teklifi bulunamadı.");
  },

  async proposeMarriage(input:{
    guildId:string;countryId:string;actorId:string;proposerMember:string;targetMember:string;gameMaster:boolean;
  }):Promise<RomanFamilyMarriageProposalView>{
    return withTransaction(async(client)=>{
      const rep=await republic(client,input.guildId,input.countryId,true);
      const proposer=await member(client,rep.id,input.proposerMember,true);
      const target=await member(client,rep.id,input.targetMember,true);
      if(proposer.family_id===target.family_id)throw new GameError("Roma aile evliliği teklifi iki farklı siyasi aile arasında yapılmalıdır.");
      await requireFamilyLeader(client,rep.id,proposer.family_id,input.actorId,input.gameMaster);
      requireMarriageEligibility(proposer);requireMarriageEligibility(target);
      const pending=await client.query(
        `SELECT 1 FROM roman_family_marriage_proposals WHERE status='PENDING'
          AND (proposer_member_id=ANY($1::uuid[]) OR target_member_id=ANY($1::uuid[])) LIMIT 1`,
        [[proposer.id,target.id]]
      );
      if(pending.rowCount)throw new GameError("Seçilen üyelerden biri için zaten bekleyen bir evlilik teklifi bulunuyor.");
      const created=(await client.query<{id:string}>(
        `INSERT INTO roman_family_marriage_proposals(
           republic_id,proposer_family_id,target_family_id,proposer_member_id,target_member_id,created_turn,created_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [rep.id,proposer.family_id,target.family_id,proposer.id,target.id,rep.current_turn,input.actorId]
      )).rows[0]!;
      await addEvent(client,rep.id,rep.current_turn,"FAMILY_MARRIAGE_PROPOSED",proposer.family_id,input.actorId,{
        proposalId:created.id,proposerMemberName:proposer.name,targetMemberName:target.name,targetFamilyName:target.family_name
      });
      return loadProposal(client,input.guildId,created.id);
    });
  },

  async respondMarriage(input:{
    guildId:string;countryId:string;actorId:string;proposalId:string;decision:"ACCEPT"|"REJECT";gameMaster:boolean;
  }):Promise<RomanFamilyMarriageProposalView>{
    return withTransaction(async(client)=>{
      const rep=await republic(client,input.guildId,input.countryId,true);
      const proposal=await loadProposal(client,input.guildId,input.proposalId,true);
      if(proposal.republic_id!==rep.id)throw new GameError("Bu teklif seçilen Roma Cumhuriyetine ait değil.");
      if(proposal.status!=="PENDING")throw new GameError("Bu evlilik teklifi artık beklemede değil.");
      await requireFamilyLeader(client,rep.id,proposal.target_family_id,input.actorId,input.gameMaster);
      if(input.decision==="REJECT"){
        await client.query(
          `UPDATE roman_family_marriage_proposals SET status='REJECTED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
            WHERE id=$3`,[rep.current_turn,input.actorId,proposal.id]
        );
        await addEvent(client,rep.id,rep.current_turn,"FAMILY_MARRIAGE_REJECTED",proposal.target_family_id,input.actorId,{proposalId:proposal.id});
        return{...proposal,status:"REJECTED",resolved_turn:rep.current_turn,resolved_by:input.actorId};
      }
      const proposer=await member(client,rep.id,proposal.proposer_member_id,true);
      const target=await member(client,rep.id,proposal.target_member_id,true);
      requireMarriageEligibility(proposer);requireMarriageEligibility(target);
      const woman=proposer.gender==="FEMALE"&&target.gender==="MALE"?proposer:target.gender==="FEMALE"&&proposer.gender==="MALE"?target:null;
      const husband=woman?.id===proposer.id?target:woman?.id===target.id?proposer:null;
      if(woman?.position==="HEAD")throw new GameError("Aile yöneticisi olan kadın başka bir siyasi aileye gelin gidemez.");
      await client.query("UPDATE roman_family_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2",[target.id,proposer.id]);
      await client.query("UPDATE roman_family_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2",[proposer.id,target.id]);
      if(woman&&husband&&woman.family_id!==husband.family_id){
        await client.query(
          `UPDATE roman_family_members
              SET birth_family_id=COALESCE(birth_family_id,family_id),family_id=$1,position='SPOUSE',
                  relation='Evlilik yoluyla siyasi aileye katıldı',sort_order=(
                    SELECT COALESCE(MAX(sort_order),0)+1 FROM roman_family_members WHERE family_id=$1
                  ),updated_at=NOW()
            WHERE id=$2`,[husband.family_id,woman.id]
        );
      }
      await client.query(
        `UPDATE roman_family_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
          WHERE status='PENDING' AND id<>$3
            AND (proposer_member_id=ANY($4::uuid[]) OR target_member_id=ANY($4::uuid[]))`,
        [rep.current_turn,input.actorId,proposal.id,[proposer.id,target.id]]
      );
      await client.query(
        `UPDATE roman_family_marriage_proposals SET status='ACCEPTED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
          WHERE id=$3`,[rep.current_turn,input.actorId,proposal.id]
      );
      await addEvent(client,rep.id,rep.current_turn,"FAMILY_MARRIAGE",husband?.family_id??proposer.family_id,input.actorId,{
        proposalId:proposal.id,proposerMemberName:proposer.name,targetMemberName:target.name,
        womanJoinedHusbandsFamily:Boolean(woman&&husband&&woman.family_id!==husband.family_id)
      });
      return{...proposal,status:"ACCEPTED",resolved_turn:rep.current_turn,resolved_by:input.actorId};
    });
  },

  async withdrawMarriage(input:{guildId:string;countryId:string;actorId:string;proposalId:string;gameMaster:boolean}):Promise<RomanFamilyMarriageProposalView>{
    return withTransaction(async(client)=>{
      const rep=await republic(client,input.guildId,input.countryId,true);
      const proposal=await loadProposal(client,input.guildId,input.proposalId,true);
      if(proposal.republic_id!==rep.id||proposal.status!=="PENDING")throw new GameError("Bekleyen evlilik teklifi bulunamadı.");
      await requireFamilyLeader(client,rep.id,proposal.proposer_family_id,input.actorId,input.gameMaster);
      await client.query(
        `UPDATE roman_family_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
          WHERE id=$3`,[rep.current_turn,input.actorId,proposal.id]
      );
      await addEvent(client,rep.id,rep.current_turn,"FAMILY_MARRIAGE_WITHDRAWN",proposal.proposer_family_id,input.actorId,{proposalId:proposal.id});
      return{...proposal,status:"CANCELLED",resolved_turn:rep.current_turn,resolved_by:input.actorId};
    });
  },

  async attemptBirth(input:{
    guildId:string;countryId:string;actorId:string;parentMember:string;gameMaster:boolean;
  }):Promise<RomanFamilyBirthAttemptResult>{
    return withTransaction(async(client)=>{
      const rep=await republic(client,input.guildId,input.countryId,true);
      const parent=await member(client,rep.id,input.parentMember,true);
      await requireFamilyLeader(client,rep.id,parent.family_id,input.actorId,input.gameMaster);
      if(parent.status!=="ALIVE"||!parent.spouse_id)throw new GameError("Seçilen aile üyesinin yaşayan bir eşi bulunmalıdır.");
      const spouse=await member(client,rep.id,parent.spouse_id,true);
      if(spouse.status!=="ALIVE"||spouse.spouse_id!==parent.id)throw new GameError("Seçilen çiftin karşılıklı ve yaşayan evlilik kaydı bulunmalıdır.");
      if(spouse.family_id!==parent.family_id)throw new GameError("Evlilik kaydı yeni siyasi aileye henüz aktarılmamış; yönetici düzeltmesi gerekiyor.");
      const mother=parent.gender==="FEMALE"?parent:spouse.gender==="FEMALE"?spouse:null;
      const father=parent.gender==="MALE"?parent:spouse.gender==="MALE"?spouse:null;
      if(!mother||!father)throw new GameError("Gebelik mekaniği için bir anne ve baba kaydı gerekir.");
      if(mother.health==="SICK"&&(mother.sick_until_turn===null||rep.current_turn<=mother.sick_until_turn))
        throw new GameError(mother.name+" hasta olduğu için yeni gebelik deneyemez.");
      const modifier=birthAgeModifier(mother.age);
      if(modifier===null)throw new GameError("Doğum yapacak eş 18-44 yaş aralığında olmalıdır.");
      const pending=await client.query("SELECT 1 FROM roman_family_birth_sessions WHERE family_id=$1 AND status='PENDING_NAME'",[parent.family_id]);
      if(pending.rowCount)throw new GameError("Bu ailede adı henüz konulmamış bir çocuk bulunuyor.");
      const [firstMemberId,secondMemberId]=orderedDynastyCoupleIds(mother.id,father.id);
      const prior=(await client.query<{last_attempt_turn:number}>(
        `SELECT last_attempt_turn FROM roman_family_couple_birth_attempts
          WHERE family_id=$1 AND first_member_id=$2 AND second_member_id=$3 FOR UPDATE`,
        [parent.family_id,firstMemberId,secondMemberId]
      )).rows[0];
      if(prior&&rep.current_turn-Number(prior.last_attempt_turn)<BIRTH_ATTEMPT_COOLDOWN_TURNS)
        throw new GameError("Bu çift için yeni çocuk denemesi Tur "+(Number(prior.last_attempt_turn)+BIRTH_ATTEMPT_COOLDOWN_TURNS)+" itibarıyla yapılabilir.");
      await client.query(
        `INSERT INTO roman_family_couple_birth_attempts(family_id,first_member_id,second_member_id,last_attempt_turn)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(family_id,first_member_id,second_member_id)
         DO UPDATE SET last_attempt_turn=EXCLUDED.last_attempt_turn,updated_at=NOW()`,
        [parent.family_id,firstMemberId,secondMemberId,rep.current_turn]
      );
      const attemptRoll=randomInt(1,21);
      if(!birthAttemptSucceeded(mother.age,attemptRoll)){
        await addEvent(client,rep.id,rep.current_turn,"FAMILY_BIRTH_ATTEMPT_FAILED",parent.family_id,input.actorId,{
          motherName:mother.name,fatherName:father.name,attemptRoll,ageModifier:modifier,automatic:false
        });
        return{success:false,attemptRoll,ageModifier:modifier,pendingBirthId:null,childGender:null,genderRoll:null,
          complication:null,complicationRoll:null,motherName:mother.name,fatherName:father.name};
      }
      const genderRoll=randomInt(1,3);
      const childGender=newbornGender(genderRoll);
      const complicationRoll=randomInt(1,21);
      const complication=birthComplication(complicationRoll);
      const relation=parent.position==="HEAD"||spouse.position==="HEAD"
        ?(childGender==="MALE"?"Yöneticinin oğlu":"Yöneticinin kızı")
        :(childGender==="MALE"?"Aile üyesinin oğlu":"Aile üyesinin kızı");
      const session=(await client.query<{id:string}>(
        `INSERT INTO roman_family_birth_sessions(
           family_id,initiated_by,parent_member_id,mother_id,father_id,game_turn,attempt_roll,age_modifier,
           gender_roll,gender,complication_roll,complication,child_relation
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [parent.family_id,input.actorId,parent.id,mother.id,father.id,rep.current_turn,attemptRoll,modifier,
          genderRoll,childGender,complicationRoll,complication,relation]
      )).rows[0]!;
      if(complication==="ILLNESS")await client.query(
        "UPDATE roman_family_members SET health='SICK',sick_until_turn=$2,updated_at=NOW() WHERE id=$1",
        [mother.id,rep.current_turn+MATERNAL_ILLNESS_COOLDOWN_TURNS]
      );
      else if(complication==="DEATH")await client.query(
        `UPDATE roman_family_members SET status='DEAD',health='HEALTHY',sick_until_turn=NULL,died_turn=$2,
                death_reason='Doğum komplikasyonu',updated_at=NOW() WHERE id=$1`,[mother.id,rep.current_turn]
      );
      await addEvent(client,rep.id,rep.current_turn,"FAMILY_BIRTH_AWAITING_NAME",parent.family_id,input.actorId,{
        sessionId:session.id,motherName:mother.name,fatherName:father.name,childGender,attemptRoll,ageModifier:modifier,
        genderRoll,complicationRoll,complication
      });
      return{success:true,attemptRoll,ageModifier:modifier,pendingBirthId:session.id,childGender,genderRoll,
        complication,complicationRoll,motherName:mother.name,fatherName:father.name};
    });
  },

  async nameBirth(input:{
    guildId:string;countryId:string;actorId:string;sessionId:string;childName:string;gameMaster:boolean;
  }):Promise<{familyName:string;childName:string;gender:DynastyGender}>{
    return withTransaction(async(client)=>{
      const rep=await republic(client,input.guildId,input.countryId,true);
      const session=(await client.query<{
        id:string;family_id:string;initiated_by:string;mother_id:string;father_id:string;game_turn:number;
        gender:DynastyGender;child_relation:string;status:string;family_name:string;
      }>(`
        SELECT session.id,session.family_id,session.initiated_by,session.mother_id,session.father_id,session.game_turn,
               session.gender,session.child_relation,session.status,family.name AS family_name
          FROM roman_family_birth_sessions session JOIN roman_families family ON family.id=session.family_id
         WHERE session.id=$1 AND family.republic_id=$2 FOR UPDATE OF session`,[input.sessionId,rep.id])).rows[0];
      if(!session||session.status!=="PENDING_NAME")throw new GameError("Adlandırılmayı bekleyen Roma aile doğumu bulunamadı.");
      await requireFamilyLeader(client,rep.id,session.family_id,input.actorId,input.gameMaster);
      const childName=input.childName.trim().replace(/\s+/g," ");
      if(childName.length<2||childName.length>80)throw new GameError("Çocuk adı 2-80 karakter arasında olmalıdır.");
      const duplicate=await client.query("SELECT 1 FROM roman_family_members WHERE family_id=$1 AND lower(name)=lower($2)",[session.family_id,childName]);
      if(duplicate.rowCount)throw new GameError("Bu siyasi ailede aynı adlı bir üye zaten bulunuyor.");
      const sortOrder=Number((await client.query<{next_order:number}>(
        "SELECT COALESCE(MAX(sort_order),0)+1 AS next_order FROM roman_family_members WHERE family_id=$1",[session.family_id]
      )).rows[0]?.next_order??1);
      const child=(await client.query<{id:string}>(
        `INSERT INTO roman_family_members(
           family_id,birth_family_id,name,gender,age,position,relation,mother_id,father_id,born_turn,sort_order
         ) VALUES($1,$1,$2,$3,0,'CHILD',$4,$5,$6,$7,$8) RETURNING id`,
        [session.family_id,childName,session.gender,session.child_relation,session.mother_id,session.father_id,session.game_turn,sortOrder]
      )).rows[0]!;
      await client.query(
        "UPDATE roman_family_birth_sessions SET status='NAMED',child_id=$1,resolved_at=NOW() WHERE id=$2",
        [child.id,session.id]
      );
      await addEvent(client,rep.id,rep.current_turn,"FAMILY_CHILD_BORN",session.family_id,input.actorId,{
        sessionId:session.id,childId:child.id,childName,gender:session.gender,motherId:session.mother_id,fatherId:session.father_id
      });
      return{familyName:session.family_name,childName,gender:session.gender};
    });
  }
};
