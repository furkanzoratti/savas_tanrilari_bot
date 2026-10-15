export const scandinavianTreasuryRepairMigration = {
  version: 208,
  name: "scandinavian_starting_treasury_repair",
  sql: `
    CREATE TEMP TABLE scandinavian_treasury_repair_v208 ON COMMIT DROP AS
    SELECT settlement.id AS settlement_id,settlement.country_id,settlement.name,
           settlement.local_treasury,guild.current_turn,
           CASE WHEN settlement.last_acquisition_income>0
             THEN settlement.last_acquisition_income
             ELSE GREATEST(0,
               FLOOR(settlement.population*settlement.tax_rate_percent/100.0)
               +settlement.base_land_trade_income+settlement.manual_flat_income
             )
           END::bigint AS income_grant
      FROM settlements settlement
      JOIN countries country ON country.id=settlement.country_id AND country.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=country.guild_id
     WHERE lower(country.name) IN (
       lower('Svege Krallığı'),lower('Kimbri Krallığı'),
       lower('Hedin Krallığı'),lower('Gaut Krallığı')
     )
       AND NOT EXISTS (
         SELECT 1 FROM transactions ledger
          WHERE ledger.settlement_id=settlement.id
            AND ledger.details->>'source'='scandinavian-starting-assets-v206'
       );

    UPDATE settlements settlement
       SET local_treasury=settlement.local_treasury+repair.income_grant
      FROM scandinavian_treasury_repair_v208 repair
     WHERE settlement.id=repair.settlement_id;

    INSERT INTO transactions(
      country_id,settlement_id,turn,kind,amount,description,balance_after,details
    )
    SELECT repair.country_id,repair.settlement_id,repair.current_turn,'ADMIN_ADJUSTMENT',repair.income_grant,
           repair.name||': İskandinav başlangıç hazinesi telafisi',
           repair.local_treasury+repair.income_grant,
           jsonb_build_object('source','scandinavian-starting-treasury-repair-v208','incomeBasis',
             CASE WHEN repair.income_grant>0 THEN 'last_or_projected_income' ELSE 'zero_income' END)
      FROM scandinavian_treasury_repair_v208 repair;

    UPDATE countries country
       SET treasury=COALESCE((
         SELECT SUM(settlement.local_treasury)::bigint
           FROM settlements settlement
          WHERE settlement.country_id=country.id
       ),0)
     WHERE lower(country.name) IN (
       lower('Svege Krallığı'),lower('Kimbri Krallığı'),
       lower('Hedin Krallığı'),lower('Gaut Krallığı')
     );
  `
} as const;
