import {CULTURE_GROUPS} from "../domain/cultures.js";
import {RELIGIONS,SECONDARY_RELIGIONS} from "../domain/religions.js";
import type {CultureGroup} from "../domain/cultures.js";
import type {ReligionKey} from "../domain/religions.js";
import type {ResourceType} from "../domain/resources.js";

interface CentralAsianStateSeed{
  country:string;
  primaryCulture:CultureGroup;
}

export interface CentralAsianSettlementSeed{
  country:string;
  name:string;
  population:number;
  landTradeIncome:number;
  resource:ResourceType;
  culture:CultureGroup;
  religion:ReligionKey;
  adherence:number;
}

export const CENTRAL_ASIAN_STATE_SEEDS:readonly CentralAsianStateSeed[]=[
  {country:"Kangju Konfederasyonu",primaryCulture:"KANGJU"},
  {country:"Usunlar",primaryCulture:"WUSUN"},
  {country:"Kaşgar",primaryCulture:"TARIM_SAKA"},
  {country:"Qiang Kabileleri",primaryCulture:"QIANG"}
] as const;

export const CENTRAL_ASIAN_SETTLEMENT_SEEDS:readonly CentralAsianSettlementSeed[]=[
  {country:"Kangju Konfederasyonu",name:"Aral Bozkırları",population:27_000,landTradeIncome:1_800,resource:"LEATHER",culture:"KANGJU",religion:"SCYTHO_SARMATIAN_FAITH",adherence:82},
  {country:"Kangju Konfederasyonu",name:"Yedisu",population:39_000,landTradeIncome:3_200,resource:"HORSES",culture:"KANGJU",religion:"SCYTHO_SARMATIAN_FAITH",adherence:82},
  {country:"Kangju Konfederasyonu",name:"Davan",population:47_000,landTradeIncome:4_500,resource:"HORSES",culture:"KANGJU",religion:"SCYTHO_SARMATIAN_FAITH",adherence:85},

  {country:"Usunlar",name:"Çigu Kalesi",population:36_000,landTradeIncome:3_400,resource:"IRON",culture:"WUSUN",religion:"INNER_ASIAN_SKY_FAITH",adherence:85},
  {country:"Usunlar",name:"İli Vadisi",population:45_000,landTradeIncome:3_700,resource:"GRAIN",culture:"WUSUN",religion:"INNER_ASIAN_SKY_FAITH",adherence:85},
  {country:"Usunlar",name:"Tanrı Dağı Geçidi",population:23_000,landTradeIncome:2_500,resource:"IRON",culture:"WUSUN",religion:"INNER_ASIAN_SKY_FAITH",adherence:85},
  {country:"Usunlar",name:"Tarbagatay Etekleri",population:30_000,landTradeIncome:2_300,resource:"HORSES",culture:"WUSUN",religion:"INNER_ASIAN_SKY_FAITH",adherence:85},

  {country:"Kaşgar",name:"Kaşgar",population:42_000,landTradeIncome:5_200,resource:"LEATHER",culture:"TARIM_SAKA",religion:"SCYTHO_SARMATIAN_FAITH",adherence:72},
  {country:"Kaşgar",name:"Kuça",population:50_000,landTradeIncome:4_800,resource:"IRON",culture:"TOCHARIAN",religion:"BUDDHISM",adherence:80},
  {country:"Kaşgar",name:"Yarkent",population:36_000,landTradeIncome:4_200,resource:"GRAIN",culture:"TARIM_SAKA",religion:"SCYTHO_SARMATIAN_FAITH",adherence:78},
  {country:"Kaşgar",name:"Hotan",population:41_000,landTradeIncome:5_000,resource:"SILK",culture:"TARIM_SAKA",religion:"BUDDHISM",adherence:82},

  {country:"Qiang Kabileleri",name:"Zhang Zhung",population:32_000,landTradeIncome:2_400,resource:"GOLD",culture:"QIANG",religion:"QIANG_MOUNTAIN_FAITH",adherence:85},
  {country:"Qiang Kabileleri",name:"Kunlun Yaylası",population:22_000,landTradeIncome:1_700,resource:"LEATHER",culture:"QIANG",religion:"QIANG_MOUNTAIN_FAITH",adherence:85},
  {country:"Qiang Kabileleri",name:"Yarlung Vadisi",population:38_000,landTradeIncome:2_600,resource:"GRAIN",culture:"QIANG",religion:"QIANG_MOUNTAIN_FAITH",adherence:82}
] as const;

const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
const cultureKeys=Object.keys(CULTURE_GROUPS).map(quote).join(",");
const religionKeys=Object.keys(RELIGIONS).map(quote).join(",");
const secondaryKeys=Object.values(SECONDARY_RELIGIONS).map((religion)=>quote(religion.key)).join(",");
const secondaryCases=Object.entries(SECONDARY_RELIGIONS)
  .map(([religionKey,religion])=>`WHEN ${quote(religionKey)} THEN ${quote(religion.key)}`)
  .join("\n        ");
const countryValues=CENTRAL_ASIAN_STATE_SEEDS
  .map((seed)=>`(${quote(seed.country)},${quote(seed.primaryCulture)})`).join(",\n      ");
const settlementValues=CENTRAL_ASIAN_SETTLEMENT_SEEDS.map((seed)=>
  `(${quote(seed.country)},${quote(seed.name)},${seed.population},${seed.landTradeIncome},${quote(seed.resource)},${quote(seed.culture)},${quote(seed.religion)},${seed.adherence})`
).join(",\n      ");

export const centralAsianStatesMigration={
  version:172,
  name:"central_asian_states_cultures_religions_and_settlements",
  sql:`
    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_culture_group_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_culture_group_check
      CHECK (culture_group IN (${cultureKeys}));
    ALTER TABLE countries DROP CONSTRAINT IF EXISTS countries_primary_culture_group_check;
    ALTER TABLE countries ADD CONSTRAINT countries_primary_culture_group_check
      CHECK (primary_culture_group IN (${cultureKeys}));

    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_religion_key_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_religion_key_check
      CHECK (religion_key IN (${religionKeys}));
    ALTER TABLE settlement_religion_shares DROP CONSTRAINT IF EXISTS settlement_religion_shares_religion_key_check;
    ALTER TABLE settlement_religion_shares ADD CONSTRAINT settlement_religion_shares_religion_key_check
      CHECK (religion_key IN (${religionKeys}));
    ALTER TABLE missionary_operations DROP CONSTRAINT IF EXISTS missionary_operations_religion_key_check;
    ALTER TABLE missionary_operations ADD CONSTRAINT missionary_operations_religion_key_check
      CHECK (religion_key IN (${religionKeys}));

    CREATE OR REPLACE FUNCTION secondary_religion_for(primary_religion TEXT)
    RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
      SELECT CASE primary_religion
        ${secondaryCases}
        ELSE 'LOCAL_SYNCRETIC_CULTS'
      END
    $$;
    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_minority_religion_key_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_minority_religion_key_check
      CHECK (minority_religion_key IN (${secondaryKeys}));

    CREATE TEMP TABLE central_asian_country_seed_v172(
      country_name TEXT NOT NULL,
      primary_culture_group TEXT NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO central_asian_country_seed_v172 VALUES
      ${countryValues};

    UPDATE countries country
       SET status='ACTIVE',primary_culture_group=seed.primary_culture_group
      FROM central_asian_country_seed_v172 seed
     WHERE lower(country.name)=lower(seed.country_name);

    INSERT INTO countries(guild_id,name,treasury,primary_culture_group)
    SELECT guild.discord_id,seed.country_name,0,seed.primary_culture_group
      FROM guilds guild CROSS JOIN central_asian_country_seed_v172 seed
     WHERE NOT EXISTS(
       SELECT 1 FROM countries existing
        WHERE existing.guild_id=guild.discord_id AND lower(existing.name)=lower(seed.country_name)
     )
    ON CONFLICT(guild_id,name) DO NOTHING;

    CREATE TEMP TABLE central_asian_settlement_seed_v172(
      country_name TEXT NOT NULL,
      settlement_name TEXT NOT NULL,
      population BIGINT NOT NULL,
      land_trade_income BIGINT NOT NULL,
      resource_type TEXT NOT NULL,
      culture_group TEXT NOT NULL,
      religion_key TEXT NOT NULL,
      religion_adherence_percent INTEGER NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO central_asian_settlement_seed_v172 VALUES
      ${settlementValues};

    INSERT INTO settlements(
      country_id,name,population,slave_population,base_income,tax_income,land_trade_income,sea_trade_income,
      base_land_trade_income,base_population_growth,resource_type,culture_group,religion_key,
      religion_adherence_percent,local_treasury,is_coastal,tax_rate_percent
    )
    SELECT country.id,seed.settlement_name,seed.population,0,0,0,0,0,
           seed.land_trade_income,0,seed.resource_type,seed.culture_group,seed.religion_key,
           seed.religion_adherence_percent,0,FALSE,3
      FROM central_asian_settlement_seed_v172 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name) AND country.status='ACTIVE'
    ON CONFLICT(country_id,name) DO UPDATE SET
      population=EXCLUDED.population,
      slave_population=0,
      base_land_trade_income=EXCLUDED.base_land_trade_income,
      resource_type=EXCLUDED.resource_type,
      culture_group=EXCLUDED.culture_group,
      religion_key=EXCLUDED.religion_key,
      religion_adherence_percent=EXCLUDED.religion_adherence_percent,
      is_coastal=FALSE,
      tax_rate_percent=3;

    DELETE FROM settlement_religion_shares shares
     USING settlements settlement,countries country,central_asian_settlement_seed_v172 seed
     WHERE shares.settlement_id=settlement.id AND settlement.country_id=country.id
       AND lower(country.name)=lower(seed.country_name) AND lower(settlement.name)=lower(seed.settlement_name);
    INSERT INTO settlement_religion_shares(settlement_id,religion_key,primary_percent,secondary_percent)
    SELECT settlement.id,seed.religion_key,seed.religion_adherence_percent,100-seed.religion_adherence_percent
      FROM central_asian_settlement_seed_v172 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name) AND country.status='ACTIVE'
      JOIN settlements settlement ON settlement.country_id=country.id AND lower(settlement.name)=lower(seed.settlement_name);
  `
} as const;
