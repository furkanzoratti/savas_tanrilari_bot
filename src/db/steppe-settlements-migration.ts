interface SteppeSettlementSeed {
  country:string;
  name:string;
  population:number;
  landTradeIncome:number;
  resource:string;
  culture:string;
  holdingTitle:string|null;
  commonLabel:string|null;
}

const settlements:readonly SteppeSettlementSeed[]=[
  {country:"Dingling Konfederasyonu",name:"Baykal Kışlağı",population:44_000,landTradeIncome:3_200,resource:"HORSES",culture:"DINGLING",holdingTitle:"Dingling Hanı",commonLabel:null},
  {country:"Dingling Konfederasyonu",name:"Angara Geçidi",population:38_000,landTradeIncome:2_800,resource:"TIMBER",culture:"DINGLING",holdingTitle:"Dingling Hanı",commonLabel:null},
  {country:"Dingling Konfederasyonu",name:"Barguzin Vadisi",population:28_000,landTradeIncome:1_800,resource:"LEATHER",culture:"DINGLING",holdingTitle:"Baykal Toprak Ağası",commonLabel:null},
  {country:"Dingling Konfederasyonu",name:"Uda Otlakları",population:31_000,landTradeIncome:2_100,resource:"HORSES",culture:"DINGLING",holdingTitle:"Baykal Toprak Ağası",commonLabel:null},
  {country:"Dingling Konfederasyonu",name:"Sayan Yaylası",population:35_000,landTradeIncome:2_300,resource:"IRON",culture:"DINGLING",holdingTitle:"Sayan Toprak Ağası",commonLabel:null},
  {country:"Dingling Konfederasyonu",name:"Yukarı Yenisey",population:42_000,landTradeIncome:3_100,resource:"TIMBER",culture:"DINGLING",holdingTitle:"Sayan Toprak Ağası",commonLabel:null},
  {country:"Dingling Konfederasyonu",name:"Minusinsk Ortak Otlakları",population:47_000,landTradeIncome:3_600,resource:"GRAIN",culture:"DINGLING",holdingTitle:null,commonLabel:"Konfederasyon Ortak Otlakları"},

  {country:"Xianbei Konfederasyonu",name:"Xianbei Dağı Ordugâhı",population:46_000,landTradeIncome:3_200,resource:"HORSES",culture:"XIANBEI",holdingTitle:"Xianbei Hanı",commonLabel:null},
  {country:"Xianbei Konfederasyonu",name:"Tuul Kışlağı",population:40_000,landTradeIncome:2_800,resource:"LEATHER",culture:"XIANBEI",holdingTitle:"Xianbei Hanı",commonLabel:null},
  {country:"Xianbei Konfederasyonu",name:"Hangay Yaylası",population:43_000,landTradeIncome:3_000,resource:"HORSES",culture:"XIANBEI",holdingTitle:"Hangay Toprak Ağası",commonLabel:null},
  {country:"Xianbei Konfederasyonu",name:"Orhun Kavşağı",population:49_000,landTradeIncome:3_800,resource:"IRON",culture:"XIANBEI",holdingTitle:"Hangay Toprak Ağası",commonLabel:null},
  {country:"Xianbei Konfederasyonu",name:"Khentii Otlakları",population:36_000,landTradeIncome:2_600,resource:"TIMBER",culture:"XIANBEI",holdingTitle:"Khentii Toprak Ağası",commonLabel:null},
  {country:"Xianbei Konfederasyonu",name:"Ongin Geçidi",population:32_000,landTradeIncome:2_200,resource:"GRAIN",culture:"XIANBEI",holdingTitle:"Khentii Toprak Ağası",commonLabel:null},

  {country:"Xiongnu Konfederasyonu",name:"Longcheng Ordugâhı",population:49_000,landTradeIncome:4_500,resource:"HORSES",culture:"XIONGNU",holdingTitle:"Xiongnu Hanı",commonLabel:null},
  {country:"Xiongnu Konfederasyonu",name:"Kerulen Kışlağı",population:45_000,landTradeIncome:3_600,resource:"LEATHER",culture:"XIONGNU",holdingTitle:"Xiongnu Hanı",commonLabel:null},
  {country:"Xiongnu Konfederasyonu",name:"Onon Geçidi",population:38_000,landTradeIncome:2_900,resource:"HORSES",culture:"XIONGNU",holdingTitle:"Onon Toprak Ağası",commonLabel:null},
  {country:"Xiongnu Konfederasyonu",name:"Argun Otlakları",population:34_000,landTradeIncome:2_600,resource:"IRON",culture:"XIONGNU",holdingTitle:"Onon Toprak Ağası",commonLabel:null},
  {country:"Xiongnu Konfederasyonu",name:"Hulun Gölü",population:43_000,landTradeIncome:3_500,resource:"GRAIN",culture:"XIONGNU",holdingTitle:"Hulun Toprak Ağası",commonLabel:null},
  {country:"Xiongnu Konfederasyonu",name:"Buir Gölü",population:37_000,landTradeIncome:2_800,resource:"LEATHER",culture:"XIONGNU",holdingTitle:"Hulun Toprak Ağası",commonLabel:null},
  {country:"Xiongnu Konfederasyonu",name:"Büyük Khingan",population:31_000,landTradeIncome:2_400,resource:"TIMBER",culture:"XIONGNU",holdingTitle:"Khingan Toprak Ağası",commonLabel:null},
  {country:"Xiongnu Konfederasyonu",name:"Nen Nehri Pazarı",population:46_000,landTradeIncome:4_200,resource:"SILK",culture:"XIONGNU",holdingTitle:"Khingan Toprak Ağası",commonLabel:null}
] as const;

const titleSeeds=[
  ["Dingling Konfederasyonu","Baykal Toprak Ağası",62,10],
  ["Dingling Konfederasyonu","Sayan Toprak Ağası",58,5],
  ["Xianbei Konfederasyonu","Hangay Toprak Ağası",64,12],
  ["Xianbei Konfederasyonu","Khentii Toprak Ağası",60,8],
  ["Xiongnu Konfederasyonu","Onon Toprak Ağası",68,15],
  ["Xiongnu Konfederasyonu","Hulun Toprak Ağası",63,10],
  ["Xiongnu Konfederasyonu","Khingan Toprak Ağası",57,4]
] as const;

const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
const settlementValues=settlements.map((row)=>`(${quote(row.country)},${quote(row.name)},${row.population},${row.landTradeIncome},${quote(row.resource)},${quote(row.culture)},${row.holdingTitle?quote(row.holdingTitle):"NULL"},${row.commonLabel?quote(row.commonLabel):"NULL"})`).join(",\n      ");
const titleValues=titleSeeds.map(([country,title,loyalty,relation])=>`(${quote(country)},${quote(title)},${loyalty},${relation})`).join(",\n      ");

export const steppeSettlementsMigration={
  version:168,
  name:"inner_asian_steppe_settlements_and_holdings",
  sql:`
    CREATE TEMP TABLE steppe_settlement_seed_v168(
      country_name TEXT NOT NULL,
      settlement_name TEXT NOT NULL,
      population BIGINT NOT NULL,
      land_trade_income BIGINT NOT NULL,
      resource_type TEXT NOT NULL,
      culture_group TEXT NOT NULL,
      holding_title TEXT,
      common_label TEXT
    ) ON COMMIT DROP;
    INSERT INTO steppe_settlement_seed_v168 VALUES
      ${settlementValues};

    UPDATE countries SET primary_culture_group=CASE lower(name)
      WHEN lower('Dingling Konfederasyonu') THEN 'DINGLING'
      WHEN lower('Xianbei Konfederasyonu') THEN 'XIANBEI'
      WHEN lower('Xiongnu Konfederasyonu') THEN 'XIONGNU'
      ELSE primary_culture_group END
     WHERE status='ACTIVE' AND lower(name) IN (
       lower('Dingling Konfederasyonu'),lower('Xianbei Konfederasyonu'),lower('Xiongnu Konfederasyonu')
     );

    INSERT INTO settlements(
      country_id,name,population,slave_population,base_income,tax_income,land_trade_income,sea_trade_income,
      base_land_trade_income,base_population_growth,resource_type,culture_group,religion_key,
      religion_adherence_percent,local_treasury,is_coastal,tax_rate_percent
    )
    SELECT country.id,seed.settlement_name,seed.population,0,0,0,0,0,
           seed.land_trade_income,0,seed.resource_type,seed.culture_group,'INNER_ASIAN_SKY_FAITH',85,0,FALSE,3
      FROM steppe_settlement_seed_v168 seed
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
     USING settlements settlement,countries country,steppe_settlement_seed_v168 seed
     WHERE shares.settlement_id=settlement.id AND settlement.country_id=country.id
       AND lower(country.name)=lower(seed.country_name) AND lower(settlement.name)=lower(seed.settlement_name);
    INSERT INTO settlement_religion_shares(settlement_id,religion_key,primary_percent,secondary_percent)
    SELECT settlement.id,'INNER_ASIAN_SKY_FAITH',85,15
      FROM settlements settlement
      JOIN countries country ON country.id=settlement.country_id
      JOIN steppe_settlement_seed_v168 seed
        ON lower(country.name)=lower(seed.country_name) AND lower(settlement.name)=lower(seed.settlement_name);

    CREATE TEMP TABLE steppe_title_seed_v168(
      country_name TEXT NOT NULL,title_name TEXT NOT NULL,loyalty INTEGER NOT NULL,relation_score INTEGER NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO steppe_title_seed_v168 VALUES
      ${titleValues};

    INSERT INTO steppe_internal_titles(
      confederation_id,tier,title_name,holder_name,holder_user_id,liege_title_id,
      loyalty,relation_score,created_turn
    )
    SELECT confederation.id,'LANDHOLDER',seed.title_name,'Henüz Atanmadı',NULL,khan.id,
           seed.loyalty,seed.relation_score,guild.current_turn
      FROM steppe_title_seed_v168 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name) AND country.status='ACTIVE'
      JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
      JOIN steppe_internal_titles khan ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=confederation.guild_id
     WHERE NOT EXISTS(
       SELECT 1 FROM steppe_internal_titles existing
        WHERE existing.confederation_id=confederation.id AND existing.status='ACTIVE'
          AND lower(existing.title_name)=lower(seed.title_name)
     );

    DELETE FROM steppe_title_holdings holding
     USING settlements settlement,countries country,steppe_settlement_seed_v168 seed
     WHERE holding.settlement_id=settlement.id AND settlement.country_id=country.id
       AND lower(country.name)=lower(seed.country_name) AND lower(settlement.name)=lower(seed.settlement_name);
    INSERT INTO steppe_title_holdings(title_id,settlement_id,assigned_turn,assigned_by)
    SELECT title.id,settlement.id,guild.current_turn,'SYSTEM'
      FROM steppe_settlement_seed_v168 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name) AND country.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN settlements settlement ON settlement.country_id=country.id AND lower(settlement.name)=lower(seed.settlement_name)
      JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
      JOIN steppe_internal_titles title
        ON title.confederation_id=confederation.id AND title.status='ACTIVE' AND lower(title.title_name)=lower(seed.holding_title)
     WHERE seed.holding_title IS NOT NULL
    ON CONFLICT(settlement_id) DO UPDATE SET
      title_id=EXCLUDED.title_id,assigned_turn=EXCLUDED.assigned_turn,assigned_by=EXCLUDED.assigned_by;

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
      FROM steppe_settlement_seed_v168 seed
      JOIN countries country ON lower(country.name)=lower(seed.country_name) AND country.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=country.guild_id
      JOIN settlements settlement ON settlement.country_id=country.id AND lower(settlement.name)=lower(seed.settlement_name)
      JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
     WHERE seed.common_label IS NOT NULL
    ON CONFLICT(settlement_id) DO UPDATE SET label=EXCLUDED.label;
  `
} as const;

export const STEPPE_SETTLEMENT_SEEDS=settlements;
