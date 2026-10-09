export const romanScipioInitialConsulMigration={
  version:157,
  name:"roman_scipio_initial_consul_and_first_election",
  sql:`
    UPDATE roman_elections election
       SET status='CANCELLED',resolved_at=NOW()
      FROM roman_republics republic
      JOIN countries country ON country.id=republic.country_id
     WHERE election.republic_id=republic.id
       AND election.status='OPEN'
       AND republic.status='ACTIVE'
       AND lower(country.name) LIKE 'roma%';

    UPDATE roman_republics republic
       SET current_consul_family_id=family.id,
           term_length=6,
           term_started_turn=guild.current_turn,
           next_election_turn=guild.current_turn+6,
           updated_at=NOW()
      FROM roman_families family,guilds guild,countries country
     WHERE family.republic_id=republic.id
       AND guild.discord_id=republic.guild_id
       AND country.id=republic.country_id
       AND republic.status='ACTIVE'
       AND family.status='ACTIVE'
       AND lower(country.name) LIKE 'roma%'
       AND lower(family.name) IN ('scipio ailesi','scipio');

    INSERT INTO roman_republic_events(republic_id,game_turn,event_type,family_id,details)
    SELECT republic.id,guild.current_turn,'INITIAL_CONSUL_SET',family.id,
           jsonb_build_object('familyName',family.name,'nextElectionTurn',guild.current_turn+6,'migration',157)
      FROM roman_republics republic
      JOIN guilds guild ON guild.discord_id=republic.guild_id
      JOIN countries country ON country.id=republic.country_id
      JOIN roman_families family ON family.id=republic.current_consul_family_id
     WHERE republic.status='ACTIVE'
       AND lower(country.name) LIKE 'roma%'
       AND lower(family.name) IN ('scipio ailesi','scipio')
       AND NOT EXISTS(
         SELECT 1 FROM roman_republic_events event
          WHERE event.republic_id=republic.id AND event.event_type='INITIAL_CONSUL_SET'
            AND event.details->>'migration'='157'
       );
  `
} as const;
