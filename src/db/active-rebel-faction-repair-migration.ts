export const activeRebelFactionRepairMigration={
  version:175,
  name:"active_settlements_missing_rebel_faction_repair",
  sql:`
    WITH candidates AS (
      SELECT settlement.id AS settlement_id,settlement.country_id,country.guild_id,
             settlement.name AS settlement_name,settlement.population,settlement.slave_population,
             settlement.culture_group,settlement.religion_key,country.primary_culture_group,
             GREATEST(0,country.war_exhaustion)::numeric AS war_exhaustion,
             COALESCE(settlement.rebellion_faction_type,'POPULAR') AS faction_type,
             guild.current_turn,
             COALESCE(MAX(building.level) FILTER(WHERE building.building_type='engineering'
               AND building.status IN ('ACTIVE','BUILDING')),0)::integer AS engineering_level
        FROM settlements settlement
        JOIN countries country ON country.id=settlement.country_id
        JOIN guilds guild ON guild.discord_id=country.guild_id
        LEFT JOIN buildings building ON building.settlement_id=settlement.id
       WHERE settlement.rebellion_active=TRUE
         AND NOT EXISTS(
           SELECT 1 FROM rebel_factions existing
            WHERE existing.settlement_id=settlement.id
              AND existing.status IN ('ORGANIZING','ACTIVE','OCCUPYING')
         )
       GROUP BY settlement.id,country.id,country.guild_id,guild.current_turn
    ), sized AS (
      SELECT candidates.*,
             GREATEST(1000,LEAST(
               GREATEST(1000,LEAST(30000,FLOOR((population+slave_population)*0.20)))::integer,
               ROUND((CASE faction_type
                 WHEN 'SEPARATIST' THEN population*0.08+slave_population*0.03
                 WHEN 'RELIGIOUS' THEN population*0.07+slave_population*0.02
                 WHEN 'SLAVE' THEN population*0.02+slave_population*0.20
                 ELSE population*0.06+slave_population*0.02
               END)*(1+war_exhaustion/500)/100)*100
             ))::integer AS personnel
        FROM candidates
    ), composed AS (
      SELECT sized.*,
             CASE faction_type
               WHEN 'SEPARATIST' THEN jsonb_build_object(
                 'light_infantry',personnel*15/100,'spear',personnel*20/100,'archer',personnel*15/100,
                 'heavy_infantry',personnel*25/100,'light_cavalry',personnel*15/100,'heavy_cavalry',personnel*10/100)
               WHEN 'RELIGIOUS' THEN jsonb_build_object(
                 'light_infantry',personnel*20/100,'spear',personnel*25/100,'archer',personnel*20/100,
                 'heavy_infantry',personnel*20/100,'light_cavalry',personnel*10/100,'heavy_cavalry',personnel*5/100)
               WHEN 'SLAVE' THEN jsonb_build_object(
                 'light_infantry',personnel*30/100,'spear',personnel*30/100,'slinger',personnel*15/100,
                 'archer',personnel*10/100,'heavy_infantry',personnel*10/100,'light_cavalry',personnel*5/100)
               ELSE jsonb_build_object(
                 'light_infantry',personnel*25/100,'spear',personnel*25/100,'archer',personnel*15/100,
                 'heavy_infantry',personnel*20/100,'light_cavalry',personnel*10/100,'heavy_cavalry',personnel*5/100)
             END AS composition
        FROM sized
    ), ready AS (
      SELECT composed.*,
             CASE faction_type
               WHEN 'SEPARATIST' THEN settlement_name||' Özgürlük Birliği'
               WHEN 'RELIGIOUS' THEN settlement_name||' İnanç Muhafızları'
               WHEN 'SLAVE' THEN settlement_name||' Zincirkıranları'
               ELSE settlement_name||' Halk Birliği'
             END AS display_name,
             (SELECT ROUND(SUM((entry.value)::integer*CASE entry.key
               WHEN 'light_infantry' THEN 1.0 WHEN 'spear' THEN 1.6 WHEN 'slinger' THEN 1.3
               WHEN 'archer' THEN 2.0 WHEN 'heavy_infantry' THEN 2.6
               WHEN 'light_cavalry' THEN 2.4 WHEN 'heavy_cavalry' THEN 3.3 ELSE 1.0 END))::bigint
                FROM jsonb_each_text(composition) entry) AS military_power,
             jsonb_strip_nulls(jsonb_build_object(
               'ladder_group',LEAST(8,CEIL(personnel/2000.0)::integer),
               'ram',CASE WHEN personnel>=4000 THEN 1 END,
               'mantlet',NULLIF(LEAST(5,FLOOR(personnel/4000.0)::integer),0),
               'ballista',NULLIF((CASE WHEN engineering_level>=1 THEN 1 ELSE 0 END)
                 +(CASE WHEN faction_type='SEPARATIST' THEN 1 ELSE 0 END),0),
               'catapult',CASE WHEN engineering_level>=2 THEN 1 END,
               'siege_tower',CASE WHEN engineering_level>=3 THEN 1 END
             )) AS siege_assets
        FROM composed
    )
    INSERT INTO rebel_factions(
      guild_id,settlement_id,against_country_id,faction_type,display_name,
      target_religion_key,target_culture_group,status,started_turn,outbreak_turn,
      personnel,military_power,composition,cause_snapshot,army_name,leader_name,
      leader_skill_bonus,siege_assets
    )
    SELECT guild_id,settlement_id,country_id,faction_type,display_name,
           CASE WHEN faction_type='RELIGIOUS' THEN religion_key END,
           CASE WHEN faction_type='SEPARATIST' THEN culture_group END,
           'ACTIVE',current_turn,current_turn,personnel,military_power,composition,
           jsonb_build_object('source','active-settlement-repair-v175'),
           display_name||' Ordusu',
           CASE primary_culture_group
             WHEN 'ITALIC' THEN 'Marcus Varro' WHEN 'HELLENIC' THEN 'Damon Kallistratos'
             WHEN 'PUNIC' THEN 'Hanno Giskonid' WHEN 'EGYPTIAN' THEN 'Pamenes Hori'
             WHEN 'WEST_IRANIAN' THEN 'Artaban Surena' WHEN 'EAST_IRANIAN' THEN 'Spitamenes Baktriyalı'
             WHEN 'BRITTONIC' THEN 'Caratacos ap Brigantos' WHEN 'GERMANIC' THEN 'Arminius Cherusk'
             ELSE settlement_name||' İsyan Önderi'
           END,
           (1+MOD(hashtext(settlement_id::text)::bigint+2147483648,3))::smallint,
           siege_assets
      FROM ready
    ON CONFLICT DO NOTHING;
  `
} as const;
