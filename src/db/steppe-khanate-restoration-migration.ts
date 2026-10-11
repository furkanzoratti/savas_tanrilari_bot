export const steppeKhanateRestorationMigration={
  version:182,
  name:"restore_three_steppe_khanates_and_lock_doctrine_scope",
  sql:`
    ALTER TABLE countries
      ADD COLUMN IF NOT EXISTS is_steppe_state BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE countries
       SET is_steppe_state=(lower(name) IN (
         lower('Xiongnu Konfederasyonu'),lower('Dingling Konfederasyonu'),lower('Xianbei Konfederasyonu')
       ));

    DELETE FROM country_special_unit_unlocks unlock
     USING countries country
     WHERE country.id=unlock.country_id
       AND unlock.unit_type IN ('horse_archer','steppe_cavalry','kurgan_shieldbearer','oba_archer')
       AND country.is_steppe_state=FALSE;

    INSERT INTO country_special_unit_unlocks(country_id,unit_type,granted_by)
    SELECT country.id,unit.unit_type,'SYSTEM:STEPPE_KHANATES_V182'
      FROM countries country
      CROSS JOIN (VALUES
        ('horse_archer'),('steppe_cavalry'),('kurgan_shieldbearer'),('oba_archer')
      ) AS unit(unit_type)
     WHERE country.status='ACTIVE' AND country.is_steppe_state=TRUE
    ON CONFLICT(country_id,unit_type) DO NOTHING;

    UPDATE steppe_confederations confederation
       SET status='ENDED',updated_at=NOW()
      FROM countries country
     WHERE country.id=confederation.country_id
       AND country.is_steppe_state=FALSE AND confederation.status='ACTIVE';

    INSERT INTO steppe_confederations(guild_id,country_id,authority,status,created_turn,created_by)
    SELECT country.guild_id,country.id,70,'ACTIVE',guild.current_turn,'SYSTEM:STEPPE_KHANATES_V182'
      FROM countries country JOIN guilds guild ON guild.discord_id=country.guild_id
     WHERE country.status='ACTIVE' AND country.is_steppe_state=TRUE
    ON CONFLICT(guild_id,country_id) DO UPDATE SET status='ACTIVE',updated_at=NOW();

    UPDATE steppe_internal_titles title
       SET status='ACTIVE',liege_title_id=NULL,
           holder_user_id=COALESCE(title.holder_user_id,(
             SELECT MIN(member.discord_user_id) FROM country_members member
              WHERE member.country_id=country.id
             HAVING COUNT(*)=1
           )),updated_at=NOW()
      FROM steppe_confederations confederation
      JOIN countries country ON country.id=confederation.country_id
     WHERE title.confederation_id=confederation.id AND title.tier='KHAN'
       AND confederation.status='ACTIVE' AND country.is_steppe_state=TRUE
       AND title.id=(
         SELECT selected.id FROM steppe_internal_titles selected
          WHERE selected.confederation_id=confederation.id AND selected.tier='KHAN'
          ORDER BY selected.created_at,selected.id LIMIT 1
       );

    INSERT INTO steppe_internal_titles(
      confederation_id,tier,title_name,holder_name,holder_user_id,loyalty,relation_score,status,created_turn
    )
    SELECT confederation.id,'KHAN',replace(country.name,' Konfederasyonu','')||' Hanı',
           'Henüz Atanmadı',NULL,100,100,'ACTIVE',guild.current_turn
      FROM steppe_confederations confederation
      JOIN countries country ON country.id=confederation.country_id
      JOIN guilds guild ON guild.discord_id=confederation.guild_id
     WHERE confederation.status='ACTIVE' AND country.status='ACTIVE' AND country.is_steppe_state=TRUE
       AND NOT EXISTS(
         SELECT 1 FROM steppe_internal_titles title
          WHERE title.confederation_id=confederation.id AND title.tier='KHAN' AND title.status='ACTIVE'
       );

    UPDATE steppe_internal_titles title
       SET status='REMOVED',liege_title_id=NULL,holder_user_id=NULL,updated_at=NOW()
      FROM steppe_confederations confederation
     WHERE title.confederation_id=confederation.id AND title.tier='LANDHOLDER' AND title.status='ACTIVE';

    INSERT INTO steppe_hegemonies(
      guild_id,hegemon_country_id,authority,created_turn,term_started_turn,next_kurultay_turn
    )
    SELECT xiongnu.guild_id,xiongnu.id,75,guild.current_turn,guild.current_turn,guild.current_turn+6
      FROM countries xiongnu JOIN guilds guild ON guild.discord_id=xiongnu.guild_id
     WHERE xiongnu.status='ACTIVE' AND lower(xiongnu.name)=lower('Xiongnu Konfederasyonu')
    ON CONFLICT(guild_id) DO UPDATE SET
      hegemon_country_id=EXCLUDED.hegemon_country_id,
      term_started_turn=COALESCE(steppe_hegemonies.term_started_turn,EXCLUDED.term_started_turn),
      next_kurultay_turn=COALESCE(steppe_hegemonies.next_kurultay_turn,EXCLUDED.next_kurultay_turn),
      updated_at=NOW();

    UPDATE steppe_tributaries relation
       SET status='ENDED',ended_turn=guild.current_turn,updated_at=NOW()
      FROM guilds guild,countries country
     WHERE guild.discord_id=relation.guild_id AND country.id=relation.country_id AND relation.status='ACTIVE'
       AND lower(country.name) NOT IN (lower('Dingling Konfederasyonu'),lower('Xianbei Konfederasyonu'));

    INSERT INTO steppe_tributaries(guild_id,country_id,loyalty,status,joined_turn)
    SELECT country.guild_id,country.id,
           CASE WHEN lower(country.name)=lower('Xianbei Konfederasyonu') THEN 60 ELSE 45 END,
           'ACTIVE',guild.current_turn
      FROM countries country
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN steppe_hegemonies hegemony ON hegemony.guild_id=country.guild_id
     WHERE country.status='ACTIVE'
       AND lower(country.name) IN (lower('Dingling Konfederasyonu'),lower('Xianbei Konfederasyonu'))
    ON CONFLICT(guild_id,country_id) DO UPDATE SET
      status='ACTIVE',ended_turn=NULL,updated_at=NOW();

    UPDATE steppe_internal_conflicts
       SET status='CANCELLED',resolved_by='SYSTEM:STEPPE_KHANATES_V182',
           resolution_reason='Toprak Ağası katmanı kaldırıldı.',updated_at=NOW()
     WHERE status='ACTIVE';
    UPDATE steppe_war_calls
       SET status='CANCELLED',closed_by='SYSTEM:STEPPE_KHANATES_V182',closed_at=NOW()
     WHERE status='OPEN';
  `
} as const;
