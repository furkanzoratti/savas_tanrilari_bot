import {pool,withTransaction,type DbClient} from "../db/pool.js";
import {
  ROMAN_BALLOT_INFLUENCE_CAP,ROMAN_CANDIDACY_INFLUENCE_COST,ROMAN_OFFICES,ROMAN_RELATION_ACTIONS,
  ROMAN_SENATE_PROPOSALS,romanNpcDecisionScore,romanNpcVote,
  type RomanOfficeKey,type RomanPoliticalBloc,type RomanPoliticalCategory,type RomanProposalType,type RomanRelationAction
} from "../domain/roman-republic.js";
import {GameError} from "./game-service.js";
import {romanFamilyMembership} from "./roman-family-access.js";

type VoteChoice="YES"|"NO"|"ABSTAIN";

export interface RomanSenateProposalView{
  id:string;type:string;category:string;title:string;description:string;proposerFamilyId:string;proposerFamilyName:string;
  targetFamilyName:string|null;targetCharacterName:string|null;officeKey:RomanOfficeKey|null;
  thresholdPercent:number;openedTurn:number;closesTurn:number;status:string;yesWeight:number;noWeight:number;abstainFamilies:number;
  votes:Array<{familyName:string;choice:VoteChoice;seatWeight:number;influenceSpent:number;totalWeight:number;npcScore:number|null}>;
}
export interface RomanPoliticsView{
  countryId:string;countryName:string;currentTurn:number;
  proposals:RomanSenateProposalView[];
  laws:Array<{id:string;key:RomanProposalType;title:string;startedTurn:number;endTurn:number;status:string}>;
  offices:Array<{id:string;familyId:string;familyName:string;characterName:string;officeKey:RomanOfficeKey;startedTurn:number;endTurn:number;status:string}>;
  relations:Array<{familyAId:string;familyAName:string;familyBId:string;familyBName:string;score:number;trust:number;rivalry:number;lastReason:string|null}>;
}

export interface RomanPoliticalTurnResult{
  proposalResults:Array<{countryName:string;title:string;passed:boolean;yesWeight:number;noWeight:number;requiredWeight:number}>;
  officeYields:Array<{familyName:string;characterName:string;officeLabel:string;treasury:number;influence:number;reputation:number;scandal:number;completed:boolean}>;
  lawEffects:Array<{countryName:string;lawTitle:string;summary:string}>;
}

async function currentTurn(client:DbClient,guildId:string):Promise<number>{
  const row=(await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[guildId])).rows[0];
  if(!row)throw new GameError("Sunucu oyun ayarları bulunamadı.");
  return Number(row.current_turn);
}

async function republicRow(client:DbClient,guildId:string,countryId:string){
  return (await client.query<{
    id:string;country_id:string;country_name:string;senate_total_seats:number;current_consul_family_id:string|null;
  }>(`SELECT republic.id,republic.country_id,country.name AS country_name,republic.senate_total_seats,republic.current_consul_family_id
        FROM roman_republics republic JOIN countries country ON country.id=republic.country_id
       WHERE republic.guild_id=$1 AND republic.country_id=$2 AND republic.status='ACTIVE'`,[guildId,countryId])).rows[0]??null;
}

async function familyByValue(client:DbClient,republicId:string,value:string){
  return (await client.query<{
    id:string;name:string;treasury:number;political_influence:number;senate_seats:number;reputation:number;scandal:number;political_bloc:RomanPoliticalBloc;
  }>(`SELECT id,name,treasury,political_influence,senate_seats,reputation,scandal,political_bloc
        FROM roman_families WHERE republic_id=$1 AND status='ACTIVE' AND (id::text=$2 OR lower(name)=lower($2))`,
    [republicId,value.trim()])).rows[0]??null;
}

async function actingFamily(client:DbClient,republicId:string,userId:string,gameMaster:boolean,currentConsulId:string|null){
  const membership=await romanFamilyMembership(client,republicId,userId);
  if(!membership&&!gameMaster)throw new GameError("Bir Roma siyasi ailesine atanmış değilsiniz.");
  if(membership&&!membership.isLeader&&!gameMaster)throw new GameError("Bu işlemi yalnızca siyasi aile lideri yapabilir.");
  const familyId=membership?.familyId??currentConsulId;
  if(!familyId)throw new GameError("İşlemi yapacak siyasi aile bulunamadı.");
  return familyId;
}

function orderedPair(left:string,right:string):[string,string]{
  return left<right?[left,right]:[right,left];
}

async function relationBetween(client:DbClient,republicId:string,left:string,right:string){
  if(left===right)return{score:100,trust:100,rivalry:0};
  const [familyA,familyB]=orderedPair(left,right);
  await client.query(
    `INSERT INTO roman_family_relations(republic_id,family_a_id,family_b_id)
     VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[republicId,familyA,familyB]
  );
  return (await client.query<{score:number;trust:number;rivalry:number}>(
    "SELECT score,trust,rivalry FROM roman_family_relations WHERE republic_id=$1 AND family_a_id=$2 AND family_b_id=$3",
    [republicId,familyA,familyB]
  )).rows[0]!;
}

async function adjustRelation(client:DbClient,input:{
  republicId:string;left:string;right:string;turn:number;score:number;trust:number;rivalry:number;reason:string;details?:unknown;
}){
  if(input.left===input.right)return;
  const [familyA,familyB]=orderedPair(input.left,input.right);
  await client.query(
    `INSERT INTO roman_family_relations(republic_id,family_a_id,family_b_id)
     VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[input.republicId,familyA,familyB]
  );
  await client.query(
    `UPDATE roman_family_relations SET score=GREATEST(-100,LEAST(100,score+$4)),
       trust=GREATEST(0,LEAST(100,trust+$5)),rivalry=GREATEST(0,LEAST(100,rivalry+$6)),
       last_reason=$7,updated_at=NOW() WHERE republic_id=$1 AND family_a_id=$2 AND family_b_id=$3`,
    [input.republicId,familyA,familyB,input.score,input.trust,input.rivalry,input.reason]
  );
  await client.query(
    `INSERT INTO roman_family_relation_events(republic_id,family_a_id,family_b_id,game_turn,score_delta,trust_delta,rivalry_delta,reason,details)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [input.republicId,familyA,familyB,input.turn,input.score,input.trust,input.rivalry,input.reason,JSON.stringify(input.details??{})]
  );
}

export async function recordRomanElectionSupport(client:DbClient,input:{republicId:string;voterFamilyId:string;candidateFamilyId:string;turn:number;electionId:string}){
  await adjustRelation(client,{republicId:input.republicId,left:input.voterFamilyId,right:input.candidateFamilyId,turn:input.turn,
    score:2,trust:1,rivalry:0,reason:"Konsül seçiminde destek verdi",details:{electionId:input.electionId}});
}

async function viewWithClient(client:DbClient,guildId:string,countryId:string):Promise<RomanPoliticsView>{
  const republic=await republicRow(client,guildId,countryId);
  if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
  const turn=await currentTurn(client,guildId);
  const proposals=(await client.query<{
    id:string;proposal_type:string;category:string;title:string;description:string;proposed_by_family_id:string;proposer_name:string;
    target_family_name:string|null;target_character_name:string|null;office_key:RomanOfficeKey|null;threshold_percent:number;
    opened_turn:number;closes_turn:number;status:string;yes_weight:number;no_weight:number;abstain_families:number;
  }>(`SELECT proposal.id,proposal.proposal_type,proposal.category,proposal.title,proposal.description,
             proposal.proposed_by_family_id,proposer.name AS proposer_name,target.name AS target_family_name,
             proposal.target_character_name,proposal.office_key,proposal.threshold_percent,proposal.opened_turn,
             proposal.closes_turn,proposal.status,proposal.yes_weight,proposal.no_weight,proposal.abstain_families
        FROM roman_senate_proposals proposal
        JOIN roman_families proposer ON proposer.id=proposal.proposed_by_family_id
        LEFT JOIN roman_families target ON target.id=proposal.target_family_id
       WHERE proposal.republic_id=$1 ORDER BY CASE proposal.status WHEN 'OPEN' THEN 0 ELSE 1 END,proposal.created_at DESC LIMIT 20`,[republic.id])).rows;
  const proposalIds=proposals.map((proposal)=>proposal.id);
  const votes=proposalIds.length?(await client.query<{
    proposal_id:string;family_name:string;choice:VoteChoice;seat_weight:number;influence_spent:number;total_weight:number;npc_score:number|null;
  }>(`SELECT vote.proposal_id,family.name AS family_name,vote.choice,vote.seat_weight,vote.influence_spent,vote.total_weight,vote.npc_score
        FROM roman_senate_votes vote JOIN roman_families family ON family.id=vote.family_id
       WHERE vote.proposal_id=ANY($1::uuid[]) ORDER BY family.name`,[proposalIds])).rows:[];
  const laws=(await client.query<{id:string;law_key:RomanProposalType;title:string;started_turn:number;end_turn:number;status:string}>(
    "SELECT id,law_key,title,started_turn,end_turn,status FROM roman_laws WHERE republic_id=$1 ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,end_turn DESC LIMIT 20",
    [republic.id]
  )).rows;
  const offices=(await client.query<{
    id:string;family_id:string;family_name:string;character_name:string;office_key:RomanOfficeKey;started_turn:number;end_turn:number;status:string;
  }>(`SELECT holder.id,holder.family_id,family.name AS family_name,holder.character_name,holder.office_key,
             holder.started_turn,holder.end_turn,holder.status
        FROM roman_office_holders holder JOIN roman_families family ON family.id=holder.family_id
       WHERE holder.republic_id=$1 ORDER BY CASE holder.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,holder.end_turn DESC LIMIT 30`,[republic.id])).rows;
  const relations=(await client.query<{
    family_a_id:string;family_a_name:string;family_b_id:string;family_b_name:string;score:number;trust:number;rivalry:number;last_reason:string|null;
  }>(`SELECT relation.family_a_id,left_family.name AS family_a_name,relation.family_b_id,right_family.name AS family_b_name,
             relation.score,relation.trust,relation.rivalry,relation.last_reason
        FROM roman_family_relations relation
        JOIN roman_families left_family ON left_family.id=relation.family_a_id
        JOIN roman_families right_family ON right_family.id=relation.family_b_id
       WHERE relation.republic_id=$1 ORDER BY abs(relation.score) DESC,left_family.name,right_family.name`,[republic.id])).rows;
  return{
    countryId:republic.country_id,countryName:republic.country_name,currentTurn:turn,
    proposals:proposals.map((proposal)=>({
      id:proposal.id,type:proposal.proposal_type,category:proposal.category,title:proposal.title,description:proposal.description,
      proposerFamilyId:proposal.proposed_by_family_id,proposerFamilyName:proposal.proposer_name,
      targetFamilyName:proposal.target_family_name,targetCharacterName:proposal.target_character_name,officeKey:proposal.office_key,
      thresholdPercent:Number(proposal.threshold_percent),openedTurn:Number(proposal.opened_turn),closesTurn:Number(proposal.closes_turn),
      status:proposal.status,yesWeight:Number(proposal.yes_weight),noWeight:Number(proposal.no_weight),abstainFamilies:Number(proposal.abstain_families),
      votes:votes.filter((vote)=>vote.proposal_id===proposal.id).map((vote)=>({
        familyName:vote.family_name,choice:vote.choice,seatWeight:Number(vote.seat_weight),influenceSpent:Number(vote.influence_spent),
        totalWeight:Number(vote.total_weight),npcScore:vote.npc_score===null?null:Number(vote.npc_score)
      }))
    })),
    laws:laws.map((law)=>({id:law.id,key:law.law_key,title:law.title,startedTurn:Number(law.started_turn),endTurn:Number(law.end_turn),status:law.status})),
    offices:offices.map((office)=>({id:office.id,familyId:office.family_id,familyName:office.family_name,characterName:office.character_name,
      officeKey:office.office_key,startedTurn:Number(office.started_turn),endTurn:Number(office.end_turn),status:office.status})),
    relations:relations.map((relation)=>({familyAId:relation.family_a_id,familyAName:relation.family_a_name,familyBId:relation.family_b_id,
      familyBName:relation.family_b_name,score:Number(relation.score),trust:Number(relation.trust),rivalry:Number(relation.rivalry),lastReason:relation.last_reason}))
  };
}

async function castNpcProposalVotes(client:DbClient,proposalId:string,turn:number){
  const proposal=(await client.query<{
    id:string;republic_id:string;proposed_by_family_id:string;target_family_id:string|null;category:string;
    proposer_reputation:number;proposer_scandal:number;
  }>(`SELECT proposal.id,proposal.republic_id,proposal.proposed_by_family_id,proposal.target_family_id,proposal.category,
             proposer.reputation AS proposer_reputation,proposer.scandal AS proposer_scandal
        FROM roman_senate_proposals proposal JOIN roman_families proposer ON proposer.id=proposal.proposed_by_family_id
       WHERE proposal.id=$1 AND proposal.status='OPEN'`,[proposalId])).rows[0];
  if(!proposal)return;
  const families=(await client.query<{
    id:string;name:string;senate_seats:number;political_influence:number;political_bloc:RomanPoliticalBloc;
  }>(`SELECT family.id,family.name,family.senate_seats,family.political_influence,family.political_bloc
        FROM roman_families family WHERE family.republic_id=$1 AND family.status='ACTIVE'
          AND NOT EXISTS(SELECT 1 FROM roman_family_players player WHERE player.family_id=family.id AND player.status='ACTIVE')
          AND NOT EXISTS(SELECT 1 FROM roman_senate_votes vote WHERE vote.proposal_id=$2 AND vote.family_id=family.id)
       ORDER BY family.name`,[proposal.republic_id,proposal.id])).rows;
  for(const family of families){
    const relation=await relationBetween(client,proposal.republic_id,family.id,proposal.proposed_by_family_id);
    const score=romanNpcDecisionScore({
      seed:`${proposal.id}:${family.id}`,bloc:family.political_bloc,category:proposal.category as RomanPoliticalCategory,
      relationScore:Number(relation.score),trust:Number(relation.trust),rivalry:Number(relation.rivalry),
      proposerReputation:Number(proposal.proposer_reputation),proposerScandal:Number(proposal.proposer_scandal),
      selfTarget:proposal.target_family_id===family.id
    });
    const choice=romanNpcVote(score);
    const influenceSpent=choice==="ABSTAIN"?0:Math.min(Number(family.political_influence),Math.abs(score)>=35?3:Math.abs(score)>=24?1:0);
    const seatWeight=Number(family.senate_seats);
    const totalWeight=choice==="ABSTAIN"?0:seatWeight+influenceSpent;
    await client.query(
      `INSERT INTO roman_senate_votes(proposal_id,family_id,choice,seat_weight,influence_spent,total_weight,npc_score)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [proposal.id,family.id,choice,seatWeight,influenceSpent,totalWeight,score]
    );
    if(influenceSpent){
      await client.query("UPDATE roman_families SET political_influence=political_influence-$2,updated_at=NOW() WHERE id=$1",[family.id,influenceSpent]);
      await client.query(
        `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,influence_delta,description,details)
         VALUES($1,$2,'NPC_SENATE_LOBBY',$3,$4,$5::jsonb)`,
        [family.id,turn,-influenceSpent,`${proposal.category} teklifinde NPC lobi harcaması`,JSON.stringify({proposalId:proposal.id,choice,score})]
      );
    }
  }
}

export async function resolveSenateProposalWithClient(client:DbClient,proposalId:string,turn:number,resolvedBy:string|null){
  const proposal=(await client.query<{
    id:string;republic_id:string;country_name:string;proposed_by_family_id:string;proposal_type:string;title:string;
    threshold_percent:number;duration_turns:number;target_family_id:string|null;target_character_name:string|null;office_key:RomanOfficeKey|null;
    senate_total_seats:number;status:string;
  }>(`SELECT proposal.id,proposal.republic_id,country.name AS country_name,proposal.proposed_by_family_id,proposal.proposal_type,
             proposal.title,proposal.threshold_percent,proposal.duration_turns,proposal.target_family_id,proposal.target_character_name,
             proposal.office_key,republic.senate_total_seats,proposal.status
        FROM roman_senate_proposals proposal JOIN roman_republics republic ON republic.id=proposal.republic_id
        JOIN countries country ON country.id=republic.country_id WHERE proposal.id=$1 FOR UPDATE OF proposal`,[proposalId])).rows[0];
  if(!proposal||proposal.status!=="OPEN")throw new GameError("Sonuçlandırılacak açık Senato teklifi bulunamadı.");
  await castNpcProposalVotes(client,proposal.id,turn);
  const totals=(await client.query<{yes_weight:number;no_weight:number;abstain_families:number}>(`
    SELECT COALESCE(SUM(total_weight) FILTER(WHERE choice='YES'),0)::int AS yes_weight,
           COALESCE(SUM(total_weight) FILTER(WHERE choice='NO'),0)::int AS no_weight,
           COUNT(*) FILTER(WHERE choice='ABSTAIN')::int AS abstain_families
      FROM roman_senate_votes WHERE proposal_id=$1`,[proposal.id])).rows[0]!;
  const requiredWeight=Math.ceil(Number(proposal.senate_total_seats)*Number(proposal.threshold_percent)/100);
  let passed=Number(totals.yes_weight)>=requiredWeight&&Number(totals.yes_weight)>Number(totals.no_weight);
  if(passed&&proposal.proposal_type==="OFFICE_APPOINTMENT"){
    const occupied=await client.query(
      "SELECT 1 FROM roman_office_holders WHERE republic_id=$1 AND office_key=$2 AND status='ACTIVE'",
      [proposal.republic_id,proposal.office_key]
    );
    if(occupied.rowCount)passed=false;
  }
  await client.query(
    `UPDATE roman_senate_proposals SET status=$2,yes_weight=$3,no_weight=$4,abstain_families=$5,
       resolved_turn=$6,resolved_by=$7,resolved_at=NOW() WHERE id=$1`,
    [proposal.id,passed?"PASSED":"REJECTED",totals.yes_weight,totals.no_weight,totals.abstain_families,turn,resolvedBy]
  );
  if(passed&&proposal.proposal_type==="OFFICE_APPOINTMENT"&&proposal.target_family_id&&proposal.target_character_name&&proposal.office_key){
    await client.query(
      `INSERT INTO roman_office_holders(republic_id,family_id,character_name,office_key,source_proposal_id,started_turn,end_turn)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [proposal.republic_id,proposal.target_family_id,proposal.target_character_name,proposal.office_key,proposal.id,turn,turn+proposal.duration_turns-1]
    );
  }else if(passed&&proposal.proposal_type in ROMAN_SENATE_PROPOSALS){
    await client.query(
      `INSERT INTO roman_laws(republic_id,proposal_id,law_key,title,started_turn,end_turn)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [proposal.republic_id,proposal.id,proposal.proposal_type,proposal.title,turn,turn+proposal.duration_turns-1]
    );
  }
  await client.query(
    `UPDATE roman_families SET reputation=GREATEST(0,LEAST(100,reputation+$2)),updated_at=NOW() WHERE id=$1`,
    [proposal.proposed_by_family_id,passed?2:-1]
  );
  const votes=(await client.query<{family_id:string;choice:VoteChoice}>(
    "SELECT family_id,choice FROM roman_senate_votes WHERE proposal_id=$1",[proposal.id]
  )).rows;
  for(const vote of votes){
    if(vote.family_id===proposal.proposed_by_family_id||vote.choice==="ABSTAIN")continue;
    await adjustRelation(client,{republicId:proposal.republic_id,left:vote.family_id,right:proposal.proposed_by_family_id,turn,
      score:vote.choice==="YES"?3:-3,trust:vote.choice==="YES"?1:0,rivalry:vote.choice==="NO"?2:0,
      reason:vote.choice==="YES"?"Senato teklifini destekledi":"Senato teklifine karşı çıktı",details:{proposalId:proposal.id}});
  }
  return{countryName:proposal.country_name,title:proposal.title,passed,yesWeight:Number(totals.yes_weight),noWeight:Number(totals.no_weight),requiredWeight};
}

export async function ensureNpcElectionParticipation(client:DbClient,republicId:string,turn:number){
  const election=(await client.query<{id:string}>(
    "SELECT id FROM roman_elections WHERE republic_id=$1 AND status='OPEN' FOR UPDATE",[republicId]
  )).rows[0];
  if(!election)return;
  const npcFamilies=(await client.query<{
    id:string;name:string;political_influence:number;senate_seats:number;reputation:number;scandal:number;political_bloc:RomanPoliticalBloc;head_name:string|null;
  }>(`SELECT family.id,family.name,family.political_influence,family.senate_seats,family.reputation,family.scandal,family.political_bloc,
             (SELECT member.name FROM roman_family_members member WHERE member.family_id=family.id AND member.position='HEAD' AND member.status='ALIVE' LIMIT 1) AS head_name
        FROM roman_families family WHERE family.republic_id=$1 AND family.status='ACTIVE'
          AND NOT EXISTS(SELECT 1 FROM roman_family_players player WHERE player.family_id=family.id AND player.status='ACTIVE')
       ORDER BY family.reputation-family.scandal DESC,family.political_influence DESC,family.name`,[republicId])).rows;
  const existingNpcCandidates=await client.query(
    `SELECT 1 FROM roman_election_candidates candidate
      JOIN roman_families family ON family.id=candidate.family_id
     WHERE candidate.election_id=$1 AND NOT EXISTS(SELECT 1 FROM roman_family_players player WHERE player.family_id=family.id AND player.status='ACTIVE') LIMIT 1`,
    [election.id]
  );
  if(!existingNpcCandidates.rowCount){
    for(const family of npcFamilies.filter((item)=>item.head_name&&Number(item.political_influence)>=ROMAN_CANDIDACY_INFLUENCE_COST).slice(0,3)){
      const candidate=(await client.query<{id:string}>(
        `INSERT INTO roman_election_candidates(election_id,family_id,candidate_name,nomination_cost,nominated_by)
         VALUES($1,$2,$3,$4,'NPC') ON CONFLICT DO NOTHING RETURNING id`,
        [election.id,family.id,family.head_name,ROMAN_CANDIDACY_INFLUENCE_COST]
      )).rows[0];
      if(candidate){
        await client.query("UPDATE roman_families SET political_influence=political_influence-$2 WHERE id=$1",[family.id,ROMAN_CANDIDACY_INFLUENCE_COST]);
        await client.query(
          `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,influence_delta,description,details)
           VALUES($1,$2,'NPC_ELECTION_CANDIDACY',$3,$4,$5::jsonb)`,
          [family.id,turn,-ROMAN_CANDIDACY_INFLUENCE_COST,`${family.head_name} NPC konsül adayı`,JSON.stringify({electionId:election.id})]
        );
      }
    }
  }
  const candidates=(await client.query<{
    id:string;family_id:string;reputation:number;scandal:number;political_bloc:RomanPoliticalBloc;
  }>(`SELECT candidate.id,candidate.family_id,family.reputation,family.scandal,family.political_bloc
        FROM roman_election_candidates candidate JOIN roman_families family ON family.id=candidate.family_id
       WHERE candidate.election_id=$1`,[election.id])).rows;
  if(!candidates.length)return;
  for(const family of npcFamilies){
    const voted=await client.query("SELECT 1 FROM roman_election_ballots WHERE election_id=$1 AND voter_family_id=$2",[election.id,family.id]);
    if(voted.rowCount)continue;
    const ranked=[] as Array<{candidateId:string;candidateFamilyId:string;score:number}>;
    for(const candidate of candidates){
      const relation=await relationBetween(client,republicId,family.id,candidate.family_id);
      const score=romanNpcDecisionScore({seed:`election:${election.id}:${family.id}:${candidate.id}`,bloc:family.political_bloc,
        category:"ADMINISTRATION",relationScore:Number(relation.score),trust:Number(relation.trust),rivalry:Number(relation.rivalry),
        proposerReputation:Number(candidate.reputation),proposerScandal:Number(candidate.scandal),selfTarget:family.id===candidate.family_id});
      ranked.push({candidateId:candidate.id,candidateFamilyId:candidate.family_id,score});
    }
    ranked.sort((left,right)=>right.score-left.score||left.candidateId.localeCompare(right.candidateId));
    const selected=ranked[0]!;
    const influenceSpent=Math.min(Number(family.political_influence),selected.score>=35?2:0);
    const seatWeight=Math.max(1,Number(family.senate_seats));
    await client.query(
      `INSERT INTO roman_election_ballots(election_id,voter_family_id,candidate_id,seat_weight,influence_spent,total_weight,voted_by)
       VALUES($1,$2,$3,$4,$5,$6,'NPC')`,
      [election.id,family.id,selected.candidateId,seatWeight,influenceSpent,seatWeight+influenceSpent]
    );
    if(influenceSpent)await client.query("UPDATE roman_families SET political_influence=political_influence-$2 WHERE id=$1",[family.id,influenceSpent]);
    await adjustRelation(client,{republicId,left:family.id,right:selected.candidateFamilyId,turn,score:2,trust:1,rivalry:0,
      reason:"Konsül seçiminde destek verdi",details:{electionId:election.id,candidateId:selected.candidateId,npcScore:selected.score}});
  }
}

export const romanPoliticsService={
  async view(guildId:string,countryId:string){const client=await pool.connect();try{return await viewWithClient(client,guildId,countryId);}finally{client.release();}},

  async proposeLaw(input:{guildId:string;countryId:string;actorId:string;gameMaster:boolean;type:RomanProposalType;title:string;description:string}){
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const familyId=await actingFamily(client,republic.id,input.actorId,input.gameMaster,republic.current_consul_family_id);
      const family=await familyByValue(client,republic.id,familyId);const definition=ROMAN_SENATE_PROPOSALS[input.type];
      if(!family||!definition)throw new GameError("Geçersiz Roma siyasi ailesi veya teklif türü.");
      if(Number(family.political_influence)<definition.cost)throw new GameError(`Bu teklif için ${definition.cost} siyasi nüfuz gerekir.`);
      if(input.title.trim().length<2||input.title.trim().length>100||input.description.trim().length<2||input.description.trim().length>1000){
        throw new GameError("Teklif başlığı 2-100, açıklaması 2-1000 karakter olmalıdır.");
      }
      const duplicate=await client.query(
        `SELECT 1 FROM roman_senate_proposals WHERE republic_id=$1 AND status='OPEN'
          AND (proposal_type=$2 OR lower(title)=lower($3))`,[republic.id,input.type,input.title.trim()]
      );
      if(duplicate.rowCount)throw new GameError("Aynı türde veya aynı başlıkta açık bir Senato teklifi zaten bulunuyor.");
      const turn=await currentTurn(client,input.guildId);
      const proposal=(await client.query<{id:string}>(
        `INSERT INTO roman_senate_proposals(republic_id,proposed_by_family_id,proposal_type,category,title,description,influence_cost,
          threshold_percent,opened_turn,closes_turn,duration_turns)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [republic.id,family.id,input.type,definition.category,input.title.trim(),input.description.trim(),definition.cost,
          definition.threshold,turn,turn+1,definition.duration]
      )).rows[0]!;
      await client.query("UPDATE roman_families SET political_influence=political_influence-$2 WHERE id=$1",[family.id,definition.cost]);
      await client.query(`INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,influence_delta,description,details)
        VALUES($1,$2,'SENATE_PROPOSAL',$3,$4,$5::jsonb)`,[family.id,turn,-definition.cost,`${input.title} Senatoya sunuldu`,JSON.stringify({proposalId:proposal.id,type:input.type})]);
      return await viewWithClient(client,input.guildId,input.countryId);
    });
  },

  async proposeOffice(input:{guildId:string;countryId:string;actorId:string;gameMaster:boolean;officeKey:RomanOfficeKey;characterName:string}){
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const familyId=await actingFamily(client,republic.id,input.actorId,input.gameMaster,republic.current_consul_family_id);
      const family=await familyByValue(client,republic.id,familyId);const office=ROMAN_OFFICES[input.officeKey];
      if(!family||!office)throw new GameError("Geçersiz makam veya siyasi aile.");
      const characterName=input.characterName.trim();if(characterName.length<2||characterName.length>80)throw new GameError("Aday adı 2-80 karakter olmalıdır.");
      const rosterCount=Number((await client.query<{count:number}>("SELECT COUNT(*)::int AS count FROM roman_family_members WHERE family_id=$1 AND status='ALIVE'",[family.id])).rows[0]?.count??0);
      if(rosterCount){
        const rosterMember=await client.query("SELECT 1 FROM roman_family_members WHERE family_id=$1 AND status='ALIVE' AND lower(name)=lower($2)",[family.id,characterName]);
        if(!rosterMember.rowCount)throw new GameError("Makam adayı bu siyasi ailenin yaşayan üye kadrosunda bulunmuyor.");
      }
      if(Number(family.political_influence)<office.cost)throw new GameError(`Bu makam adaylığı için ${office.cost} siyasi nüfuz gerekir.`);
      const occupied=await client.query("SELECT 1 FROM roman_office_holders WHERE republic_id=$1 AND office_key=$2 AND status='ACTIVE'",[republic.id,input.officeKey]);
      if(occupied.rowCount)throw new GameError("Bu Roma makamında hâlen görev yapan bir isim bulunuyor.");
      const activeCharacter=await client.query("SELECT 1 FROM roman_office_holders WHERE republic_id=$1 AND lower(character_name)=lower($2) AND status='ACTIVE'",[republic.id,characterName]);
      if(activeCharacter.rowCount)throw new GameError("Bu karakter hâlen başka bir Roma makamında görev yapıyor.");
      if(office.prerequisite){
        const prerequisite=await client.query(
          "SELECT 1 FROM roman_office_holders WHERE family_id=$1 AND lower(character_name)=lower($2) AND office_key=$3 AND status IN ('ACTIVE','COMPLETED')",
          [family.id,characterName,office.prerequisite]
        );
        if(!prerequisite.rowCount)throw new GameError(`${office.label} adaylığı için karakterin önce ${ROMAN_OFFICES[office.prerequisite].label} görevinde bulunmuş olması gerekir.`);
      }
      const turn=await currentTurn(client,input.guildId);
      await client.query(
        `INSERT INTO roman_senate_proposals(republic_id,proposed_by_family_id,proposal_type,category,title,description,influence_cost,
          threshold_percent,opened_turn,closes_turn,duration_turns,target_family_id,target_character_name,office_key)
         VALUES($1,$2,'OFFICE_APPOINTMENT','ADMINISTRATION',$3,$4,$5,51,$6,$7,$8,$2,$9,$10)`,
        [republic.id,family.id,`${office.label}: ${characterName}`,`${characterName} adlı aile üyesinin ${office.label} makamına seçilmesi.`,office.cost,
          turn,turn+1,office.duration,characterName,input.officeKey]
      );
      await client.query("UPDATE roman_families SET political_influence=political_influence-$2 WHERE id=$1",[family.id,office.cost]);
      return await viewWithClient(client,input.guildId,input.countryId);
    });
  },

  async vote(input:{guildId:string;countryId:string;actorId:string;gameMaster:boolean;proposal:string;choice:VoteChoice;influenceSpend:number}){
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const familyId=await actingFamily(client,republic.id,input.actorId,input.gameMaster,republic.current_consul_family_id);
      const family=await familyByValue(client,republic.id,familyId);if(!family)throw new GameError("Siyasi aile bulunamadı.");
      const proposal=(await client.query<{id:string;title:string}>(
        `SELECT id,title FROM roman_senate_proposals WHERE republic_id=$1 AND status='OPEN' AND (id::text=$2 OR lower(title)=lower($2))`,
        [republic.id,input.proposal.trim()]
      )).rows[0];
      if(!proposal)throw new GameError("Açık Senato teklifi bulunamadı.");
      if(input.influenceSpend<0||input.influenceSpend>ROMAN_BALLOT_INFLUENCE_CAP)throw new GameError("Senato lobisi için 0-10 nüfuz harcanabilir.");
      if(input.choice==="ABSTAIN"&&input.influenceSpend)throw new GameError("Çekimser oy için nüfuz harcanamaz.");
      if(Number(family.political_influence)<input.influenceSpend)throw new GameError("Ailenin yeterli siyasi nüfuzu yok.");
      const existing=await client.query("SELECT 1 FROM roman_senate_votes WHERE proposal_id=$1 AND family_id=$2",[proposal.id,family.id]);
      if(existing.rowCount)throw new GameError("Bu aile söz konusu teklifte oyunu zaten kullandı.");
      const seatWeight=Number(family.senate_seats);const totalWeight=input.choice==="ABSTAIN"?0:seatWeight+input.influenceSpend;
      await client.query(`INSERT INTO roman_senate_votes(proposal_id,family_id,choice,seat_weight,influence_spent,total_weight,voted_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[proposal.id,family.id,input.choice,seatWeight,input.influenceSpend,totalWeight,input.actorId]);
      if(input.influenceSpend)await client.query("UPDATE roman_families SET political_influence=political_influence-$2 WHERE id=$1",[family.id,input.influenceSpend]);
      return await viewWithClient(client,input.guildId,input.countryId);
    });
  },

  async resolve(input:{guildId:string;countryId:string;actorId:string;proposal:string}){
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const proposal=(await client.query<{id:string}>(
        "SELECT id FROM roman_senate_proposals WHERE republic_id=$1 AND status='OPEN' AND (id::text=$2 OR lower(title)=lower($2))",
        [republic.id,input.proposal.trim()]
      )).rows[0];if(!proposal)throw new GameError("Açık Senato teklifi bulunamadı.");
      const turn=await currentTurn(client,input.guildId);const result=await resolveSenateProposalWithClient(client,proposal.id,turn,input.actorId);
      return{result,view:await viewWithClient(client,input.guildId,input.countryId)};
    });
  },

  async familyAction(input:{guildId:string;countryId:string;actorId:string;gameMaster:boolean;targetFamily:string;action:RomanRelationAction}){
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const familyId=await actingFamily(client,republic.id,input.actorId,input.gameMaster,republic.current_consul_family_id);
      const family=await familyByValue(client,republic.id,familyId);const target=await familyByValue(client,republic.id,input.targetFamily);
      const definition=ROMAN_RELATION_ACTIONS[input.action];if(!family||!target||!definition)throw new GameError("Aile veya siyasi eylem bulunamadı.");
      if(family.id===target.id)throw new GameError("Bir aile kendisini hedefleyemez.");
      if(Number(family.treasury)<definition.treasuryCost||Number(family.political_influence)<definition.influenceCost)throw new GameError("Aile bu siyasi eylemin maliyetini karşılayamıyor.");
      const turn=await currentTurn(client,input.guildId);
      const used=await client.query("SELECT 1 FROM roman_family_action_runs WHERE family_id=$1 AND game_turn=$2",[family.id,turn]);
      if(used.rowCount)throw new GameError("Her siyasi aile bir turda yalnızca bir aile ilişkisi eylemi yapabilir.");
      await client.query("INSERT INTO roman_family_action_runs(family_id,game_turn,target_family_id,action_key) VALUES($1,$2,$3,$4)",[family.id,turn,target.id,input.action]);
      await client.query(`UPDATE roman_families SET treasury=treasury-$2,political_influence=political_influence-$3,
        scandal=GREATEST(0,LEAST(100,scandal+$4)),updated_at=NOW() WHERE id=$1`,
      [family.id,definition.treasuryCost,definition.influenceCost,definition.scandalDelta]);
      await client.query(`INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,amount,influence_delta,actor_user_id,description,details)
        VALUES($1,$2,'FAMILY_RELATION_ACTION',$3,$4,$5,$6,$7::jsonb)`,
      [family.id,turn,-definition.treasuryCost,-definition.influenceCost,input.actorId,`${target.name}: ${definition.label}`,
        JSON.stringify({targetFamilyId:target.id,action:input.action})]);
      await adjustRelation(client,{republicId:republic.id,left:family.id,right:target.id,turn,score:definition.scoreDelta,
        trust:definition.trustDelta,rivalry:definition.rivalryDelta,reason:definition.label,details:{action:input.action,actorId:input.actorId}});
      return await viewWithClient(client,input.guildId,input.countryId);
    });
  },

  async adjustStanding(input:{guildId:string;countryId:string;actorId:string;family:string;reputationDelta:number;scandalDelta:number;reason:string}){
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const family=await familyByValue(client,republic.id,input.family);if(!family)throw new GameError("Siyasi aile bulunamadı.");
      await client.query(`UPDATE roman_families SET reputation=GREATEST(0,LEAST(100,reputation+$2)),
        scandal=GREATEST(0,LEAST(100,scandal+$3)),updated_at=NOW() WHERE id=$1`,[family.id,input.reputationDelta,input.scandalDelta]);
      await client.query(`INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
        VALUES($1,$2,'ROMAN_FAMILY_STANDING_ADJUST','roman_family',$3,$4::jsonb)`,
      [input.guildId,input.actorId,family.id,JSON.stringify({reputationDelta:input.reputationDelta,scandalDelta:input.scandalDelta,reason:input.reason})]);
      return await viewWithClient(client,input.guildId,input.countryId);
    });
  }
};

export async function processRomanPoliticalTurn(client:DbClient,guildId:string,gameTurn:number,acquisition:boolean):Promise<RomanPoliticalTurnResult>{
  await client.query(`UPDATE roman_laws law SET status='EXPIRED',updated_at=NOW() FROM roman_republics republic
    WHERE law.republic_id=republic.id AND republic.guild_id=$1 AND law.status='ACTIVE' AND law.end_turn<$2`,[guildId,gameTurn]);
  await client.query(`UPDATE roman_office_holders holder SET status='COMPLETED',updated_at=NOW() FROM roman_republics republic
    WHERE holder.republic_id=republic.id AND republic.guild_id=$1 AND holder.status='ACTIVE' AND holder.end_turn<$2`,[guildId,gameTurn]);
  const proposalResults=[] as RomanPoliticalTurnResult["proposalResults"];
  const due=(await client.query<{id:string}>(`SELECT proposal.id FROM roman_senate_proposals proposal
    JOIN roman_republics republic ON republic.id=proposal.republic_id
    WHERE republic.guild_id=$1 AND proposal.status='OPEN' AND proposal.closes_turn<$2 ORDER BY proposal.created_at FOR UPDATE OF proposal`,[guildId,gameTurn])).rows;
  for(const proposal of due)proposalResults.push(await resolveSenateProposalWithClient(client,proposal.id,gameTurn,null));

  const officeYields=[] as RomanPoliticalTurnResult["officeYields"];
  const offices=(await client.query<{id:string;family_id:string;family_name:string;character_name:string;office_key:RomanOfficeKey;end_turn:number}>(`
    SELECT holder.id,holder.family_id,family.name AS family_name,holder.character_name,holder.office_key,holder.end_turn
      FROM roman_office_holders holder JOIN roman_republics republic ON republic.id=holder.republic_id
      JOIN roman_families family ON family.id=holder.family_id
     WHERE republic.guild_id=$1 AND holder.status='ACTIVE' AND holder.end_turn>=$2 FOR UPDATE OF holder,family`,[guildId,gameTurn])).rows;
  for(const holder of offices){
    const office=ROMAN_OFFICES[holder.office_key];const reputation=office.reputationPerTurn;const scandal=-office.scandalRecovery;
    const claimed=await client.query(`INSERT INTO roman_office_turn_runs(office_holder_id,game_turn,treasury_income,influence_gain,reputation_delta,scandal_delta)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING office_holder_id`,
    [holder.id,gameTurn,office.treasuryPerTurn,office.influencePerTurn,reputation,scandal]);
    if(!claimed.rowCount)continue;
    await client.query(`UPDATE roman_families SET treasury=treasury+$2,political_influence=political_influence+$3,
      reputation=GREATEST(0,LEAST(100,reputation+$4)),scandal=GREATEST(0,LEAST(100,scandal+$5)),updated_at=NOW() WHERE id=$1`,
    [holder.family_id,office.treasuryPerTurn,office.influencePerTurn,reputation,scandal]);
    const completed=Number(holder.end_turn)===gameTurn;if(completed)await client.query("UPDATE roman_office_holders SET status='COMPLETED',updated_at=NOW() WHERE id=$1",[holder.id]);
    officeYields.push({familyName:holder.family_name,characterName:holder.character_name,officeLabel:office.label,
      treasury:office.treasuryPerTurn,influence:office.influencePerTurn,reputation,scandal,completed});
  }

  const lawEffects=[] as RomanPoliticalTurnResult["lawEffects"];
  const laws=(await client.query<{id:string;republic_id:string;country_id:string;country_name:string;current_consul_family_id:string|null;law_key:RomanProposalType;title:string}>(`
    SELECT law.id,law.republic_id,republic.country_id,country.name AS country_name,republic.current_consul_family_id,law.law_key,law.title
      FROM roman_laws law JOIN roman_republics republic ON republic.id=law.republic_id JOIN countries country ON country.id=republic.country_id
     WHERE republic.guild_id=$1 AND law.status='ACTIVE' AND law.started_turn<=$2 AND law.end_turn>=$2`,[guildId,gameTurn])).rows;
  for(const law of laws){
    const claimed=await client.query("INSERT INTO roman_law_turn_runs(law_id,game_turn) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING law_id",[law.id,gameTurn]);
    if(!claimed.rowCount)continue;
    let summary="Yasa yürürlükte.";
    if(law.law_key==="MILITARY_BUDGET"){
      await client.query("UPDATE countries SET war_exhaustion=GREATEST(0,war_exhaustion-1) WHERE id=$1",[law.country_id]);summary="Savaş yorgunluğu 1 azaltıldı.";
    }else if(law.law_key==="LAND_REFORM"){
      await client.query("UPDATE settlements SET prosperity=LEAST(100,prosperity+2) WHERE country_id=$1 AND rebellion_active=FALSE",[law.country_id]);summary="Roma yerleşkelerine +2 refah uygulandı.";
    }else if(law.law_key==="GRAIN_DISTRIBUTION"){
      await client.query("UPDATE settlements SET rebellion_progress=GREATEST(0,rebellion_progress-3) WHERE country_id=$1",[law.country_id]);summary="Roma yerleşkelerinde isyan gerilimi 3 azaltıldı.";
    }else if(law.law_key==="EMERGENCY_POWERS"&&law.current_consul_family_id){
      await client.query("UPDATE roman_families SET political_influence=political_influence+2,scandal=LEAST(100,scandal+1) WHERE id=$1",[law.current_consul_family_id]);summary="Konsül ailesi +2 nüfuz ve +1 skandal aldı.";
    }else if(law.law_key==="TRADE_PRIVILEGE"&&acquisition){
      const settlements=(await client.query<{id:string;amount:number;local_treasury:number}>(`SELECT settlement.id,ledger.amount,settlement.local_treasury
        FROM transactions ledger JOIN settlements settlement ON settlement.id=ledger.settlement_id
        WHERE ledger.country_id=$1 AND ledger.turn=$2 AND ledger.kind='ACQUISITION_SETTLEMENT' AND ledger.amount>0`,[law.country_id,gameTurn])).rows;
      let total=0;for(const settlement of settlements){const bonus=Math.floor(Number(settlement.amount)*0.05);if(!bonus)continue;total+=bonus;
        await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2",[bonus,settlement.id]);}
      if(total)await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",[law.country_id]);
      summary=`Ticaret gelirlerine ${total.toLocaleString("tr-TR")} Altın eklendi.`;
    }
    await client.query("UPDATE roman_law_turn_runs SET details=$3::jsonb WHERE law_id=$1 AND game_turn=$2",[law.id,gameTurn,JSON.stringify({summary})]);
    lawEffects.push({countryName:law.country_name,lawTitle:law.title,summary});
  }
  return{proposalResults,officeYields,lawEffects};
}
