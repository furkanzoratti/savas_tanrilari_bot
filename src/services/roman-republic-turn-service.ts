import {randomInt} from "node:crypto";
import type { DbClient } from "../db/pool.js";
import {
  BIRTH_ATTEMPT_COOLDOWN_TURNS,MATERNAL_ILLNESS_COOLDOWN_TURNS,MINIMUM_MARRIAGE_AGE,
  birthAgeModifier,birthAttemptSucceeded,birthComplication,newbornGender,orderedDynastyCoupleIds,
  type BirthComplication,type DynastyGender
} from "../domain/dynasty.js";
import {
  availableRomanFamilyChildName,planRomanNpcMarriages,romanFamilyUsesAutomaticPregnancy,
  type RomanNpcMarriageCandidate
} from "../domain/roman-family-lifecycle.js";
import {
  ROMAN_CONSUL_TURN_STIPEND,ROMAN_GOVERNOR_INFLUENCE_PER_TURN,
  ROMAN_GOVERNOR_NET_INCOME_PERCENT,romanGovernorTreasuryShare
} from "../domain/roman-republic.js";
import {processRomanPoliticalTurn,type RomanPoliticalTurnResult} from "./roman-politics-service.js";

export interface RomanFamilyTurnIncomeDetail {
  familyName:string;
  businessIncome:number;
  consulStipend:number;
  total:number;
}

export interface RomanGovernorshipTurnDetail {
  countryName:string;
  familyName:string;
  governorName:string;
  settlementName:string;
  treasuryShare:number;
  influenceGain:number;
  completed:boolean;
}

export interface RomanElectionOpenedDetail {
  countryName:string;
  sequence:number;
  closesTurn:number;
}

export interface RomanFamilyLifecycleDetail {
  familyName:string;
  agedMembers:number;
  birthAttempts:number;
  births:number;
  events:string[];
}

export interface RomanRepublicTurnResult {
  familyIncomeDetails:RomanFamilyTurnIncomeDetail[];
  governorshipDetails:RomanGovernorshipTurnDetail[];
  electionOpenedDetails:RomanElectionOpenedDetail[];
  familyLifecycleDetails:RomanFamilyLifecycleDetail[];
  politics:RomanPoliticalTurnResult;
}

interface RomanLifecycleFamilyRow{
  id:string;name:string;republic_id:string;player_count:number;
}

interface RomanLifecycleCoupleRow{
  mother_id:string;mother_name:string;mother_age:number;mother_position:string;
  father_id:string;father_name:string;father_position:string;
}

interface RomanLifecycleMarriageRow extends RomanNpcMarriageCandidate{
  name:string;familyName:string;republicId:string;
}

type RomanRandomInt=(minimum:number,maximum:number)=>number;

async function addLifecycleEvent(
  client:DbClient,republicId:string,familyId:string,gameTurn:number,eventType:string,details:unknown
):Promise<void>{
  await client.query(
    `INSERT INTO roman_republic_events(republic_id,game_turn,event_type,family_id,details)
     VALUES($1,$2,$3,$4,$5::jsonb)`,
    [republicId,gameTurn,eventType,familyId,JSON.stringify(details)]
  );
}

async function processRomanNpcMarriages(
  client:DbClient,guildId:string,gameTurn:number,detailByFamilyId:Map<string,RomanFamilyLifecycleDetail>,randomInteger:RomanRandomInt
):Promise<void>{
  const candidates=(await client.query<{
    id:string;family_id:string;gender:DynastyGender;age:number;position:string;birth_family_id:string|null;
    mother_id:string|null;father_id:string|null;name:string;family_name:string;republic_id:string;
  }>(`
    SELECT member.id,member.family_id,member.gender,member.age,member.position,
           COALESCE(member.birth_family_id,member.family_id) AS birth_family_id,
           member.mother_id,member.father_id,member.name,family.name AS family_name,family.republic_id
      FROM roman_family_members member
      JOIN roman_families family ON family.id=member.family_id
      JOIN roman_republics republic ON republic.id=family.republic_id
     WHERE republic.guild_id=$1 AND republic.status='ACTIVE' AND family.status='ACTIVE'
       AND NOT EXISTS(SELECT 1 FROM roman_family_players player
         WHERE player.family_id=family.id AND player.status='ACTIVE')
       AND member.status='ALIVE' AND member.spouse_id IS NULL AND member.age>=$2
       AND member.relation NOT ILIKE '%köle%'
     ORDER BY family.name,member.age DESC,member.name
     FOR UPDATE OF member`,[guildId,MINIMUM_MARRIAGE_AGE])).rows.map((row):RomanLifecycleMarriageRow=>({
       id:row.id,familyId:row.family_id,gender:row.gender,age:Number(row.age),position:row.position,
       birthFamilyId:row.birth_family_id,motherId:row.mother_id,fatherId:row.father_id,
       name:row.name,familyName:row.family_name,republicId:row.republic_id
     })).filter((candidate)=>detailByFamilyId.has(candidate.familyId));
  const byId=new Map(candidates.map((candidate)=>[candidate.id,candidate]));
  const republicIds=[...new Set(candidates.map((candidate)=>candidate.republicId))];
  const matches=republicIds.flatMap((republicId)=>
    planRomanNpcMarriages(candidates.filter((candidate)=>candidate.republicId===republicId),(maximum)=>randomInteger(0,maximum))
  );
  for(const match of matches){
    const man=byId.get(match.manId);
    const woman=byId.get(match.womanId);
    if(!man||!woman||man.republicId!==woman.republicId)continue;
    const proposal=(await client.query<{id:string}>(
      `INSERT INTO roman_family_marriage_proposals(
         republic_id,proposer_family_id,target_family_id,proposer_member_id,target_member_id,
         status,created_turn,resolved_turn,created_by,resolved_by,resolved_at
       ) VALUES($1,$2,$3,$4,$5,'ACCEPTED',$6,$6,'system:roman-family',
         'system:roman-family',NOW()) RETURNING id`,
      [man.republicId,man.familyId,woman.familyId,man.id,woman.id,gameTurn]
    )).rows[0]!;
    await client.query("UPDATE roman_family_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2",[woman.id,man.id]);
    await client.query(
      `UPDATE roman_family_members
          SET spouse_id=$1,birth_family_id=COALESCE(birth_family_id,family_id),family_id=$2,
              position='SPOUSE',relation='Evlilik yoluyla siyasi aileye katıldı',sort_order=(
                SELECT COALESCE(MAX(sort_order),0)+1 FROM roman_family_members WHERE family_id=$2
              ),updated_at=NOW()
        WHERE id=$3`,[man.id,man.familyId,woman.id]
    );
    const text=`${man.familyName} ailesinden ${man.name} ile ${woman.familyName} ailesinden ${woman.name} otomatik olarak evlendi`;
    const eventDetails={
      proposalId:proposal.id,manId:man.id,manName:man.name,womanId:woman.id,womanName:woman.name,
      source:"NPC_AUTO_ACCEPTED_PROPOSAL"
    };
    await addLifecycleEvent(client,man.republicId,man.familyId,gameTurn,"FAMILY_MARRIAGE",eventDetails);
    await addLifecycleEvent(client,woman.republicId,woman.familyId,gameTurn,"FAMILY_MARRIAGE",eventDetails);
    await client.query(
      `UPDATE roman_family_lifecycle_runs
          SET details=details||jsonb_build_object(
            'automaticMarriages',COALESCE((details->>'automaticMarriages')::integer,0)+1
          )
        WHERE game_turn=$1 AND family_id=ANY($2::uuid[])`,[gameTurn,[man.familyId,woman.familyId]]
    );
    for(const familyId of [man.familyId,woman.familyId])detailByFamilyId.get(familyId)?.events.push(text);
  }
}

export async function processRomanFamilyLifecycle(
  client:DbClient,guildId:string,gameTurn:number,randomInteger:RomanRandomInt=randomInt
):Promise<RomanFamilyLifecycleDetail[]>{
  const families=(await client.query<RomanLifecycleFamilyRow>(`
    SELECT family.id,family.name,family.republic_id,
           (SELECT COUNT(*)::integer FROM roman_family_players player
             WHERE player.family_id=family.id AND player.status='ACTIVE') AS player_count
      FROM roman_families family
      JOIN roman_republics republic ON republic.id=family.republic_id
     WHERE republic.guild_id=$1 AND republic.status='ACTIVE' AND family.status='ACTIVE'
     ORDER BY family.name
     FOR UPDATE OF family`,[guildId])).rows;
  const details:RomanFamilyLifecycleDetail[]=[];
  const detailByFamilyId=new Map<string,RomanFamilyLifecycleDetail>();
  for(const family of families){
    const claimed=await client.query(
      `INSERT INTO roman_family_lifecycle_runs(family_id,game_turn)
       VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING family_id`,[family.id,gameTurn]
    );
    if(!claimed.rowCount)continue;
    await client.query(
      `UPDATE roman_family_members SET health='HEALTHY',sick_until_turn=NULL,updated_at=NOW()
        WHERE family_id=$1 AND status='ALIVE' AND health='SICK'
          AND sick_until_turn IS NOT NULL AND sick_until_turn<$2`,[family.id,gameTurn]
    );
    const aged=await client.query(
      `UPDATE roman_family_members SET age=LEAST(120,age+1),updated_at=NOW()
        WHERE family_id=$1 AND status='ALIVE' RETURNING id`,[family.id]
    );
    if(!romanFamilyUsesAutomaticPregnancy(Number(family.player_count))){
      await client.query(
        `UPDATE roman_family_lifecycle_runs
            SET aged_members=$3,birth_attempts=0,births=0,
                details=jsonb_build_object('automaticPregnancy',FALSE,'reason','PLAYER_CONTROLLED_FAMILY')
          WHERE family_id=$1 AND game_turn=$2`,
        [family.id,gameTurn,aged.rowCount??0]
      );
      const detail={familyName:family.name,agedMembers:aged.rowCount??0,birthAttempts:0,births:0,events:[]};
      details.push(detail);detailByFamilyId.set(family.id,detail);
      continue;
    }
    const couples=(await client.query<RomanLifecycleCoupleRow>(`
      SELECT mother.id AS mother_id,mother.name AS mother_name,mother.age AS mother_age,mother.position AS mother_position,
             father.id AS father_id,father.name AS father_name,father.position AS father_position
        FROM roman_family_members mother
        JOIN roman_family_members father ON father.id=mother.spouse_id AND father.spouse_id=mother.id
       WHERE mother.family_id=$1 AND father.family_id=$1
         AND mother.gender='FEMALE' AND father.gender='MALE'
         AND mother.status='ALIVE' AND father.status='ALIVE'
         AND mother.health='HEALTHY' AND mother.age BETWEEN 18 AND 44
       ORDER BY mother.position='HEAD' DESC,father.position='HEAD' DESC,mother.age,mother.id
       FOR UPDATE OF mother,father`,[family.id])).rows;
    const usedNames=new Set((await client.query<{name:string}>(
      "SELECT name FROM roman_family_members WHERE family_id=$1",[family.id]
    )).rows.map((member)=>member.name.toLocaleLowerCase("tr-TR")));
    let birthAttempts=0;
    let births=0;
    const events:string[]=[];
    for(const couple of couples){
      const [firstMemberId,secondMemberId]=orderedDynastyCoupleIds(couple.mother_id,couple.father_id);
      const prior=(await client.query<{last_attempt_turn:number}>(
        `SELECT last_attempt_turn FROM roman_family_couple_birth_attempts
          WHERE family_id=$1 AND first_member_id=$2 AND second_member_id=$3 FOR UPDATE`,
        [family.id,firstMemberId,secondMemberId]
      )).rows[0];
      if(prior&&gameTurn-Number(prior.last_attempt_turn)<BIRTH_ATTEMPT_COOLDOWN_TURNS)continue;
      await client.query(
        `INSERT INTO roman_family_couple_birth_attempts(family_id,first_member_id,second_member_id,last_attempt_turn)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(family_id,first_member_id,second_member_id)
         DO UPDATE SET last_attempt_turn=EXCLUDED.last_attempt_turn,updated_at=NOW()`,
        [family.id,firstMemberId,secondMemberId,gameTurn]
      );
      birthAttempts+=1;
      const motherAge=Number(couple.mother_age);
      const ageModifier=birthAgeModifier(motherAge)!;
      const attemptRoll=randomInteger(1,21);
      if(!birthAttemptSucceeded(motherAge,attemptRoll)){
        await addLifecycleEvent(client,family.republic_id,family.id,gameTurn,"FAMILY_BIRTH_ATTEMPT_FAILED",{
          motherName:couple.mother_name,fatherName:couple.father_name,attemptRoll,ageModifier,automatic:true
        });
        continue;
      }
      const genderRoll=randomInteger(1,3);
      const gender:DynastyGender=newbornGender(genderRoll);
      const childName=availableRomanFamilyChildName(family.name,gender,usedNames,(maximum)=>randomInteger(0,maximum));
      usedNames.add(childName.toLocaleLowerCase("tr-TR"));
      const relation=gender==="MALE"
        ?(couple.mother_position==="HEAD"||couple.father_position==="HEAD"?"Yöneticinin oğlu":"Aile üyesinin oğlu")
        :(couple.mother_position==="HEAD"||couple.father_position==="HEAD"?"Yöneticinin kızı":"Aile üyesinin kızı");
      const sortOrder=Number((await client.query<{next_order:number}>(
        "SELECT COALESCE(MAX(sort_order),0)+1 AS next_order FROM roman_family_members WHERE family_id=$1",[family.id]
      )).rows[0]?.next_order??1);
      const child=(await client.query<{id:string}>(
        `INSERT INTO roman_family_members(
           family_id,birth_family_id,name,gender,age,position,relation,mother_id,father_id,born_turn,sort_order
         ) VALUES($1,$1,$2,$3,0,'CHILD',$4,$5,$6,$7,$8) RETURNING id`,
        [family.id,childName,gender,relation,couple.mother_id,couple.father_id,gameTurn,sortOrder]
      )).rows[0]!;
      births+=1;
      const complicationRoll=randomInteger(1,21);
      const complication:BirthComplication=birthComplication(complicationRoll);
      if(complication==="ILLNESS"){
        await client.query(
          `UPDATE roman_family_members SET health='SICK',sick_until_turn=$2,updated_at=NOW() WHERE id=$1`,
          [couple.mother_id,gameTurn+MATERNAL_ILLNESS_COOLDOWN_TURNS]
        );
      }else if(complication==="DEATH"){
        await client.query(
          `UPDATE roman_family_members SET status='DEAD',died_turn=$2,death_reason='Doğum komplikasyonu',updated_at=NOW()
            WHERE id=$1`,[couple.mother_id,gameTurn]
        );
      }
      await addLifecycleEvent(client,family.republic_id,family.id,gameTurn,"FAMILY_CHILD_BORN",{
        childId:child.id,childName,gender,motherId:couple.mother_id,motherName:couple.mother_name,
        fatherId:couple.father_id,fatherName:couple.father_name,attemptRoll,ageModifier,genderRoll,
        complicationRoll,complication,automatic:true
      });
      const complicationText=complication==="ILLNESS"?` • ${couple.mother_name} hastalandı`
        :complication==="DEATH"?` • ${couple.mother_name} doğum sırasında öldü`:"";
      events.push(`${childName} doğdu${complicationText}`);
    }
    await client.query(
      `UPDATE roman_family_lifecycle_runs
          SET aged_members=$3,birth_attempts=$4,births=$5,details=$6::jsonb
        WHERE family_id=$1 AND game_turn=$2`,
      [family.id,gameTurn,aged.rowCount??0,birthAttempts,births,JSON.stringify({automaticPregnancy:true,events})]
    );
    const detail={familyName:family.name,agedMembers:aged.rowCount??0,birthAttempts,births,events};
    details.push(detail);detailByFamilyId.set(family.id,detail);
  }
  await processRomanNpcMarriages(client,guildId,gameTurn,detailByFamilyId,randomInteger);
  return details;
}

async function processFamilyIncome(client:DbClient,guildId:string,gameTurn:number):Promise<RomanFamilyTurnIncomeDetail[]> {
  const families=(await client.query<{
    id:string;name:string;current_consul_family_id:string|null;business_income:number;
  }>(`
    SELECT family.id,family.name,republic.current_consul_family_id,
           COALESCE(SUM(business.turn_income) FILTER (WHERE business.status='ACTIVE'),0)::bigint AS business_income
      FROM roman_families family
      JOIN roman_republics republic ON republic.id=family.republic_id
      LEFT JOIN roman_family_businesses business ON business.family_id=family.id
     WHERE republic.guild_id=$1 AND republic.status='ACTIVE' AND family.status='ACTIVE'
     GROUP BY family.id,family.name,republic.current_consul_family_id
     ORDER BY family.name`,[guildId])).rows;
  const details:RomanFamilyTurnIncomeDetail[]=[];
  for(const family of families){
    const businessIncome=Number(family.business_income);
    const consulStipend=family.current_consul_family_id===family.id?ROMAN_CONSUL_TURN_STIPEND:0;
    const claimed=await client.query(
      `INSERT INTO roman_family_turn_income_runs(family_id,game_turn,business_income,consul_stipend)
       VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING family_id`,
      [family.id,gameTurn,businessIncome,consulStipend]
    );
    if(!claimed.rowCount)continue;
    const total=businessIncome+consulStipend;
    if(total){
      await client.query("UPDATE roman_families SET treasury=treasury+$2,updated_at=NOW() WHERE id=$1",[family.id,total]);
      await client.query(
        `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,amount,description,details)
         VALUES($1,$2,'TURN_INCOME',$3,$4,$5::jsonb)`,
        [family.id,gameTurn,total,"Aile işletmeleri ve konsül ödeneği",JSON.stringify({businessIncome,consulStipend})]
      );
    }
    details.push({familyName:family.name,businessIncome,consulStipend,total});
  }
  return details;
}

async function processGovernorships(
  client:DbClient,guildId:string,gameTurn:number,acquisition:boolean
):Promise<RomanGovernorshipTurnDetail[]> {
  await client.query(
    `UPDATE roman_governorships governorship SET status='COMPLETED',updated_at=NOW()
      FROM roman_republics republic
     WHERE governorship.republic_id=republic.id AND republic.guild_id=$1
       AND governorship.status='ACTIVE' AND governorship.end_turn<$2`,
    [guildId,gameTurn]
  );
  const rows=(await client.query<{
    id:string;family_id:string;family_name:string;country_id:string;country_name:string;
    settlement_id:string;settlement_name:string;local_treasury:number;governor_name:string;end_turn:number;prosperity:number;rebellion_progress:number;
  }>(`
    SELECT governorship.id,governorship.family_id,family.name AS family_name,republic.country_id,
           country.name AS country_name,governorship.settlement_id,settlement.name AS settlement_name,
           settlement.local_treasury,settlement.prosperity,settlement.rebellion_progress,governorship.governor_name,governorship.end_turn
      FROM roman_governorships governorship
      JOIN roman_republics republic ON republic.id=governorship.republic_id
      JOIN roman_families family ON family.id=governorship.family_id
      JOIN countries country ON country.id=republic.country_id
      JOIN settlements settlement ON settlement.id=governorship.settlement_id
     WHERE republic.guild_id=$1 AND republic.status='ACTIVE' AND governorship.status='ACTIVE'
       AND governorship.end_turn>=$2
     ORDER BY settlement.name
     FOR UPDATE OF governorship,family,settlement`,[guildId,gameTurn])).rows;
  const details:RomanGovernorshipTurnDetail[]=[];
  const affectedCountries=new Set<string>();
  for(const row of rows){
    const transaction=acquisition?(await client.query<{amount:number}>(
      `SELECT amount FROM transactions
        WHERE settlement_id=$1 AND turn=$2 AND kind='ACQUISITION_SETTLEMENT'
        ORDER BY created_at DESC LIMIT 1`,[row.settlement_id,gameTurn]
    )).rows[0]:undefined;
    const settlementNetIncome=Math.max(0,Number(transaction?.amount??0));
    const treasuryShare=Math.min(Math.max(0,Number(row.local_treasury)),romanGovernorTreasuryShare(settlementNetIncome));
    const claimed=await client.query(
      `INSERT INTO roman_governorship_income_runs(
         governorship_id,game_turn,settlement_net_income,treasury_share,influence_gain
       ) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING governorship_id`,
      [row.id,gameTurn,settlementNetIncome,treasuryShare,ROMAN_GOVERNOR_INFLUENCE_PER_TURN]
    );
    if(!claimed.rowCount)continue;
    if(treasuryShare){
      const settlement=(await client.query<{local_treasury:number}>(
        "UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2 RETURNING local_treasury",
        [treasuryShare,row.settlement_id]
      )).rows[0]!;
      await client.query(
        `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
         VALUES($1,$2,$3,'ROMAN_GOVERNOR_SHARE',$4,$5,$6,$7::jsonb)`,
        [row.country_id,row.settlement_id,gameTurn,-treasuryShare,
          `${row.settlement_name}: ${row.governor_name} valilik payı`,Number(settlement.local_treasury),
          JSON.stringify({governorshipId:row.id,familyId:row.family_id,ratePercent:ROMAN_GOVERNOR_NET_INCOME_PERCENT,settlementNetIncome})]
      );
      affectedCountries.add(row.country_id);
    }
    await client.query(
      `UPDATE roman_families SET treasury=treasury+$2,political_influence=political_influence+$3,updated_at=NOW()
        WHERE id=$1`,[row.family_id,treasuryShare,ROMAN_GOVERNOR_INFLUENCE_PER_TURN]
    );
    await client.query(
      `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,amount,influence_delta,description,details)
       VALUES($1,$2,'GOVERNORSHIP_YIELD',$3,$4,$5,$6::jsonb)`,
      [row.family_id,gameTurn,treasuryShare,ROMAN_GOVERNOR_INFLUENCE_PER_TURN,
        `${row.settlement_name} valiliği tur getirisi`,
        JSON.stringify({governorshipId:row.id,settlementId:row.settlement_id,settlementNetIncome,acquisition})]
    );
    const completed=Number(row.end_turn)===gameTurn;
    if(completed){
      await client.query("UPDATE roman_governorships SET status='COMPLETED',updated_at=NOW() WHERE id=$1",[row.id]);
      const reputationGain=Number(row.prosperity)>=60&&Number(row.rebellion_progress)<30?3:Number(row.prosperity)>=40?2:1;
      const scandalGain=Number(row.rebellion_progress)>=60?1:0;
      await client.query(`UPDATE roman_families SET reputation=LEAST(100,reputation+$2),scandal=LEAST(100,scandal+$3),updated_at=NOW()
        WHERE id=$1`,[row.family_id,reputationGain,scandalGain]);
      await client.query(`INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,influence_delta,description,details)
        VALUES($1,$2,'GOVERNORSHIP_COMPLETED',0,$3,$4::jsonb)`,[row.family_id,gameTurn,
        `${row.settlement_name} valilik dönemi tamamlandı`,JSON.stringify({reputationGain,scandalGain,prosperity:row.prosperity,rebellionProgress:row.rebellion_progress})]);
    }
    details.push({
      countryName:row.country_name,familyName:row.family_name,governorName:row.governor_name,
      settlementName:row.settlement_name,treasuryShare,influenceGain:ROMAN_GOVERNOR_INFLUENCE_PER_TURN,completed
    });
  }
  for(const countryId of affectedCountries){
    await client.query(
      "UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",
      [countryId]
    );
  }
  return details;
}

async function openDueElections(client:DbClient,guildId:string,gameTurn:number):Promise<RomanElectionOpenedDetail[]> {
  const due=(await client.query<{id:string;country_name:string}>(`
    SELECT republic.id,country.name AS country_name
      FROM roman_republics republic
      JOIN countries country ON country.id=republic.country_id
     WHERE republic.guild_id=$1 AND republic.status='ACTIVE' AND republic.next_election_turn<=$2
       AND NOT EXISTS(SELECT 1 FROM roman_elections election WHERE election.republic_id=republic.id AND election.status='OPEN')
     ORDER BY country.name FOR UPDATE OF republic`,[guildId,gameTurn])).rows;
  const details:RomanElectionOpenedDetail[]=[];
  for(const republic of due){
    const sequence=Number((await client.query<{sequence:number}>(
      "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM roman_elections WHERE republic_id=$1",[republic.id]
    )).rows[0]?.sequence??1);
    const election=(await client.query<{id:string}>(
      `INSERT INTO roman_elections(republic_id,sequence,started_turn,closes_turn)
       VALUES($1,$2,$3,$4) RETURNING id`,[republic.id,sequence,gameTurn,gameTurn+1]
    )).rows[0]!;
    await client.query(
      `INSERT INTO roman_republic_events(republic_id,game_turn,event_type,details)
       VALUES($1,$2,'ELECTION_OPENED',$3::jsonb)`,
      [republic.id,gameTurn,JSON.stringify({electionId:election.id,sequence,closesTurn:gameTurn+1,automatic:true})]
    );
    details.push({countryName:republic.country_name,sequence,closesTurn:gameTurn+1});
  }
  return details;
}

export async function processRomanRepublicTurn(
  client:DbClient,guildId:string,gameTurn:number,acquisition:boolean
):Promise<RomanRepublicTurnResult> {
  const familyLifecycleDetails=await processRomanFamilyLifecycle(client,guildId,gameTurn);
  const familyIncomeDetails=await processFamilyIncome(client,guildId,gameTurn);
  const governorshipDetails=await processGovernorships(client,guildId,gameTurn,acquisition);
  const electionOpenedDetails=await openDueElections(client,guildId,gameTurn);
  const politics=await processRomanPoliticalTurn(client,guildId,gameTurn,acquisition);
  return{familyIncomeDetails,governorshipDetails,electionOpenedDetails,familyLifecycleDetails,politics};
}
