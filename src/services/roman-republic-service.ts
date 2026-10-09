import { pool,withTransaction,type DbClient } from "../db/pool.js";
import {
  ROMAN_BALLOT_INFLUENCE_CAP,ROMAN_BUSINESSES,ROMAN_CANDIDACY_INFLUENCE_COST,
  ROMAN_ELECTION_WIN_INFLUENCE,ROMAN_FAMILY_SEAT_CAP,ROMAN_GOVERNOR_FAMILY_CAP,
  ROMAN_GOVERNOR_TERM_LENGTH,ROMAN_TERM_LENGTH,isRomanBusinessType,romanElectionBallotWeight,type RomanBusinessType,
  type RomanPoliticalBloc
} from "../domain/roman-republic.js";
import {ensureNpcElectionParticipation,recordRomanElectionSupport} from "./roman-politics-service.js";
import {renewRomanSenateSeats,type RomanSenateRenewalResult} from "./roman-senate-seat-service.js";
import { GameError } from "./game-service.js";
import {DEFAULT_ROMAN_FAMILIES,DEFAULT_ROMAN_NPC_MEMBERS} from "../domain/roman-family-seed.js";

export interface RomanFamilyView {
  id:string;name:string;treasury:number;politicalInfluence:number;senateSeats:number;
  reputation:number;scandal:number;politicalBloc:RomanPoliticalBloc;
  leaderUserId:string|null;playerIds:string[];isConsulFamily:boolean;
  members:RomanFamilyMemberView[];
  businesses:Array<{id:string;type:RomanBusinessType;settlementName:string;turnIncome:number;acquiredTurn:number}>;
}

export interface RomanFamilyMemberView {
  id:string;name:string;gender:"MALE"|"FEMALE";age:number;
  position:"HEAD"|"SPOUSE"|"CHILD"|"HEAD_SIBLING"|"SPOUSE_SIBLING";
  relation:string;spouseName:string|null;motherName:string|null;fatherName:string|null;
}

export interface RomanRepublicView {
  id:string;countryId:string;countryName:string;currentTurn:number;termLength:number;
  termStartedTurn:number|null;nextElectionTurn:number|null;currentConsulFamilyId:string|null;
  senateTotalSeats:number;familySeatCap:number;families:RomanFamilyView[];
  politicsChannelId:string|null;politicsMessageId:string|null;
  election:RomanElectionView|null;
  governorships:RomanGovernorshipView[];
}

export interface RomanElectionView {
  id:string;sequence:number;startedTurn:number;closesTurn:number;status:"OPEN"|"COMPLETED"|"CANCELLED";
  winnerFamilyId:string|null;
  candidates:Array<{id:string;familyId:string;familyName:string;candidateName:string;nominationCost:number;votes:number;seatWeight:number;influenceSupport:number}>;
  votedFamilyIds:string[];
}

export interface RomanGovernorshipView {
  id:string;settlementId:string;settlementName:string;familyId:string;familyName:string;
  governorName:string;appointedTurn:number;endTurn:number;status:"ACTIVE"|"COMPLETED"|"REMOVED";
  totalTreasuryIncome:number;totalInfluence:number;
}

async function audit(client:DbClient,guildId:string,actorId:string,action:string,entityType:string,entityId:string|null,details:unknown){
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId,actorId,action,entityType,entityId,JSON.stringify(details)]
  );
}

async function currentTurn(client:DbClient,guildId:string):Promise<number>{
  const row=(await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[guildId])).rows[0];
  if(!row)throw new GameError("Sunucu oyun ayarları bulunamadı.");
  return Number(row.current_turn);
}

async function republicRow(client:DbClient,guildId:string,countryId?:string){
  return (await client.query<{
    id:string;country_id:string;country_name:string;term_length:number;current_consul_family_id:string|null;
    term_started_turn:number|null;next_election_turn:number|null;current_turn:number;
    senate_total_seats:number;family_seat_cap:number;politics_channel_id:string|null;politics_message_id:string|null;
  }>(`
    SELECT republic.id,republic.country_id,country.name AS country_name,republic.term_length,
           republic.current_consul_family_id,republic.term_started_turn,republic.next_election_turn,guild.current_turn,
           republic.senate_total_seats,republic.family_seat_cap,republic.politics_channel_id,republic.politics_message_id
      FROM roman_republics republic
      JOIN countries country ON country.id=republic.country_id
      JOIN guilds guild ON guild.discord_id=republic.guild_id
     WHERE republic.guild_id=$1 AND republic.status='ACTIVE'${countryId?" AND republic.country_id=$2":""}
     LIMIT 1`,countryId?[guildId,countryId]:[guildId])).rows[0]??null;
}

async function familyRow(client:DbClient,republicId:string,value:string){
  return (await client.query<{
    id:string;name:string;treasury:number;political_influence:number;senate_seats:number;leader_user_id:string|null;
  }>(`SELECT id,name,treasury,political_influence,senate_seats,leader_user_id
        FROM roman_families WHERE republic_id=$1 AND status='ACTIVE'
          AND (id::text=$2 OR LOWER(name)=LOWER($2)) LIMIT 1`,[republicId,value.trim()])).rows[0]??null;
}

async function leaderFamily(client:DbClient,republicId:string,userId:string,gameMaster=false){
  const membership=(await client.query<{family_id:string;is_leader:boolean}>(
    `SELECT family_id,is_leader FROM roman_family_players
      WHERE republic_id=$1 AND discord_user_id=$2 AND status='ACTIVE'`,[republicId,userId]
  )).rows[0];
  if(!membership&&!gameMaster)throw new GameError("Bir Roma siyasi ailesine atanmış değilsiniz.");
  if(membership&&!membership.is_leader&&!gameMaster)throw new GameError("Bu işlemi yalnızca siyasi aile lideri yapabilir.");
  return membership?.family_id??null;
}

async function viewWithClient(client:DbClient,guildId:string,countryId?:string):Promise<RomanRepublicView|null>{
  const republic=await republicRow(client,guildId,countryId);
  if(!republic)return null;
  const families=(await client.query<{
    id:string;name:string;treasury:number;political_influence:number;senate_seats:number;leader_user_id:string|null;
    reputation:number;scandal:number;political_bloc:RomanPoliticalBloc;
  }>("SELECT id,name,treasury,political_influence,senate_seats,leader_user_id,reputation,scandal,political_bloc FROM roman_families WHERE republic_id=$1 AND status='ACTIVE' ORDER BY political_influence DESC,senate_seats DESC,name",[republic.id])).rows;
  const players=(await client.query<{family_id:string;discord_user_id:string}>(
    "SELECT family_id,discord_user_id FROM roman_family_players WHERE republic_id=$1 AND status='ACTIVE' ORDER BY created_at",[republic.id]
  )).rows;
  const businesses=(await client.query<{
    id:string;family_id:string;business_type:RomanBusinessType;settlement_name:string;turn_income:number;acquired_turn:number;
  }>(`SELECT business.id,business.family_id,business.business_type,settlement.name AS settlement_name,
             business.turn_income,business.acquired_turn
        FROM roman_family_businesses business
        JOIN roman_families family ON family.id=business.family_id
        JOIN settlements settlement ON settlement.id=business.settlement_id
       WHERE family.republic_id=$1 AND business.status='ACTIVE'
       ORDER BY business.acquired_turn,business.created_at`,[republic.id])).rows;
  const members=(await client.query<{
    id:string;family_id:string;name:string;gender:"MALE"|"FEMALE";age:number;
    position:"HEAD"|"SPOUSE"|"CHILD"|"HEAD_SIBLING"|"SPOUSE_SIBLING";relation:string;
    spouse_name:string|null;mother_name:string|null;father_name:string|null;
  }>(`SELECT member.id,member.family_id,member.name,member.gender,member.age,member.position,member.relation,
             spouse.name AS spouse_name,mother.name AS mother_name,father.name AS father_name
        FROM roman_family_members member
        JOIN roman_families family ON family.id=member.family_id
        LEFT JOIN roman_family_members spouse ON spouse.id=member.spouse_id
        LEFT JOIN roman_family_members mother ON mother.id=member.mother_id
        LEFT JOIN roman_family_members father ON father.id=member.father_id
       WHERE family.republic_id=$1 AND member.status='ALIVE'
       ORDER BY family.name,member.sort_order,member.age DESC`,[republic.id])).rows;
  const electionRow=(await client.query<{
    id:string;sequence:number;started_turn:number;closes_turn:number;status:"OPEN"|"COMPLETED"|"CANCELLED";winner_family_id:string|null;
  }>(`SELECT id,sequence,started_turn,closes_turn,status,winner_family_id
        FROM roman_elections WHERE republic_id=$1 ORDER BY sequence DESC LIMIT 1`,[republic.id])).rows[0]??null;
  let election:RomanElectionView|null=null;
  if(electionRow){
    const candidates=(await client.query<{
      id:string;family_id:string;family_name:string;candidate_name:string;nomination_cost:number;
      votes:number;seat_weight:number;influence_support:number;
    }>(`SELECT candidate.id,candidate.family_id,family.name AS family_name,candidate.candidate_name,candidate.nomination_cost,
               COUNT(ballot.voter_family_id)::int AS votes,COALESCE(SUM(ballot.seat_weight),0)::int AS seat_weight,
               COALESCE(SUM(ballot.influence_spent),0)::int AS influence_support
          FROM roman_election_candidates candidate
          JOIN roman_families family ON family.id=candidate.family_id
          LEFT JOIN roman_election_ballots ballot ON ballot.candidate_id=candidate.id
         WHERE candidate.election_id=$1
         GROUP BY candidate.id,family.name ORDER BY COALESCE(SUM(ballot.total_weight),0) DESC,family.name`,[electionRow.id])).rows;
    const ballots=(await client.query<{voter_family_id:string}>(
      "SELECT voter_family_id FROM roman_election_ballots WHERE election_id=$1",[electionRow.id]
    )).rows;
    election={
      id:electionRow.id,sequence:Number(electionRow.sequence),startedTurn:Number(electionRow.started_turn),
      closesTurn:Number(electionRow.closes_turn),status:electionRow.status,winnerFamilyId:electionRow.winner_family_id,
      candidates:candidates.map((candidate)=>({
        id:candidate.id,familyId:candidate.family_id,familyName:candidate.family_name,candidateName:candidate.candidate_name,
        nominationCost:Number(candidate.nomination_cost),votes:Number(candidate.votes),seatWeight:Number(candidate.seat_weight),
        influenceSupport:Number(candidate.influence_support)
      })),votedFamilyIds:ballots.map((ballot)=>ballot.voter_family_id)
    };
  }
  const governorshipRows=(await client.query<{
    id:string;settlement_id:string;settlement_name:string;family_id:string;family_name:string;governor_name:string;
    appointed_turn:number;end_turn:number;status:"ACTIVE"|"COMPLETED"|"REMOVED";total_treasury_income:number;total_influence:number;
  }>(`SELECT governorship.id,governorship.settlement_id,settlement.name AS settlement_name,
             governorship.family_id,family.name AS family_name,governorship.governor_name,
             governorship.appointed_turn,governorship.end_turn,governorship.status,
             COALESCE(SUM(run.treasury_share),0)::bigint AS total_treasury_income,
             COALESCE(SUM(run.influence_gain),0)::int AS total_influence
        FROM roman_governorships governorship
        JOIN settlements settlement ON settlement.id=governorship.settlement_id
        JOIN roman_families family ON family.id=governorship.family_id
        LEFT JOIN roman_governorship_income_runs run ON run.governorship_id=governorship.id
       WHERE governorship.republic_id=$1
       GROUP BY governorship.id,settlement.name,family.name
       ORDER BY CASE governorship.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,settlement.name`,[republic.id])).rows;
  return{
    id:republic.id,countryId:republic.country_id,countryName:republic.country_name,
    currentTurn:Number(republic.current_turn),termLength:Number(republic.term_length),
    termStartedTurn:republic.term_started_turn===null?null:Number(republic.term_started_turn),
    nextElectionTurn:republic.next_election_turn===null?null:Number(republic.next_election_turn),
    currentConsulFamilyId:republic.current_consul_family_id,
    senateTotalSeats:Number(republic.senate_total_seats),familySeatCap:Number(republic.family_seat_cap),
    politicsChannelId:republic.politics_channel_id,politicsMessageId:republic.politics_message_id,
    families:families.map((family)=>({
      id:family.id,name:family.name,treasury:Number(family.treasury),politicalInfluence:Number(family.political_influence),
      senateSeats:Number(family.senate_seats),leaderUserId:family.leader_user_id,
      reputation:Number(family.reputation),scandal:Number(family.scandal),politicalBloc:family.political_bloc,
      playerIds:players.filter((player)=>player.family_id===family.id).map((player)=>player.discord_user_id),
      isConsulFamily:republic.current_consul_family_id===family.id,
      members:members.filter((member)=>member.family_id===family.id).map((member)=>({
        id:member.id,name:member.name,gender:member.gender,age:Number(member.age),position:member.position,
        relation:member.relation,spouseName:member.spouse_name,motherName:member.mother_name,fatherName:member.father_name
      })),
      businesses:businesses.filter((business)=>business.family_id===family.id).map((business)=>({
        id:business.id,type:business.business_type,settlementName:business.settlement_name,
        turnIncome:Number(business.turn_income),acquiredTurn:Number(business.acquired_turn)
      }))
    })),
    election,
    governorships:governorshipRows.map((row)=>({
      id:row.id,settlementId:row.settlement_id,settlementName:row.settlement_name,familyId:row.family_id,
      familyName:row.family_name,governorName:row.governor_name,appointedTurn:Number(row.appointed_turn),
      endTurn:Number(row.end_turn),status:row.status,totalTreasuryIncome:Number(row.total_treasury_income),
      totalInfluence:Number(row.total_influence)
    }))
  };
}

async function seedDefaultRomanFamilies(client:DbClient,input:{
  republicId:string;guildId:string;actorId:string;turn:number;termLength:number;
}):Promise<void>{
  for(const seed of DEFAULT_ROMAN_FAMILIES){
    await client.query(
      `INSERT INTO roman_families(republic_id,name,treasury,political_influence,senate_seats,political_bloc)
       VALUES($1,$2,5000,$3,$4,$5)
       ON CONFLICT(republic_id,name) DO UPDATE SET
         senate_seats=EXCLUDED.senate_seats,
         political_influence=GREATEST(roman_families.political_influence,EXCLUDED.political_influence),
         political_bloc=EXCLUDED.political_bloc,
         updated_at=NOW()`,
      [input.republicId,seed.name,seed.influence,seed.seats,seed.bloc]
    );
  }

  const familyRows=(await client.query<{id:string;name:string}>(
    "SELECT id,name FROM roman_families WHERE republic_id=$1 AND status='ACTIVE'",[input.republicId]
  )).rows;
  const familyIds=new Map(familyRows.map((family)=>[family.name,family.id]));
  for(const member of DEFAULT_ROMAN_NPC_MEMBERS){
    const familyId=familyIds.get(member.familyName);
    if(!familyId)continue;
    await client.query(
      `INSERT INTO roman_family_members(family_id,name,gender,age,position,relation,sort_order)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(family_id,lower(name)) DO NOTHING`,
      [familyId,member.name,member.gender,member.age,member.position,member.relation,member.sortOrder]
    );
  }
  for(const member of DEFAULT_ROMAN_NPC_MEMBERS){
    if(!member.spouseKey&&!member.motherKey&&!member.fatherKey)continue;
    const familyId=familyIds.get(member.familyName);
    if(!familyId)continue;
    const familyMembers=DEFAULT_ROMAN_NPC_MEMBERS.filter((candidate)=>candidate.familyName===member.familyName);
    const nameFor=(key:string|undefined)=>familyMembers.find((candidate)=>candidate.key===key)?.name??null;
    await client.query(
      `UPDATE roman_family_members member SET
         spouse_id=spouse.id,mother_id=mother.id,father_id=father.id,updated_at=NOW()
       FROM roman_families family
       LEFT JOIN roman_family_members spouse ON spouse.family_id=family.id AND lower(spouse.name)=lower($3)
       LEFT JOIN roman_family_members mother ON mother.family_id=family.id AND lower(mother.name)=lower($4)
       LEFT JOIN roman_family_members father ON father.family_id=family.id AND lower(father.name)=lower($5)
       WHERE family.id=$1 AND member.family_id=family.id AND lower(member.name)=lower($2)`,
      [familyId,member.name,nameFor(member.spouseKey)??"",nameFor(member.motherKey)??"",nameFor(member.fatherKey)??""]
    );
  }

  await client.query(
    `INSERT INTO roman_family_relations(republic_id,family_a_id,family_b_id,score,trust,rivalry,last_reason)
     SELECT $1,left_family.id,right_family.id,
       CASE
         WHEN left_family.political_bloc=right_family.political_bloc THEN 15
         WHEN left_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND right_family.political_bloc='POPULARES' THEN -20
         WHEN right_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND left_family.political_bloc='POPULARES' THEN -20
         ELSE 0 END,
       CASE WHEN left_family.political_bloc=right_family.political_bloc THEN 60 ELSE 50 END,
       CASE
         WHEN left_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND right_family.political_bloc='POPULARES' THEN 15
         WHEN right_family.political_bloc IN ('OPTIMATES','TRADITIONALISTS') AND left_family.political_bloc='POPULARES' THEN 15
         ELSE 0 END,
       'Başlangıç siyasi hizip dengesi'
     FROM roman_families left_family
     JOIN roman_families right_family ON right_family.republic_id=left_family.republic_id AND left_family.id<right_family.id
     WHERE left_family.republic_id=$1 AND left_family.status='ACTIVE' AND right_family.status='ACTIVE'
     ON CONFLICT DO NOTHING`,[input.republicId]
  );

  const scipioId=familyIds.get("Scipio ailesi");
  if(scipioId){
    const updated=await client.query(
      `UPDATE roman_republics SET current_consul_family_id=$2,term_started_turn=$3,
         next_election_turn=$3+$4,updated_at=NOW()
       WHERE id=$1 AND current_consul_family_id IS NULL`,
      [input.republicId,scipioId,input.turn,input.termLength]
    );
    if(updated.rowCount){
      await client.query(
        `INSERT INTO roman_republic_events(republic_id,game_turn,event_type,actor_user_id,family_id,details)
         VALUES($1,$2,'INITIAL_CONSUL_SET',$3,$4,$5::jsonb)`,
        [input.republicId,input.turn,input.actorId,scipioId,JSON.stringify({familyName:"Scipio ailesi",nextElectionTurn:input.turn+input.termLength,automatic:true})]
      );
    }
  }
}

export const romanRepublicService={
  async view(guildId:string,countryId?:string):Promise<RomanRepublicView|null>{
    const client=await pool.connect();
    try{return await viewWithClient(client,guildId,countryId);}finally{client.release();}
  },

  async setup(input:{guildId:string;countryId:string;actorId:string;termLength?:number}):Promise<RomanRepublicView>{
    return withTransaction(async(client)=>{
      const country=(await client.query<{id:string;name:string}>(
        "SELECT id,name FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' FOR UPDATE",[input.countryId,input.guildId]
      )).rows[0];
      if(!country)throw new GameError("Etkin devlet bulunamadı.");
      const turn=await currentTurn(client,input.guildId);
      const termLength=input.termLength??ROMAN_TERM_LENGTH;
      const existing=(await client.query<{id:string}>(
        "SELECT id FROM roman_republics WHERE guild_id=$1 AND country_id=$2 FOR UPDATE",[input.guildId,input.countryId]
      )).rows[0];
      const republicId=existing?.id??(await client.query<{id:string}>(
        `INSERT INTO roman_republics(guild_id,country_id,term_length,next_election_turn)
         VALUES($1,$2,$3,$4) RETURNING id`,[input.guildId,input.countryId,termLength,turn+termLength]
      )).rows[0]!.id;
      await seedDefaultRomanFamilies(client,{republicId,guildId:input.guildId,actorId:input.actorId,turn,termLength});
      await audit(client,input.guildId,input.actorId,existing?"ROMAN_REPUBLIC_DEFAULTS_REPAIRED":"ROMAN_REPUBLIC_SETUP",
        "roman_republic",republicId,{countryId:country.id,termLength,familyCount:DEFAULT_ROMAN_FAMILIES.length});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async setPoliticsChannel(input:{guildId:string;countryId:string;actorId:string;channelId:string|null}):Promise<RomanRepublicView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      await client.query(`UPDATE roman_republics SET politics_channel_id=$2,politics_message_id=NULL,updated_at=NOW()
        WHERE id=$1`,[republic.id,input.channelId]);
      await audit(client,input.guildId,input.actorId,input.channelId?"ROMAN_POLITICS_CHANNEL_SET":"ROMAN_POLITICS_CHANNEL_CLEAR",
        "roman_republic",republic.id,{channelId:input.channelId});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async setPoliticsMessage(input:{guildId:string;countryId:string;channelId:string;messageId:string}):Promise<void>{
    await pool.query(`UPDATE roman_republics SET politics_message_id=$3,updated_at=NOW()
      WHERE guild_id=$1 AND country_id=$2 AND politics_channel_id=$4`,[input.guildId,input.countryId,input.messageId,input.channelId]);
  },

  async publicPanelTargets(guildId:string):Promise<Array<{countryId:string;channelId:string}>>{
    const rows=await pool.query<{country_id:string;politics_channel_id:string}>(`SELECT country_id,politics_channel_id
      FROM roman_republics WHERE guild_id=$1 AND status='ACTIVE' AND politics_channel_id IS NOT NULL`,[guildId]);
    return rows.rows.map((row)=>({countryId:row.country_id,channelId:row.politics_channel_id}));
  },

  async addFamily(input:{guildId:string;countryId:string;actorId:string;name:string;treasury:number;influence:number;seats:number}):Promise<RomanFamilyView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Önce bu devlet için /roma-yonetim kur komutunu kullanın.");
      const name=input.name.trim();
      if(name.length<2||name.length>80)throw new GameError("Aile adı 2-80 karakter olmalıdır.");
      if(input.seats>Number(republic.family_seat_cap))throw new GameError(`Bir siyasi aile en fazla ${republic.family_seat_cap} Senato koltuğuna sahip olabilir.`);
      const allocated=Number((await client.query<{total:number}>(
        "SELECT COALESCE(SUM(senate_seats),0)::int AS total FROM roman_families WHERE republic_id=$1 AND status='ACTIVE'",[republic.id]
      )).rows[0]?.total??0);
      if(allocated+input.seats>Number(republic.senate_total_seats))throw new GameError(`Senatoda yalnızca ${Number(republic.senate_total_seats)-allocated} boş koltuk kaldı.`);
      const row=(await client.query<{id:string}>(
        `INSERT INTO roman_families(republic_id,name,treasury,political_influence,senate_seats)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [republic.id,name,input.treasury,input.influence,input.seats]
      )).rows[0]!;
      if(!republic.current_consul_family_id&&["scipio ailesi","scipio"].includes(name.toLocaleLowerCase("tr-TR"))){
        const turn=await currentTurn(client,input.guildId);
        await client.query(`UPDATE roman_republics SET current_consul_family_id=$2,term_length=6,
          term_started_turn=$3,next_election_turn=$3+6,updated_at=NOW() WHERE id=$1`,[republic.id,row.id,turn]);
        await client.query(`INSERT INTO roman_republic_events(republic_id,game_turn,event_type,actor_user_id,family_id,details)
          VALUES($1,$2,'INITIAL_CONSUL_SET',$3,$4,$5::jsonb)`,[republic.id,turn,input.actorId,row.id,
          JSON.stringify({familyName:name,nextElectionTurn:turn+6,automatic:true})]);
      }
      await client.query(
        `INSERT INTO roman_family_relations(republic_id,family_a_id,family_b_id)
         SELECT $1,LEAST(existing.id,$2::uuid),GREATEST(existing.id,$2::uuid)
           FROM roman_families existing WHERE existing.republic_id=$1 AND existing.id<>$2
         ON CONFLICT DO NOTHING`,[republic.id,row.id]
      );
      await audit(client,input.guildId,input.actorId,"ROMAN_FAMILY_CREATE","roman_family",row.id,input);
      const view=(await viewWithClient(client,input.guildId,input.countryId))!;
      return view.families.find((family)=>family.id===row.id)!;
    });
  },

  async assignPlayer(input:{guildId:string;countryId:string;actorId:string;family:string;userId:string;leader:boolean}):Promise<RomanFamilyView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const family=await familyRow(client,republic.id,input.family);
      if(!family)throw new GameError("Siyasi aile bulunamadı.");
      const countryMember=await client.query("SELECT 1 FROM country_members WHERE country_id=$1 AND discord_user_id=$2",[input.countryId,input.userId]);
      if(!countryMember.rowCount)throw new GameError("Oyuncu önce bu devlete atanmış olmalıdır.");
      const turn=await currentTurn(client,input.guildId);
      await client.query(
        `INSERT INTO roman_family_players(republic_id,family_id,discord_user_id,is_leader,joined_turn,status)
         VALUES($1,$2,$3,$4,$5,'ACTIVE')
         ON CONFLICT(republic_id,discord_user_id) DO UPDATE SET family_id=EXCLUDED.family_id,is_leader=EXCLUDED.is_leader,status='ACTIVE',updated_at=NOW()`,
        [republic.id,family.id,input.userId,input.leader,turn]
      );
      if(input.leader){
        await client.query("UPDATE roman_family_players SET is_leader=FALSE WHERE family_id=$1 AND discord_user_id<>$2",[family.id,input.userId]);
        await client.query("UPDATE roman_families SET leader_user_id=$2,updated_at=NOW() WHERE id=$1",[family.id,input.userId]);
      }
      await audit(client,input.guildId,input.actorId,"ROMAN_FAMILY_PLAYER_ASSIGN","roman_family",family.id,{userId:input.userId,leader:input.leader});
      const view=(await viewWithClient(client,input.guildId,input.countryId))!;
      return view.families.find((item)=>item.id===family.id)!;
    });
  },

  async setConsulFamily(input:{guildId:string;countryId:string;actorId:string;family:string}):Promise<RomanRepublicView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const family=await familyRow(client,republic.id,input.family);
      if(!family)throw new GameError("Siyasi aile bulunamadı.");
      const turn=await currentTurn(client,input.guildId);
      await client.query(
        "UPDATE roman_republics SET current_consul_family_id=$2,term_started_turn=$3,next_election_turn=$3+term_length,updated_at=NOW() WHERE id=$1",
        [republic.id,family.id,turn]
      );
      await client.query(
        "INSERT INTO roman_republic_events(republic_id,game_turn,event_type,actor_user_id,family_id,details) VALUES($1,$2,'CONSUL_FAMILY_SET',$3,$4,$5::jsonb)",
        [republic.id,turn,input.actorId,family.id,JSON.stringify({familyName:family.name})]
      );
      await audit(client,input.guildId,input.actorId,"ROMAN_CONSUL_FAMILY_SET","roman_republic",republic.id,{familyId:family.id});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async adjustFamily(input:{guildId:string;countryId:string;actorId:string;family:string;treasuryDelta:number;influenceDelta:number;reason:string}):Promise<RomanFamilyView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const family=await familyRow(client,republic.id,input.family);
      if(!family)throw new GameError("Siyasi aile bulunamadı.");
      if(Number(family.treasury)+input.treasuryDelta<0)throw new GameError("Aile hazinesi sıfırın altına düşemez.");
      if(Number(family.political_influence)+input.influenceDelta<0)throw new GameError("Siyasi nüfuz sıfırın altına düşemez.");
      const turn=await currentTurn(client,input.guildId);
      await client.query(
        "UPDATE roman_families SET treasury=treasury+$2,political_influence=political_influence+$3,updated_at=NOW() WHERE id=$1",
        [family.id,input.treasuryDelta,input.influenceDelta]
      );
      await client.query(
        `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,amount,influence_delta,actor_user_id,description)
         VALUES($1,$2,'ADMIN_ADJUSTMENT',$3,$4,$5,$6)`,
        [family.id,turn,input.treasuryDelta,input.influenceDelta,input.actorId,input.reason]
      );
      await audit(client,input.guildId,input.actorId,"ROMAN_FAMILY_ADJUST","roman_family",family.id,input);
      const view=(await viewWithClient(client,input.guildId,input.countryId))!;
      return view.families.find((item)=>item.id===family.id)!;
    });
  },

  async purchaseBusiness(input:{guildId:string;countryId:string;actorId:string;businessType:string;settlement:string;gameMaster:boolean}):Promise<{family:RomanFamilyView;cost:number;influence:number}>{
    return withTransaction(async(client)=>{
      if(!isRomanBusinessType(input.businessType))throw new GameError("Geçersiz işletme türü.");
      const definition=ROMAN_BUSINESSES[input.businessType];
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Bu devlet Roma Cumhuriyeti aile sistemini kullanmıyor.");
      const membership=(await client.query<{family_id:string;is_leader:boolean}>(
        `SELECT family_id,is_leader FROM roman_family_players
          WHERE republic_id=$1 AND discord_user_id=$2 AND status='ACTIVE'`,[republic.id,input.actorId]
      )).rows[0];
      if(!membership&&!input.gameMaster)throw new GameError("Bir Roma siyasi ailesine atanmış değilsiniz.");
      const targetFamilyId=membership?.family_id??republic.current_consul_family_id;
      if(!targetFamilyId)throw new GameError("Yönetici alımı için önce konsül ailesini belirleyin.");
      const family=(await client.query<{id:string;name:string;treasury:number;political_influence:number;leader_user_id:string|null}>(
        "SELECT id,name,treasury,political_influence,leader_user_id FROM roman_families WHERE id=$1 AND republic_id=$2 AND status='ACTIVE' FOR UPDATE",
        [targetFamilyId,republic.id]
      )).rows[0];
      if(!family)throw new GameError("Siyasi aile bulunamadı.");
      if(!input.gameMaster&&family.leader_user_id!==input.actorId&&!membership?.is_leader){
        throw new GameError("Aile hazinesinden yalnızca siyasi aile lideri işletme satın alabilir.");
      }
      const count=Number((await client.query<{count:number}>(
        "SELECT COUNT(*)::int AS count FROM roman_family_businesses WHERE family_id=$1 AND business_type=$2 AND status='ACTIVE'",
        [family.id,input.businessType]
      )).rows[0]?.count??0);
      if(count>=definition.familyLimit)throw new GameError(`${definition.label} için aile başına ${definition.familyLimit} işletme sınırına ulaşıldı.`);
      if(Number(family.treasury)<definition.purchaseCost)throw new GameError(`Aile hazinesinde ${definition.purchaseCost.toLocaleString("tr-TR")} Altın bulunmuyor.`);
      const settlement=(await client.query<{id:string;name:string}>(
        `SELECT id,name FROM settlements WHERE country_id=$1 AND (id::text=$2 OR LOWER(name)=LOWER($2)) LIMIT 1`,
        [input.countryId,input.settlement.trim()]
      )).rows[0];
      if(!settlement)throw new GameError("İşletmenin kurulacağı Roma yerleşkesi bulunamadı.");
      const turn=await currentTurn(client,input.guildId);
      const business=(await client.query<{id:string}>(
        `INSERT INTO roman_family_businesses(family_id,settlement_id,business_type,purchase_cost,turn_income,acquired_turn)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [family.id,settlement.id,input.businessType,definition.purchaseCost,definition.turnIncome,turn]
      )).rows[0]!;
      await client.query(
        "UPDATE roman_families SET treasury=treasury-$2,political_influence=political_influence+$3,updated_at=NOW() WHERE id=$1",
        [family.id,definition.purchaseCost,definition.influenceOnPurchase]
      );
      await client.query(
        `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,amount,influence_delta,business_id,actor_user_id,description,details)
         VALUES($1,$2,'BUSINESS_PURCHASE',$3,$4,$5,$6,$7,$8::jsonb)`,
        [family.id,turn,-definition.purchaseCost,definition.influenceOnPurchase,business.id,input.actorId,
          `${settlement.name} yerleşkesinde ${definition.label} satın alındı`,JSON.stringify({businessType:input.businessType,settlementId:settlement.id})]
      );
      await audit(client,input.guildId,input.actorId,"ROMAN_BUSINESS_PURCHASE","roman_family_business",business.id,{familyId:family.id,businessType:input.businessType,settlementId:settlement.id});
      const view=(await viewWithClient(client,input.guildId,input.countryId))!;
      return{family:view.families.find((item)=>item.id===family.id)!,cost:definition.purchaseCost,influence:definition.influenceOnPurchase};
    });
  },

  async setSenateSeats(input:{guildId:string;countryId:string;actorId:string;family:string;seats:number}):Promise<RomanRepublicView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const family=await familyRow(client,republic.id,input.family);
      if(!family)throw new GameError("Siyasi aile bulunamadı.");
      if(input.seats<0||input.seats>Number(republic.family_seat_cap))throw new GameError(`Aile koltuğu 0–${republic.family_seat_cap} arasında olmalıdır.`);
      const others=Number((await client.query<{total:number}>(
        "SELECT COALESCE(SUM(senate_seats),0)::int AS total FROM roman_families WHERE republic_id=$1 AND status='ACTIVE' AND id<>$2",
        [republic.id,family.id]
      )).rows[0]?.total??0);
      if(others+input.seats>Number(republic.senate_total_seats))throw new GameError(`Bu atamayla ${republic.senate_total_seats} koltukluk Senato sınırı aşılır.`);
      await client.query("UPDATE roman_families SET senate_seats=$2,updated_at=NOW() WHERE id=$1",[family.id,input.seats]);
      await audit(client,input.guildId,input.actorId,"ROMAN_SENATE_SEATS_SET","roman_family",family.id,{previous:Number(family.senate_seats),seats:input.seats});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async startElection(input:{guildId:string;countryId:string;actorId:string}):Promise<RomanElectionView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const open=await client.query("SELECT 1 FROM roman_elections WHERE republic_id=$1 AND status='OPEN'",[republic.id]);
      if(open.rowCount)throw new GameError("Zaten açık bir konsül seçimi bulunuyor.");
      const turn=await currentTurn(client,input.guildId);
      const sequence=Number((await client.query<{sequence:number}>(
        "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM roman_elections WHERE republic_id=$1",[republic.id]
      )).rows[0]?.sequence??1);
      const election=(await client.query<{id:string}>(
        `INSERT INTO roman_elections(republic_id,sequence,started_turn,closes_turn,started_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,[republic.id,sequence,turn,turn+1,input.actorId]
      )).rows[0]!;
      await client.query(
        "INSERT INTO roman_republic_events(republic_id,game_turn,event_type,actor_user_id,details) VALUES($1,$2,'ELECTION_OPENED',$3,$4::jsonb)",
        [republic.id,turn,input.actorId,JSON.stringify({electionId:election.id,sequence,closesTurn:turn+1})]
      );
      await audit(client,input.guildId,input.actorId,"ROMAN_ELECTION_START","roman_election",election.id,{sequence,turn});
      return (await viewWithClient(client,input.guildId,input.countryId))!.election!;
    });
  },

  async nominate(input:{guildId:string;countryId:string;actorId:string;candidateName:string;gameMaster:boolean}):Promise<RomanRepublicView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const election=(await client.query<{id:string}>(
        "SELECT id FROM roman_elections WHERE republic_id=$1 AND status='OPEN' FOR UPDATE",[republic.id]
      )).rows[0];
      if(!election)throw new GameError("Açık bir konsül seçimi bulunmuyor.");
      const memberFamilyId=await leaderFamily(client,republic.id,input.actorId,input.gameMaster);
      const familyId=memberFamilyId??republic.current_consul_family_id;
      if(!familyId)throw new GameError("Aday gösterilecek aile bulunamadı.");
      const family=(await client.query<{id:string;name:string;political_influence:number}>(
        "SELECT id,name,political_influence FROM roman_families WHERE id=$1 AND republic_id=$2 AND status='ACTIVE' FOR UPDATE",
        [familyId,republic.id]
      )).rows[0];
      if(!family)throw new GameError("Siyasi aile bulunamadı.");
      const existingNomination=await client.query(
        "SELECT 1 FROM roman_election_candidates WHERE election_id=$1 AND family_id=$2",[election.id,family.id]
      );
      if(existingNomination.rowCount)throw new GameError("Bu siyasi aile mevcut seçimde zaten bir konsül adayı gösterdi.");
      if(Number(family.political_influence)<ROMAN_CANDIDACY_INFLUENCE_COST)throw new GameError(`Adaylık için ${ROMAN_CANDIDACY_INFLUENCE_COST} siyasi nüfuz gerekir.`);
      const candidateName=input.candidateName.trim();
      if(candidateName.length<2||candidateName.length>80)throw new GameError("Aday adı 2-80 karakter olmalıdır.");
      const duplicateName=await client.query(
        "SELECT 1 FROM roman_election_candidates WHERE election_id=$1 AND LOWER(candidate_name)=LOWER($2)",[election.id,candidateName]
      );
      if(duplicateName.rowCount)throw new GameError("Bu adla bir konsül adayı zaten bulunuyor.");
      const candidate=(await client.query<{id:string}>(
        `INSERT INTO roman_election_candidates(election_id,family_id,candidate_name,nomination_cost,nominated_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [election.id,family.id,candidateName,ROMAN_CANDIDACY_INFLUENCE_COST,input.actorId]
      )).rows[0]!;
      const turn=await currentTurn(client,input.guildId);
      await client.query("UPDATE roman_families SET political_influence=political_influence-$2,updated_at=NOW() WHERE id=$1",[family.id,ROMAN_CANDIDACY_INFLUENCE_COST]);
      await client.query(
        `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,influence_delta,actor_user_id,description,details)
         VALUES($1,$2,'ELECTION_CANDIDACY',$3,$4,$5,$6::jsonb)`,
        [family.id,turn,-ROMAN_CANDIDACY_INFLUENCE_COST,input.actorId,`${candidateName} konsüllüğe aday gösterildi`,JSON.stringify({electionId:election.id,candidateId:candidate.id})]
      );
      await audit(client,input.guildId,input.actorId,"ROMAN_ELECTION_NOMINATE","roman_election_candidate",candidate.id,{familyId:family.id,candidateName});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async vote(input:{guildId:string;countryId:string;actorId:string;candidate:string;influenceSpend:number;gameMaster:boolean}):Promise<RomanRepublicView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const election=(await client.query<{id:string}>(
        "SELECT id FROM roman_elections WHERE republic_id=$1 AND status='OPEN' FOR UPDATE",[republic.id]
      )).rows[0];
      if(!election)throw new GameError("Açık bir konsül seçimi bulunmuyor.");
      const memberFamilyId=await leaderFamily(client,republic.id,input.actorId,input.gameMaster);
      const familyId=memberFamilyId??republic.current_consul_family_id;
      if(!familyId)throw new GameError("Oy kullanacak aile bulunamadı.");
      const family=(await client.query<{id:string;name:string;political_influence:number;senate_seats:number}>(
        "SELECT id,name,political_influence,senate_seats FROM roman_families WHERE id=$1 AND republic_id=$2 AND status='ACTIVE' FOR UPDATE",
        [familyId,republic.id]
      )).rows[0];
      if(!family)throw new GameError("Siyasi aile bulunamadı.");
      const existingBallot=await client.query(
        "SELECT 1 FROM roman_election_ballots WHERE election_id=$1 AND voter_family_id=$2",[election.id,family.id]
      );
      if(existingBallot.rowCount)throw new GameError("Bu siyasi aile mevcut seçimde oyunu zaten kullandı.");
      if(input.influenceSpend<0||input.influenceSpend>ROMAN_BALLOT_INFLUENCE_CAP)throw new GameError(`Oy desteği için 0–${ROMAN_BALLOT_INFLUENCE_CAP} nüfuz harcanabilir.`);
      if(Number(family.political_influence)<input.influenceSpend)throw new GameError("Ailenin bu oy desteğini karşılayacak siyasi nüfuzu yok.");
      const candidate=(await client.query<{id:string;candidate_name:string;family_id:string}>(
        `SELECT id,candidate_name,family_id FROM roman_election_candidates
          WHERE election_id=$1 AND (id::text=$2 OR LOWER(candidate_name)=LOWER($2)) LIMIT 1`,[election.id,input.candidate.trim()]
      )).rows[0];
      if(!candidate)throw new GameError("Seçimde böyle bir konsül adayı bulunmuyor.");
      const seatWeight=Math.max(1,Number(family.senate_seats));
      const totalWeight=romanElectionBallotWeight(Number(family.senate_seats),input.influenceSpend);
      await client.query(
        `INSERT INTO roman_election_ballots(election_id,voter_family_id,candidate_id,seat_weight,influence_spent,total_weight,voted_by)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [election.id,family.id,candidate.id,seatWeight,input.influenceSpend,totalWeight,input.actorId]
      );
      if(input.influenceSpend){
        const turn=await currentTurn(client,input.guildId);
        await client.query("UPDATE roman_families SET political_influence=political_influence-$2,updated_at=NOW() WHERE id=$1",[family.id,input.influenceSpend]);
        await client.query(
          `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,influence_delta,actor_user_id,description,details)
           VALUES($1,$2,'ELECTION_SUPPORT',$3,$4,$5,$6::jsonb)`,
          [family.id,turn,-input.influenceSpend,input.actorId,`${candidate.candidate_name} adayına seçim desteği`,JSON.stringify({electionId:election.id,candidateId:candidate.id})]
        );
      }
      await audit(client,input.guildId,input.actorId,"ROMAN_ELECTION_VOTE","roman_election",election.id,{familyId:family.id,candidateId:candidate.id,seatWeight,influenceSpend:input.influenceSpend});
      await recordRomanElectionSupport(client,{republicId:republic.id,voterFamilyId:family.id,candidateFamilyId:candidate.family_id,
        turn:await currentTurn(client,input.guildId),electionId:election.id});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async resolveElection(input:{guildId:string;countryId:string;actorId:string}):Promise<{view:RomanRepublicView;winnerFamily:string;candidateName:string;weight:number;seatRenewal:RomanSenateRenewalResult}>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const election=(await client.query<{id:string}>(
        "SELECT id FROM roman_elections WHERE republic_id=$1 AND status='OPEN' FOR UPDATE",[republic.id]
      )).rows[0];
      if(!election)throw new GameError("Sonuçlandırılacak açık seçim bulunmuyor.");
      const turn=await currentTurn(client,input.guildId);
      await ensureNpcElectionParticipation(client,republic.id,turn);
      const ranking=(await client.query<{
        candidate_id:string;candidate_name:string;family_id:string;family_name:string;total_weight:number;seat_weight:number;political_influence:number;
      }>(`SELECT candidate.id AS candidate_id,candidate.candidate_name,candidate.family_id,family.name AS family_name,
                 COALESCE(SUM(ballot.total_weight),0)::int AS total_weight,
                 COALESCE(SUM(ballot.seat_weight),0)::int AS seat_weight,family.political_influence
            FROM roman_election_candidates candidate
            JOIN roman_families family ON family.id=candidate.family_id
            LEFT JOIN roman_election_ballots ballot ON ballot.candidate_id=candidate.id
           WHERE candidate.election_id=$1
           GROUP BY candidate.id,family.id
           ORDER BY total_weight DESC,seat_weight DESC,family.political_influence DESC,family.name ASC`,[election.id])).rows;
      if(!ranking.length)throw new GameError("Hiçbir aile konsül adayı göstermedi.");
      if(!ranking.some((row)=>Number(row.total_weight)>0))throw new GameError("Henüz hiçbir siyasi aile oy kullanmadı.");
      const winner=ranking[0]!;
      await client.query(
        "UPDATE roman_elections SET status='COMPLETED',winner_family_id=$2,resolved_turn=$3,resolved_by=$4,resolved_at=NOW() WHERE id=$1",
        [election.id,winner.family_id,turn,input.actorId]
      );
      const seatRenewal=await renewRomanSenateSeats(client,{
        guildId:input.guildId,actorId:input.actorId,republicId:republic.id,electionId:election.id,winnerFamilyId:winner.family_id,
        resolvedTurn:turn,previousTermStartedTurn:republic.term_started_turn,totalSeats:Number(republic.senate_total_seats),
        familySeatCap:Number(republic.family_seat_cap)
      });
      await client.query(
        "UPDATE roman_republics SET current_consul_family_id=$2,term_started_turn=$3,next_election_turn=$3+term_length,updated_at=NOW() WHERE id=$1",
        [republic.id,winner.family_id,turn]
      );
      await client.query("UPDATE roman_families SET political_influence=political_influence+$2,updated_at=NOW() WHERE id=$1",[winner.family_id,ROMAN_ELECTION_WIN_INFLUENCE]);
      await client.query("UPDATE roman_families SET reputation=LEAST(100,reputation+3),updated_at=NOW() WHERE id=$1",[winner.family_id]);
      await client.query(
        `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,influence_delta,actor_user_id,description,details)
         VALUES($1,$2,'ELECTION_VICTORY',$3,$4,$5,$6::jsonb)`,
        [winner.family_id,turn,ROMAN_ELECTION_WIN_INFLUENCE,input.actorId,`${winner.candidate_name} konsül seçimini kazandı`,JSON.stringify({electionId:election.id,totalWeight:winner.total_weight})]
      );
      await client.query(
        "INSERT INTO roman_republic_events(republic_id,game_turn,event_type,actor_user_id,family_id,details) VALUES($1,$2,'ELECTION_RESOLVED',$3,$4,$5::jsonb)",
        [republic.id,turn,input.actorId,winner.family_id,JSON.stringify({electionId:election.id,candidateName:winner.candidate_name,totalWeight:winner.total_weight})]
      );
      await audit(client,input.guildId,input.actorId,"ROMAN_ELECTION_RESOLVE","roman_election",election.id,{winnerFamilyId:winner.family_id,candidateName:winner.candidate_name,totalWeight:winner.total_weight});
      return{view:(await viewWithClient(client,input.guildId,input.countryId))!,winnerFamily:winner.family_name,candidateName:winner.candidate_name,
        weight:Number(winner.total_weight),seatRenewal};
    });
  },

  async appointGovernor(input:{guildId:string;countryId:string;actorId:string;settlement:string;family:string;governorName:string;gameMaster:boolean}):Promise<RomanRepublicView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      if(!input.gameMaster){
        const familyId=await leaderFamily(client,republic.id,input.actorId,false);
        if(!familyId||familyId!==republic.current_consul_family_id)throw new GameError("Roma valilerini yalnızca mevcut konsül ailesinin lideri atayabilir.");
      }
      const family=await familyRow(client,republic.id,input.family);
      if(!family)throw new GameError("Valiliğin verileceği siyasi aile bulunamadı.");
      const activeCount=Number((await client.query<{count:number}>(
        "SELECT COUNT(*)::int AS count FROM roman_governorships WHERE family_id=$1 AND status='ACTIVE'",[family.id]
      )).rows[0]?.count??0);
      if(activeCount>=ROMAN_GOVERNOR_FAMILY_CAP)throw new GameError(`Bir siyasi aile aynı anda en fazla ${ROMAN_GOVERNOR_FAMILY_CAP} şehir valiliği tutabilir.`);
      const settlement=(await client.query<{id:string;name:string}>(
        `SELECT id,name FROM settlements WHERE country_id=$1 AND (id::text=$2 OR LOWER(name)=LOWER($2)) LIMIT 1`,
        [input.countryId,input.settlement.trim()]
      )).rows[0];
      if(!settlement)throw new GameError("Roma'ya ait yerleşke bulunamadı.");
      const existing=await client.query("SELECT 1 FROM roman_governorships WHERE republic_id=$1 AND settlement_id=$2 AND status='ACTIVE'",[republic.id,settlement.id]);
      if(existing.rowCount)throw new GameError("Bu yerleşkenin zaten etkin bir valisi var.");
      const governorName=input.governorName.trim();
      if(governorName.length<2||governorName.length>80)throw new GameError("Vali adı 2-80 karakter olmalıdır.");
      const turn=await currentTurn(client,input.guildId);
      const row=(await client.query<{id:string}>(
        `INSERT INTO roman_governorships(republic_id,settlement_id,family_id,governor_name,appointed_turn,end_turn,appointed_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [republic.id,settlement.id,family.id,governorName,turn,turn+ROMAN_GOVERNOR_TERM_LENGTH,input.actorId]
      )).rows[0]!;
      await client.query(
        "INSERT INTO roman_republic_events(republic_id,game_turn,event_type,actor_user_id,family_id,details) VALUES($1,$2,'GOVERNOR_APPOINTED',$3,$4,$5::jsonb)",
        [republic.id,turn,input.actorId,family.id,JSON.stringify({governorshipId:row.id,settlementId:settlement.id,governorName,endTurn:turn+ROMAN_GOVERNOR_TERM_LENGTH})]
      );
      await audit(client,input.guildId,input.actorId,"ROMAN_GOVERNOR_APPOINT","roman_governorship",row.id,{familyId:family.id,settlementId:settlement.id,governorName});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async removeGovernor(input:{guildId:string;countryId:string;actorId:string;settlement:string;gameMaster:boolean}):Promise<RomanRepublicView>{
    return withTransaction(async(client)=>{
      const republic=await republicRow(client,input.guildId,input.countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      if(!input.gameMaster){
        const familyId=await leaderFamily(client,republic.id,input.actorId,false);
        if(!familyId||familyId!==republic.current_consul_family_id)throw new GameError("Roma valilerini yalnızca mevcut konsül ailesinin lideri görevden alabilir.");
      }
      const settlement=(await client.query<{id:string;name:string}>(
        `SELECT id,name FROM settlements WHERE country_id=$1 AND (id::text=$2 OR LOWER(name)=LOWER($2)) LIMIT 1`,
        [input.countryId,input.settlement.trim()]
      )).rows[0];
      if(!settlement)throw new GameError("Roma'ya ait yerleşke bulunamadı.");
      const row=(await client.query<{id:string}>(
        `UPDATE roman_governorships SET status='REMOVED',removed_by=$3,removed_at=NOW(),updated_at=NOW()
          WHERE republic_id=$1 AND settlement_id=$2 AND status='ACTIVE' RETURNING id`,[republic.id,settlement.id,input.actorId]
      )).rows[0];
      if(!row)throw new GameError("Bu yerleşkede görevden alınabilecek etkin vali bulunmuyor.");
      await audit(client,input.guildId,input.actorId,"ROMAN_GOVERNOR_REMOVE","roman_governorship",row.id,{settlementId:settlement.id});
      return (await viewWithClient(client,input.guildId,input.countryId))!;
    });
  },

  async influenceLedger(guildId:string,countryId:string,userId:string,gameMaster:boolean):Promise<{familyName:string;entries:Array<{turn:number;delta:number;description:string}>}>{
    const client=await pool.connect();
    try{
      const republic=await republicRow(client,guildId,countryId);
      if(!republic)throw new GameError("Roma Cumhuriyeti kaydı bulunamadı.");
      const membership=(await client.query<{family_id:string}>(
        "SELECT family_id FROM roman_family_players WHERE republic_id=$1 AND discord_user_id=$2 AND status='ACTIVE'",
        [republic.id,userId]
      )).rows[0];
      if(!membership&&!gameMaster)throw new GameError("Bir Roma siyasi ailesine atanmış değilsiniz.");
      const familyId=membership?.family_id??republic.current_consul_family_id;
      if(!familyId)throw new GameError("Görüntülenecek siyasi aile bulunamadı.");
      const family=await familyRow(client,republic.id,familyId);
      if(!family)throw new GameError("Siyasi aile bulunamadı.");
      const entries=(await client.query<{game_turn:number;influence_delta:number;description:string}>(
        `SELECT game_turn,influence_delta,description FROM roman_family_ledger
          WHERE family_id=$1 AND influence_delta<>0 ORDER BY created_at DESC LIMIT 25`,[family.id]
      )).rows;
      return{familyName:family.name,entries:entries.map((entry)=>({turn:Number(entry.game_turn),delta:Number(entry.influence_delta),description:entry.description}))};
    }finally{client.release();}
  },

  async executiveAccess(guildId:string,countryId:string,userId:string):Promise<{restricted:boolean;allowed:boolean;familyName:string|null}>{
    const row=(await pool.query<{current_consul_family_id:string|null;family_id:string|null;family_name:string|null}>(`
      SELECT republic.current_consul_family_id,membership.family_id,family.name AS family_name
        FROM roman_republics republic
        LEFT JOIN roman_family_players membership ON membership.republic_id=republic.id
          AND membership.discord_user_id=$3 AND membership.status='ACTIVE'
        LEFT JOIN roman_families family ON family.id=republic.current_consul_family_id
       WHERE republic.guild_id=$1 AND republic.country_id=$2 AND republic.status='ACTIVE'`,[guildId,countryId,userId])).rows[0];
    if(!row)return{restricted:false,allowed:true,familyName:null};
    return{restricted:true,allowed:Boolean(row.current_consul_family_id&&row.family_id===row.current_consul_family_id),familyName:row.family_name};
  }
};
