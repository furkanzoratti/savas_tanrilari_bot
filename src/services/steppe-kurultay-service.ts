import {pool,withTransaction,type DbClient} from "../db/pool.js";
import {GameError} from "./game-service.js";

export interface SteppeKurultayCandidateView{
  titleId:string;titleName:string;holderName:string;countryId:string;countryName:string;
  points:number;ballotCount:number;
}

export interface SteppeKurultayVoterView{
  voterId:string;voterName:string;representativeName:string;holderUserId:string|null;countryId:string;countryName:string;
  tier:"KHAN"|"VASSAL";weight:number;candidateTitleId:string|null;candidateTitleName:string|null;
}

export interface SteppeKurultayView{
  id:string;sequence:number;scheduledTurn:number;startedTurn:number;status:"OPEN"|"COMPLETED"|"CANCELLED";
  currentTurn:number;incumbentCountryId:string;incumbentCountryName:string;winnerTitleId:string|null;
  winnerTitleName:string|null;nextKurultayTurn:number;channelId:string|null;messageId:string|null;
  candidates:SteppeKurultayCandidateView[];voters:SteppeKurultayVoterView[];
}

async function viewWithClient(client:DbClient,guildId:string):Promise<SteppeKurultayView|null>{
  const election=(await client.query<{
    id:string;sequence:number;scheduled_turn:number;started_turn:number;status:"OPEN"|"COMPLETED"|"CANCELLED";
    incumbent_country_id:string;incumbent_country_name:string;winner_title_id:string|null;winner_title_name:string|null;
    current_turn:number;next_kurultay_turn:number;channel_id:string|null;message_id:string|null;
  }>(`SELECT election.id,election.sequence,election.scheduled_turn,election.started_turn,election.status,
             election.incumbent_country_id,incumbent.name AS incumbent_country_name,election.winner_title_id,
             winner.title_name AS winner_title_name,guild.current_turn,COALESCE(hegemony.next_kurultay_turn,guild.current_turn+6) AS next_kurultay_turn,
             election.channel_id,election.message_id
        FROM steppe_kurultay_elections election
        JOIN guilds guild ON guild.discord_id=election.guild_id
        JOIN countries incumbent ON incumbent.id=election.incumbent_country_id
        JOIN steppe_hegemonies hegemony ON hegemony.guild_id=election.guild_id
        LEFT JOIN steppe_internal_titles winner ON winner.id=election.winner_title_id
       WHERE election.guild_id=$1
       ORDER BY CASE election.status WHEN 'OPEN' THEN 0 ELSE 1 END,election.sequence DESC LIMIT 1`,[guildId])).rows[0];
  if(!election)return null;
  const candidates=(await client.query<{
    title_id:string;title_name:string;holder_name:string;country_id:string;country_name:string;points:number;ballot_count:number;
  }>(`SELECT candidate.title_id,title.title_name,title.holder_name,confederation.country_id,country.name AS country_name,
             COALESCE(SUM(ballot.vote_weight),0)::integer AS points,COUNT(ballot.candidate_title_id)::integer AS ballot_count
        FROM steppe_kurultay_candidates candidate
        JOIN steppe_internal_titles title ON title.id=candidate.title_id
        JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
        JOIN countries country ON country.id=confederation.country_id
        LEFT JOIN steppe_kurultay_ballots ballot ON ballot.election_id=candidate.election_id AND ballot.candidate_title_id=candidate.title_id
       WHERE candidate.election_id=$1
       GROUP BY candidate.title_id,title.title_name,title.holder_name,confederation.country_id,country.name
       ORDER BY points DESC,title.title_name`,[election.id])).rows;
  const voters=(await client.query<{
    voter_id:string;voter_name:string;representative_name:string;holder_user_id:string|null;country_id:string;country_name:string;tier:"KHAN"|"VASSAL";
    candidate_title_id:string|null;candidate_title_name:string|null;
  }>(`WITH voters AS (
        SELECT title.id AS voter_id,title.title_name AS voter_name,title.holder_name AS representative_name,
               title.holder_user_id,confederation.country_id,country.name AS country_name,'KHAN'::text AS tier
          FROM steppe_internal_titles title
          JOIN steppe_confederations confederation ON confederation.id=title.confederation_id AND confederation.status='ACTIVE'
          JOIN countries country ON country.id=confederation.country_id AND country.status='ACTIVE'
         WHERE confederation.guild_id=$1 AND title.status='ACTIVE' AND title.tier='KHAN'
        UNION ALL
        SELECT vassal.id,vassal.name,
               CASE WHEN MIN(member.discord_user_id) IS NULL THEN 'Oyuncusuz devlet' ELSE 'Devlet oyuncusu' END,
               MIN(member.discord_user_id),vassal.id,vassal.name,'VASSAL'::text
          FROM country_vassalages relation
          JOIN countries vassal ON vassal.id=relation.vassal_country_id AND vassal.status='ACTIVE'
          JOIN steppe_confederations confederation ON confederation.country_id=relation.overlord_country_id AND confederation.status='ACTIVE'
          LEFT JOIN country_members member ON member.country_id=vassal.id
         WHERE relation.guild_id=$1 AND relation.status='ACTIVE' AND confederation.guild_id=$1
           AND NOT EXISTS(SELECT 1 FROM steppe_confederations own
             WHERE own.country_id=vassal.id AND own.status='ACTIVE')
         GROUP BY vassal.id,vassal.name
      )
      SELECT voter.voter_id,voter.voter_name,voter.representative_name,voter.holder_user_id,
             voter.country_id,voter.country_name,voter.tier,
             ballot.candidate_title_id,candidate.title_name AS candidate_title_name
        FROM voters voter
        LEFT JOIN steppe_kurultay_ballots ballot ON ballot.election_id=$2
         AND ((voter.tier='KHAN' AND ballot.voter_title_id=voter.voter_id)
           OR (voter.tier='VASSAL' AND ballot.voter_country_id=voter.voter_id))
        LEFT JOIN steppe_internal_titles candidate ON candidate.id=ballot.candidate_title_id
       ORDER BY CASE voter.tier WHEN 'KHAN' THEN 0 ELSE 1 END,voter.country_name,voter.voter_name`,[guildId,election.id])).rows;
  return{id:election.id,sequence:Number(election.sequence),scheduledTurn:Number(election.scheduled_turn),startedTurn:Number(election.started_turn),
    status:election.status,currentTurn:Number(election.current_turn),incumbentCountryId:election.incumbent_country_id,
    incumbentCountryName:election.incumbent_country_name,winnerTitleId:election.winner_title_id,winnerTitleName:election.winner_title_name,
    nextKurultayTurn:Number(election.next_kurultay_turn),channelId:election.channel_id,messageId:election.message_id,
    candidates:candidates.map((candidate)=>({titleId:candidate.title_id,titleName:candidate.title_name,holderName:candidate.holder_name,
      countryId:candidate.country_id,countryName:candidate.country_name,points:Number(candidate.points),ballotCount:Number(candidate.ballot_count)})),
    voters:voters.map((voter)=>({voterId:voter.voter_id,voterName:voter.voter_name,representativeName:voter.representative_name,
      holderUserId:voter.holder_user_id,countryId:voter.country_id,countryName:voter.country_name,tier:voter.tier,weight:voter.tier==="KHAN"?2:1,
      candidateTitleId:voter.candidate_title_id,candidateTitleName:voter.candidate_title_name}))};
}

async function audit(client:DbClient,guildId:string,actorId:string,action:string,entityId:string,details:unknown){
  await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'steppe_kurultay',$4,$5::jsonb)",
    [guildId,actorId,action,entityId,JSON.stringify(details)]);
}

export const steppeKurultayService={
  async view(guildId:string){const client=await pool.connect();try{return await viewWithClient(client,guildId);}finally{client.release();}},

  async start(input:{guildId:string;actorId:string;hegemonCountryId:string}){
    return withTransaction(async(client)=>{
      const state=(await client.query<{hegemon_country_id:string;current_turn:number;next_kurultay_turn:number|null}>(`
        SELECT hegemony.hegemon_country_id,guild.current_turn,hegemony.next_kurultay_turn
          FROM steppe_hegemonies hegemony JOIN guilds guild ON guild.discord_id=hegemony.guild_id
         WHERE hegemony.guild_id=$1 FOR UPDATE OF hegemony`,[input.guildId])).rows[0];
      if(!state)throw new GameError("Hanlar Hanlığı kurulmamış.");
      if(state.hegemon_country_id!==input.hegemonCountryId)throw new GameError("Kurultayı yalnız mevcut Hanlar Hanı devleti adına açabilirsiniz.");
      if((await client.query("SELECT 1 FROM steppe_kurultay_elections WHERE guild_id=$1 AND status='OPEN'",[input.guildId])).rowCount)
        throw new GameError("Zaten açık bir Hanlar Hanı Kurultayı bulunuyor.");
      const due=Number(state.next_kurultay_turn??(Number(state.current_turn)+6));
      if(Number(state.current_turn)<due)throw new GameError(`Yeni Kurultay Tur ${due} itibarıyla açılabilir. Mevcut tur: ${state.current_turn}.`);
      const sequence=Number((await client.query<{next:number}>(
        "SELECT COALESCE(MAX(sequence),0)+1 AS next FROM steppe_kurultay_elections WHERE guild_id=$1",[input.guildId]
      )).rows[0]?.next??1);
      const election=(await client.query<{id:string}>(`INSERT INTO steppe_kurultay_elections(
        guild_id,sequence,scheduled_turn,started_turn,incumbent_country_id,started_by
      ) VALUES($1,$2,$3,$3,$4,$5) RETURNING id`,[input.guildId,sequence,state.current_turn,state.hegemon_country_id,input.actorId])).rows[0]!;
      await client.query(`INSERT INTO steppe_kurultay_candidates(election_id,title_id,nominated_by)
        SELECT $1,title.id,$2 FROM steppe_internal_titles title
        JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
        JOIN countries country ON country.id=confederation.country_id
        WHERE confederation.guild_id=$3 AND confederation.status='ACTIVE' AND country.status='ACTIVE'
          AND title.status='ACTIVE' AND title.tier='KHAN'`,[election.id,input.actorId,input.guildId]);
      const count=Number((await client.query<{count:number}>(
        "SELECT COUNT(*)::integer AS count FROM steppe_kurultay_candidates WHERE election_id=$1",[election.id]
      )).rows[0]?.count??0);
      if(count<2)throw new GameError("Kurultay için en az iki etkin Han adayı gerekir.");
      await audit(client,input.guildId,input.actorId,"STEPPE_KURULTAY_START",election.id,{sequence,candidateCount:count,turn:state.current_turn});
      return (await viewWithClient(client,input.guildId))!;
    });
  },

  async attachMessage(electionId:string,channelId:string,messageId:string){
    await pool.query("UPDATE steppe_kurultay_elections SET channel_id=$2,message_id=$3,updated_at=NOW() WHERE id=$1 AND status='OPEN'",
      [electionId,channelId,messageId]);
  },

  async votePlayer(input:{guildId:string;actorId:string;electionId:string;candidateTitleId:string}){
    return withTransaction(async(client)=>{
      const election=(await client.query<{id:string}>(
        "SELECT id FROM steppe_kurultay_elections WHERE id=$1 AND guild_id=$2 AND status='OPEN' FOR UPDATE",[input.electionId,input.guildId]
      )).rows[0];if(!election)throw new GameError("Oy kullanımına açık Kurultay bulunmuyor.");
      const voter=(await client.query<{id:string;tier:"KHAN"|"VASSAL";voter_name:string}>(`
        SELECT voter.id,voter.tier,voter.voter_name FROM (
          SELECT title.id,'KHAN'::text AS tier,title.title_name AS voter_name,0 AS priority
            FROM steppe_internal_titles title
            JOIN steppe_confederations confederation ON confederation.id=title.confederation_id AND confederation.status='ACTIVE'
           WHERE confederation.guild_id=$1 AND title.status='ACTIVE' AND title.tier='KHAN' AND title.holder_user_id=$2
          UNION ALL
          SELECT country.id,'VASSAL'::text,country.name,1
            FROM country_members member
            JOIN countries country ON country.id=member.country_id AND country.status='ACTIVE'
            JOIN country_vassalages relation ON relation.vassal_country_id=country.id AND relation.status='ACTIVE'
            JOIN steppe_confederations confederation ON confederation.country_id=relation.overlord_country_id AND confederation.status='ACTIVE'
           WHERE relation.guild_id=$1 AND confederation.guild_id=$1 AND member.discord_user_id=$2
             AND NOT EXISTS(SELECT 1 FROM steppe_confederations own
               WHERE own.country_id=country.id AND own.status='ACTIVE')
        ) voter ORDER BY voter.priority,voter.voter_name LIMIT 1`,
      [input.guildId,input.actorId])).rows[0];
      if(!voter)throw new GameError("Oy kullanabileceğiniz etkin bir Han veya bozkır vassalı bulunmuyor.");
      if(!(await client.query("SELECT 1 FROM steppe_kurultay_candidates WHERE election_id=$1 AND title_id=$2",[election.id,input.candidateTitleId])).rowCount)
        throw new GameError("Seçilen Han bu Kurultayda aday değil.");
      if((await client.query(`SELECT 1 FROM steppe_kurultay_ballots WHERE election_id=$1
        AND (($3='KHAN' AND voter_title_id=$2) OR ($3='VASSAL' AND voter_country_id=$2))`,[election.id,voter.id,voter.tier])).rowCount)
        throw new GameError("Bu Han veya vassal Kurultay oyunu daha önce kullandı; oy değiştirilemez.");
      const weight=voter.tier==="KHAN"?2:1;
      await client.query(`INSERT INTO steppe_kurultay_ballots(
        election_id,voter_title_id,voter_country_id,candidate_title_id,vote_weight,voter_kind,voted_by
      ) VALUES($1,$2,$3,$4,$5,'PLAYER',$6)`,[
        election.id,voter.tier==="KHAN"?voter.id:null,voter.tier==="VASSAL"?voter.id:null,
        input.candidateTitleId,weight,input.actorId
      ]);
      await audit(client,input.guildId,input.actorId,"STEPPE_KURULTAY_PLAYER_VOTE",election.id,
        {voterId:voter.id,voterTier:voter.tier,candidateTitleId:input.candidateTitleId,weight});
      return{view:(await viewWithClient(client,input.guildId))!,voterName:voter.voter_name,weight};
    });
  },

  async voteNpc(input:{guildId:string;actorId:string;electionId:string;voterId:string;candidateTitleId:string}){
    return withTransaction(async(client)=>{
      const election=(await client.query<{id:string}>(
        "SELECT id FROM steppe_kurultay_elections WHERE id=$1 AND guild_id=$2 AND status='OPEN' FOR UPDATE",
      [input.electionId,input.guildId])).rows[0];if(!election)throw new GameError("Oy kullanımına açık Kurultay bulunmuyor.");
      const voter=(await client.query<{id:string;tier:"KHAN"|"VASSAL";holder_user_id:string|null;voter_name:string}>(`
        SELECT voter.id,voter.tier,voter.holder_user_id,voter.voter_name FROM (
          SELECT title.id,'KHAN'::text AS tier,title.holder_user_id,title.title_name AS voter_name,0 AS priority
            FROM steppe_internal_titles title
            JOIN steppe_confederations confederation ON confederation.id=title.confederation_id AND confederation.status='ACTIVE'
           WHERE confederation.guild_id=$2 AND title.status='ACTIVE' AND title.tier='KHAN'
          UNION ALL
          SELECT country.id,'VASSAL'::text,MIN(member.discord_user_id),country.name,1
            FROM countries country
            JOIN country_vassalages relation ON relation.vassal_country_id=country.id AND relation.status='ACTIVE'
            JOIN steppe_confederations confederation ON confederation.country_id=relation.overlord_country_id AND confederation.status='ACTIVE'
            LEFT JOIN country_members member ON member.country_id=country.id
           WHERE relation.guild_id=$2 AND confederation.guild_id=$2 AND country.status='ACTIVE'
             AND NOT EXISTS(SELECT 1 FROM steppe_confederations own
               WHERE own.country_id=country.id AND own.status='ACTIVE')
           GROUP BY country.id,country.name
        ) voter WHERE voter.id=$1 ORDER BY voter.priority LIMIT 1`,
      [input.voterId,input.guildId])).rows[0];if(!voter)throw new GameError("Oy verecek Han veya bozkır vassalı bulunamadı.");
      if(voter.holder_user_id)throw new GameError("Oyuncuya atanmış Han veya vassalın oyu panelden kullanılamaz.");
      if(!(await client.query("SELECT 1 FROM steppe_kurultay_candidates WHERE election_id=$1 AND title_id=$2",[election.id,input.candidateTitleId])).rowCount)
        throw new GameError("Seçilen Han bu Kurultayda aday değil.");
      if((await client.query(`SELECT 1 FROM steppe_kurultay_ballots WHERE election_id=$1
        AND (($3='KHAN' AND voter_title_id=$2) OR ($3='VASSAL' AND voter_country_id=$2))`,[election.id,voter.id,voter.tier])).rowCount)
        throw new GameError("Bu Han veya vassal Kurultay oyunu daha önce kullandı.");
      const weight=voter.tier==="KHAN"?2:1;
      await client.query(`INSERT INTO steppe_kurultay_ballots(
        election_id,voter_title_id,voter_country_id,candidate_title_id,vote_weight,voter_kind,voted_by
      ) VALUES($1,$2,$3,$4,$5,'NPC',$6)`,[
        election.id,voter.tier==="KHAN"?voter.id:null,voter.tier==="VASSAL"?voter.id:null,
        input.candidateTitleId,weight,input.actorId
      ]);
      await audit(client,input.guildId,input.actorId,"STEPPE_KURULTAY_NPC_VOTE",election.id,
        {voterId:voter.id,voterTier:voter.tier,candidateTitleId:input.candidateTitleId,weight});
      return{view:(await viewWithClient(client,input.guildId))!,voterName:voter.voter_name,weight};
    });
  },

  async complete(input:{guildId:string;actorId:string;electionId:string}){
    return withTransaction(async(client)=>{
      const election=(await client.query<{id:string;incumbent_country_id:string;started_turn:number}>(`
        SELECT id,incumbent_country_id,started_turn FROM steppe_kurultay_elections
        WHERE id=$1 AND guild_id=$2 AND status='OPEN' FOR UPDATE`,[input.electionId,input.guildId])).rows[0];
      if(!election)throw new GameError("Sonuçlandırılabilecek açık Kurultay bulunmuyor.");
      const ranked=(await client.query<{
        title_id:string;title_name:string;country_id:string;country_name:string;points:number;ballot_count:number;
      }>(`SELECT candidate.title_id,title.title_name,confederation.country_id,country.name AS country_name,
                 COALESCE(SUM(ballot.vote_weight),0)::integer AS points,COUNT(ballot.candidate_title_id)::integer AS ballot_count
            FROM steppe_kurultay_candidates candidate
            JOIN steppe_internal_titles title ON title.id=candidate.title_id
            JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
            JOIN countries country ON country.id=confederation.country_id
            LEFT JOIN steppe_kurultay_ballots ballot ON ballot.election_id=candidate.election_id AND ballot.candidate_title_id=candidate.title_id
           WHERE candidate.election_id=$1
           GROUP BY candidate.title_id,title.title_name,confederation.country_id,country.name
           ORDER BY points DESC,CASE WHEN confederation.country_id=$2 THEN 0 ELSE 1 END,title.title_name`,
      [election.id,election.incumbent_country_id])).rows;
      if(!ranked.length)throw new GameError("Kurultayda aday bulunmuyor.");
      if(!ranked.some((candidate)=>Number(candidate.ballot_count)>0))throw new GameError("En az bir Kurultay oyu kullanılmadan seçim sonuçlandırılamaz.");
      const winner=ranked[0]!;
      const turn=Number((await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[input.guildId])).rows[0]?.current_turn??election.started_turn);
      await client.query(`UPDATE steppe_kurultay_elections SET status='COMPLETED',winner_title_id=$2,completed_by=$3,
        completed_turn=$4,updated_at=NOW() WHERE id=$1`,[election.id,winner.title_id,input.actorId,turn]);
      await client.query(`UPDATE steppe_hegemonies SET hegemon_country_id=$2,term_started_turn=$3,next_kurultay_turn=$3+6,
        updated_at=NOW() WHERE guild_id=$1`,[input.guildId,winner.country_id,turn]);
      await client.query("UPDATE steppe_tributaries SET status='ENDED',ended_turn=$2,updated_at=NOW() WHERE guild_id=$1 AND status='ACTIVE'",[input.guildId,turn]);
      await client.query(`INSERT INTO steppe_tributaries(guild_id,country_id,loyalty,joined_turn,status)
        SELECT $1,confederation.country_id,50,$2,'ACTIVE' FROM steppe_confederations confederation
        JOIN countries country ON country.id=confederation.country_id
        WHERE confederation.guild_id=$1 AND confederation.status='ACTIVE' AND country.status='ACTIVE' AND confederation.country_id<>$3
        ON CONFLICT(guild_id,country_id) DO UPDATE SET status='ACTIVE',joined_turn=EXCLUDED.joined_turn,ended_turn=NULL,updated_at=NOW()`,
      [input.guildId,turn,winner.country_id]);
      await client.query("UPDATE steppe_tribute_offers SET response='CANCELLED' WHERE guild_id=$1 AND response='PENDING'",[input.guildId]);
      await client.query("UPDATE steppe_hegemony_war_calls SET status='CANCELLED',closed_by=$2,closed_at=NOW() WHERE guild_id=$1 AND status='OPEN'",[input.guildId,input.actorId]);
      await audit(client,input.guildId,input.actorId,"STEPPE_KURULTAY_COMPLETE",election.id,
        {winnerTitleId:winner.title_id,winnerCountryId:winner.country_id,points:Number(winner.points),turn,nextKurultayTurn:turn+6});
      return{view:(await viewWithClient(client,input.guildId))!,winnerTitleName:winner.title_name,winnerCountryName:winner.country_name,
        points:Number(winner.points),turn,nextKurultayTurn:turn+6};
    });
  }
};
