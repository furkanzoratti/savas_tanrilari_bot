export const steppeDefaultStatesMigration={
  version:166,
  name:"steppe_default_states_and_internal_governance",
  sql:`
    INSERT INTO countries(guild_id,name,treasury)
    SELECT xiongnu.guild_id,required.name,0
      FROM countries xiongnu
      CROSS JOIN (VALUES('Dingling Konfederasyonu'),('Xianbei Konfederasyonu')) AS required(name)
     WHERE xiongnu.status='ACTIVE' AND lower(xiongnu.name)=lower('Xiongnu Konfederasyonu')
    ON CONFLICT(guild_id,name) DO NOTHING;

    INSERT INTO steppe_confederations(guild_id,country_id,authority,created_turn,created_by)
    SELECT country.guild_id,country.id,70,guild.current_turn,'SYSTEM'
      FROM countries country JOIN guilds guild ON guild.discord_id=country.guild_id
     WHERE country.status='ACTIVE' AND lower(country.name) IN (
       lower('Xiongnu Konfederasyonu'),lower('Xianbei Konfederasyonu'),lower('Dingling Konfederasyonu')
     )
    ON CONFLICT(guild_id,country_id) DO NOTHING;

    INSERT INTO steppe_internal_titles(
      confederation_id,tier,title_name,holder_name,holder_user_id,loyalty,relation_score,created_turn
    )
    SELECT confederation.id,'KHAN',replace(country.name,' Konfederasyonu','')||' Hanı','Henüz Atanmadı',NULL,100,100,guild.current_turn
      FROM steppe_confederations confederation
      JOIN countries country ON country.id=confederation.country_id
      JOIN guilds guild ON guild.discord_id=confederation.guild_id
     WHERE confederation.status='ACTIVE' AND country.status='ACTIVE'
       AND lower(country.name) IN (
         lower('Xiongnu Konfederasyonu'),lower('Xianbei Konfederasyonu'),lower('Dingling Konfederasyonu')
       )
       AND NOT EXISTS(
         SELECT 1 FROM steppe_internal_titles title
          WHERE title.confederation_id=confederation.id AND title.tier='KHAN' AND title.status='ACTIVE'
       );

    INSERT INTO steppe_hegemonies(guild_id,hegemon_country_id,authority,created_turn)
    SELECT xiongnu.guild_id,xiongnu.id,75,guild.current_turn
      FROM countries xiongnu JOIN guilds guild ON guild.discord_id=xiongnu.guild_id
     WHERE xiongnu.status='ACTIVE' AND lower(xiongnu.name)=lower('Xiongnu Konfederasyonu')
    ON CONFLICT(guild_id) DO UPDATE SET
      hegemon_country_id=EXCLUDED.hegemon_country_id,
      updated_at=NOW();

    INSERT INTO steppe_tributaries(guild_id,country_id,loyalty,status,joined_turn)
    SELECT country.guild_id,country.id,
           CASE WHEN lower(country.name)=lower('Xianbei Konfederasyonu') THEN 60 ELSE 45 END,
           'ACTIVE',guild.current_turn
      FROM countries country
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN steppe_hegemonies hegemony ON hegemony.guild_id=country.guild_id
     WHERE country.status='ACTIVE'
       AND lower(country.name) IN (lower('Xianbei Konfederasyonu'),lower('Dingling Konfederasyonu'))
    ON CONFLICT(guild_id,country_id) DO UPDATE SET
      status='ACTIVE',ended_turn=NULL,updated_at=NOW();
  `
} as const;
