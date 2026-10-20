export const steppeKurultayBaselineMigration={
  version:222,
  name:"steppe_kurultay_initial_baseline_repair",
  sql:`
    INSERT INTO steppe_kurultay_elections(
      guild_id,sequence,scheduled_turn,started_turn,status,incumbent_country_id,
      winner_title_id,started_by,completed_by,completed_turn
    )
    SELECT hegemony.guild_id,1,
           COALESCE(hegemony.term_started_turn,guild.current_turn),
           COALESCE(hegemony.term_started_turn,guild.current_turn),
           'COMPLETED',hegemony.hegemon_country_id,khan.id,
           'SYSTEM:KURULTAY_BASELINE_V222','SYSTEM:KURULTAY_BASELINE_V222',
           COALESCE(hegemony.term_started_turn,guild.current_turn)
      FROM steppe_hegemonies hegemony
      JOIN guilds guild ON guild.discord_id=hegemony.guild_id
      LEFT JOIN LATERAL (
        SELECT title.id
          FROM steppe_confederations confederation
          JOIN steppe_internal_titles title
            ON title.confederation_id=confederation.id
           AND title.tier='KHAN' AND title.status='ACTIVE'
         WHERE confederation.guild_id=hegemony.guild_id
           AND confederation.country_id=hegemony.hegemon_country_id
           AND confederation.status='ACTIVE'
         ORDER BY title.created_at,title.id
         LIMIT 1
      ) khan ON TRUE
     WHERE NOT EXISTS(
       SELECT 1 FROM steppe_kurultay_elections election
        WHERE election.guild_id=hegemony.guild_id
     )
    ON CONFLICT(guild_id,sequence) DO NOTHING;

    INSERT INTO steppe_kurultay_candidates(election_id,title_id,nominated_by)
    SELECT election.id,title.id,'SYSTEM:KURULTAY_BASELINE_V222'
      FROM steppe_kurultay_elections election
      JOIN steppe_confederations confederation
        ON confederation.guild_id=election.guild_id AND confederation.status='ACTIVE'
      JOIN countries country
        ON country.id=confederation.country_id AND country.status='ACTIVE'
      JOIN steppe_internal_titles title
        ON title.confederation_id=confederation.id
       AND title.tier='KHAN' AND title.status='ACTIVE'
     WHERE election.started_by='SYSTEM:KURULTAY_BASELINE_V222'
    ON CONFLICT(election_id,title_id) DO NOTHING;
  `
} as const;
