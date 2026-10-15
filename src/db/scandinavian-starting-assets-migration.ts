export const scandinavianStartingAssetsMigration = {
  version: 206,
  name: "scandinavian_starting_ships_and_treasury",
  sql: `
    CREATE TEMP TABLE scandinavian_starting_settlements_v206 ON COMMIT DROP AS
    SELECT settlement.id AS settlement_id,settlement.country_id,settlement.name,
           settlement.local_treasury,
           CASE WHEN settlement.last_acquisition_income>0
             THEN settlement.last_acquisition_income
             ELSE GREATEST(0,
               FLOOR(settlement.population*settlement.tax_rate_percent/100.0)
               +settlement.base_land_trade_income+settlement.manual_flat_income
             )
           END::bigint AS income_grant,
           settlement.is_coastal,guild.current_turn
      FROM settlements settlement
      JOIN countries country ON country.id=settlement.country_id AND country.status='ACTIVE'
      JOIN guilds guild ON guild.discord_id=country.guild_id
     WHERE lower(country.name) IN (
       lower('Svege Krallığı'),lower('Kimbri Krallığı'),
       lower('Hedin Krallığı'),lower('Gaut Krallığı')
     );

    INSERT INTO naval_units(settlement_id,ship_type,quantity,status)
    SELECT settlement_id,'hjortspring',10,'RESERVE'
      FROM scandinavian_starting_settlements_v206
     WHERE is_coastal=TRUE
    ON CONFLICT(settlement_id,ship_type,status)
    DO UPDATE SET quantity=naval_units.quantity+EXCLUDED.quantity;

    UPDATE settlements settlement
       SET local_treasury=settlement.local_treasury+seed.income_grant
      FROM scandinavian_starting_settlements_v206 seed
     WHERE settlement.id=seed.settlement_id;

    INSERT INTO transactions(
      country_id,settlement_id,turn,kind,amount,description,balance_after,details
    )
    SELECT seed.country_id,seed.settlement_id,seed.current_turn,'ADMIN_ADJUSTMENT',seed.income_grant,
           seed.name||': İskandinav başlangıç hazinesi',
           seed.local_treasury+seed.income_grant,
           jsonb_build_object('source','scandinavian-starting-assets-v206','incomeBasis',
             CASE WHEN seed.income_grant>0 THEN 'last_or_projected_income' ELSE 'zero_income' END)
      FROM scandinavian_starting_settlements_v206 seed
     WHERE seed.income_grant>0;

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
