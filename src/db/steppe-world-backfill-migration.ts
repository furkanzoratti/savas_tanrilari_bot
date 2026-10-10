import {STEPPE_SETTLEMENT_SEEDS,STEPPE_TITLE_SEEDS} from "./steppe-settlements-migration.js";

const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
const settlementValues=STEPPE_SETTLEMENT_SEEDS.map((row)=>
  `(${quote(row.country)},${quote(row.name)},${row.population},${row.landTradeIncome},${quote(row.resource)},${quote(row.culture)},${row.holdingTitle?quote(row.holdingTitle):"NULL"},${row.commonLabel?quote(row.commonLabel):"NULL"})`
).join(",\n      ");
const titleValues=STEPPE_TITLE_SEEDS.map(([country,title,loyalty,relation])=>
  `(${quote(country)},${quote(title)},${loyalty},${relation})`
).join(",\n      ");

/**
 * Migrations 166 and 168 originally assumed that Xiongnu already existed.  On a
 * live database where those versions were recorded without inserting anything,
 * changing the old migrations cannot repair the data.  This migration is an
 * idempotent, non-destructive backfill for the complete steppe world.
 */
export const steppeWorldBackfillMigration={
  version:169,
  name:"steppe_world_states_settlements_and_governance_backfill",
  sql:`
    UPDATE countries
       SET status='ACTIVE'
     WHERE lower(name) IN (
       lower('Dingling Konfederasyonu'),lower('Xianbei Konfederasyonu'),lower('Xiongnu Konfederasyonu')
     );

    INSERT INTO countries(guild_id,name,treasury)
    SELECT guild.discord_id,required.name,0
      FROM guilds guild
      CROSS JOIN (VALUES
        ('Dingling Konfederasyonu'),
        ('Xianbei Konfederasyonu'),
        ('Xiongnu Konfederasyonu')
      ) AS required(name)
     WHERE NOT EXISTS(
       SELECT 1 FROM countries existing
        WHERE existing.guild_id=guild.discord_id AND lower(existing.name)=lower(required.name)
     )
    ON CONFLICT(guild_id,name) DO NOTHING;

    UPDATE countries SET primary_culture_group=CASE lower(name)
      WHEN lower('Dingling Konfederasyonu') THEN 'DINGLING'
      WHEN lower('Xianbei Konfederasyonu') THEN 'XIANBEI'
      WHEN lower('Xiongnu Konfederasyonu') THEN 'XIONGNU'
      ELSE primary_culture_group END
     WHERE status='ACTIVE' AND lower(name) IN (
       lower('Dingling Konfederasyonu'),lower('Xianbei Konfederasyonu'),lower('Xiongnu Konfederasyonu')
     );

    INSERT INTO steppe_confederations(guild_id,country_id,authority,created_turn,created_by)
    SELECT country.guild_id,country.id,70,guild.current_turn,'SYSTEM'
      FROM countries country
      JOIN guilds guild ON guild.discord_id=country.guild_id
     WHERE country.status='ACTIVE' AND lower(country.name) IN (
       lower('Xiongnu Konfederasyonu'),lower('Xianbei Konfederasyonu'),lower('Dingling Konfederasyonu')
     )
    ON CONFLICT(guild_id,country_id) DO UPDATE SET status='ACTIVE',updated_at=NOW();

    INSERT INTO steppe_internal_titles(
      confederation_id,tier,title_name,holder_name,holder_user_id,loyalty,relation_score,created_turn
    )
    SELECT confederation.id,'KHAN',replace(country.name,' Konfederasyonu','')||' Hanı',
           'Henüz Atanmadı',NULL,100,100,guild.current_turn
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

    CREATE TEMP TABLE steppe_settlement_seed_v169(
      country_name TEXT NOT NULL,
      settlement_name TEXT NOT NULL,
      population BIGINT NOT NULL,
      land_trade_income BIGINT NOT NULL,
      resource_type TEXT NOT NULL,
      culture_group TEXT NOT NULL,
      holding_title TEXT,
      common_label TEXT
    ) ON COMMIT DROP;
    INSERT INTO steppe_settlement_seed_v169 VALUES
      ${settlementValues};

    INSERT INTO settlements(
      country_id,name,population,slave_population,base_income,tax_income,land_trade_income,sea_trade_income,
      base_land_trade_income,base_population_growth,resource_type,culture_group,religion_key,
      religion_adherence_percent,local_treasury,is_coastal,tax_rate_percent
    )
    SELECT country.id,seed.settlement_name,seed.population,0,0,0,0,0,
           seed.land_trade_income,0,seed.resource_type,seed.culture_group,'INNER_ASIAN_SKY_FAITH',85,0,FALSE,3
      FROM steppe_settlement_seed_v169 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name) AND country.status='ACTIVE'
     WHERE NOT EXISTS(
       SELECT 1 FROM settlements existing
        WHERE existing.country_id=country.id AND lower(existing.name)=lower(seed.settlement_name)
     )
    ON CONFLICT(country_id,name) DO NOTHING;

    INSERT INTO settlement_religion_shares(settlement_id,religion_key,primary_percent,secondary_percent)
    SELECT settlement.id,'INNER_ASIAN_SKY_FAITH',85,15
      FROM settlements settlement
      JOIN countries country ON country.id=settlement.country_id
      JOIN steppe_settlement_seed_v169 seed
        ON lower(country.name)=lower(seed.country_name) AND lower(settlement.name)=lower(seed.settlement_name)
     WHERE NOT EXISTS(
       SELECT 1 FROM settlement_religion_shares existing WHERE existing.settlement_id=settlement.id
     )
    ON CONFLICT(settlement_id,religion_key) DO NOTHING;

    CREATE TEMP TABLE steppe_title_seed_v169(
      country_name TEXT NOT NULL,title_name TEXT NOT NULL,loyalty INTEGER NOT NULL,relation_score INTEGER NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO steppe_title_seed_v169 VALUES
      ${titleValues};

    INSERT INTO steppe_internal_titles(
      confederation_id,tier,title_name,holder_name,holder_user_id,liege_title_id,
      loyalty,relation_score,created_turn
    )
    SELECT confederation.id,'LANDHOLDER',seed.title_name,'Henüz Atanmadı',NULL,khan.id,
           seed.loyalty,seed.relation_score,guild.current_turn
      FROM steppe_title_seed_v169 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name) AND country.status='ACTIVE'
      JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
      JOIN steppe_internal_titles khan ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=confederation.guild_id
     WHERE NOT EXISTS(
       SELECT 1 FROM steppe_internal_titles existing
        WHERE existing.confederation_id=confederation.id AND existing.status='ACTIVE'
          AND lower(existing.title_name)=lower(seed.title_name)
     );

    INSERT INTO steppe_title_holdings(title_id,settlement_id,assigned_turn,assigned_by)
    SELECT title.id,settlement.id,guild.current_turn,'SYSTEM'
      FROM steppe_settlement_seed_v169 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name) AND country.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN settlements settlement ON settlement.country_id=country.id AND lower(settlement.name)=lower(seed.settlement_name)
      JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
      JOIN steppe_internal_titles title
        ON title.confederation_id=confederation.id AND title.status='ACTIVE' AND lower(title.title_name)=lower(seed.holding_title)
     WHERE seed.holding_title IS NOT NULL
    ON CONFLICT(settlement_id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS steppe_common_holdings(
      confederation_id UUID NOT NULL REFERENCES steppe_confederations(id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      created_turn INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(confederation_id,settlement_id),
      UNIQUE(settlement_id)
    );
    INSERT INTO steppe_common_holdings(confederation_id,settlement_id,label,created_turn)
    SELECT confederation.id,settlement.id,seed.common_label,guild.current_turn
      FROM steppe_settlement_seed_v169 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name) AND country.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN settlements settlement ON settlement.country_id=country.id AND lower(settlement.name)=lower(seed.settlement_name)
      JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
     WHERE seed.common_label IS NOT NULL
    ON CONFLICT(settlement_id) DO NOTHING;

    INSERT INTO steppe_hegemonies(guild_id,hegemon_country_id,authority,created_turn)
    SELECT xiongnu.guild_id,xiongnu.id,75,guild.current_turn
      FROM countries xiongnu
      JOIN guilds guild ON guild.discord_id=xiongnu.guild_id
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
