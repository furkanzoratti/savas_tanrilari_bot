import {CULTURE_GROUPS} from "../domain/cultures.js";

const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
const cultureKeys=Object.keys(CULTURE_GROUPS).map(quote).join(",");

export const LANGKASUKA_SETTLEMENT_SEEDS=[
  {
    name:"Kedah",population:38_000,landTradeIncome:4_500,resource:"IRON",
    culture:"MALAYIC",religion:"BRAHMANISM",adherence:72
  },
  {
    name:"Mekong Deltası",population:50_000,landTradeIncome:5_200,resource:"GRAIN",
    culture:"SOUTHEAST_ASIAN",religion:"BUDDHISM",adherence:82
  }
] as const;

const settlementValues=LANGKASUKA_SETTLEMENT_SEEDS.map((seed)=>
  `(${quote(seed.name)},${seed.population},${seed.landTradeIncome},${quote(seed.resource)},${quote(seed.culture)},${quote(seed.religion)},${seed.adherence})`
).join(",\n      ");

export const langkasukaStateMigration={
  version:174,
  name:"langkasuka_country_culture_and_settlements",
  sql:`
    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_culture_group_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_culture_group_check
      CHECK (culture_group IN (${cultureKeys}));
    ALTER TABLE countries DROP CONSTRAINT IF EXISTS countries_primary_culture_group_check;
    ALTER TABLE countries ADD CONSTRAINT countries_primary_culture_group_check
      CHECK (primary_culture_group IN (${cultureKeys}));

    UPDATE countries
       SET status='ACTIVE',primary_culture_group='MALAYIC'
     WHERE lower(name)=lower('Langkasuka');

    INSERT INTO countries(guild_id,name,treasury,primary_culture_group)
    SELECT guild.discord_id,'Langkasuka',0,'MALAYIC'
      FROM guilds guild
     WHERE NOT EXISTS(
       SELECT 1 FROM countries existing
        WHERE existing.guild_id=guild.discord_id AND lower(existing.name)=lower('Langkasuka')
     )
    ON CONFLICT(guild_id,name) DO NOTHING;

    CREATE TEMP TABLE langkasuka_settlement_seed_v174(
      settlement_name TEXT NOT NULL,
      population BIGINT NOT NULL,
      land_trade_income BIGINT NOT NULL,
      resource_type TEXT NOT NULL,
      culture_group TEXT NOT NULL,
      religion_key TEXT NOT NULL,
      religion_adherence_percent INTEGER NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO langkasuka_settlement_seed_v174 VALUES
      ${settlementValues};

    INSERT INTO settlements(
      country_id,name,population,slave_population,base_income,tax_income,land_trade_income,sea_trade_income,
      base_land_trade_income,base_population_growth,resource_type,culture_group,religion_key,
      religion_adherence_percent,local_treasury,is_coastal,tax_rate_percent
    )
    SELECT country.id,seed.settlement_name,seed.population,0,0,0,0,0,
           seed.land_trade_income,0,seed.resource_type,seed.culture_group,seed.religion_key,
           seed.religion_adherence_percent,0,TRUE,3
      FROM langkasuka_settlement_seed_v174 seed
      JOIN countries country ON lower(country.name)=lower('Langkasuka') AND country.status='ACTIVE'
    ON CONFLICT(country_id,name) DO UPDATE SET
      population=EXCLUDED.population,
      slave_population=0,
      base_land_trade_income=EXCLUDED.base_land_trade_income,
      resource_type=EXCLUDED.resource_type,
      culture_group=EXCLUDED.culture_group,
      religion_key=EXCLUDED.religion_key,
      religion_adherence_percent=EXCLUDED.religion_adherence_percent,
      is_coastal=TRUE,
      tax_rate_percent=3;

    DELETE FROM settlement_religion_shares shares
     USING settlements settlement,countries country,langkasuka_settlement_seed_v174 seed
     WHERE shares.settlement_id=settlement.id AND settlement.country_id=country.id
       AND lower(country.name)=lower('Langkasuka')
       AND lower(settlement.name)=lower(seed.settlement_name);

    INSERT INTO settlement_religion_shares(settlement_id,religion_key,primary_percent,secondary_percent)
    SELECT settlement.id,seed.religion_key,seed.religion_adherence_percent,100-seed.religion_adherence_percent
      FROM langkasuka_settlement_seed_v174 seed
      JOIN countries country ON lower(country.name)=lower('Langkasuka') AND country.status='ACTIVE'
      JOIN settlements settlement ON settlement.country_id=country.id
       AND lower(settlement.name)=lower(seed.settlement_name);
  `
} as const;
