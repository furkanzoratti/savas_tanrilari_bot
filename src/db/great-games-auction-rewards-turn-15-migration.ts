export const greatGamesAuctionRewardsTurn15Migration = {
  version: 135,
  name: "great_games_auction_rewards_turn_15",
  sql: `
    ALTER TABLE settlements
      ADD COLUMN IF NOT EXISTS resource_production_minimum INTEGER
      CHECK (resource_production_minimum IS NULL OR resource_production_minimum >= 0);

    WITH target AS (
      SELECT settlement.id
        FROM settlements settlement
        JOIN countries country ON country.id=settlement.country_id
       WHERE lower(country.name)=lower('Büyük Britanya')
         AND lower(settlement.name)=lower('Eildon')
         AND country.status='ACTIVE'
    )
    INSERT INTO naval_units(settlement_id,ship_type,quantity,status)
    SELECT id,'quinquereme',4,'RESERVE' FROM target
    ON CONFLICT(settlement_id,ship_type,status)
    DO UPDATE SET quantity=naval_units.quantity+EXCLUDED.quantity;

    WITH target AS (
      SELECT settlement.id AS settlement_id,country.id AS country_id
        FROM settlements settlement
        JOIN countries country ON country.id=settlement.country_id
       WHERE lower(country.name)=lower('Saketler')
         AND lower(settlement.name)=lower('Pundra')
         AND country.status='ACTIVE'
    )
    INSERT INTO siege_assets(settlement_id,country_id,asset_type,quantity,location_note,enhanced_quantity)
    SELECT settlement_id,country_id,'siege_tower',4,NULL,0 FROM target
    ON CONFLICT(country_id,settlement_id,asset_type,location_note)
    DO UPDATE SET quantity=siege_assets.quantity+EXCLUDED.quantity;

    UPDATE settlements settlement
       SET resource_type='SPICES',
           resource_production_minimum=4
      FROM countries country
     WHERE country.id=settlement.country_id
       AND lower(country.name)=lower('Fenike-Aram')
       AND lower(settlement.name)=lower('Antakya')
       AND country.status='ACTIVE';
  `
} as const;
