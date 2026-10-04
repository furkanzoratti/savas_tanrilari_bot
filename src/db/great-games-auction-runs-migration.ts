export const greatGamesAuctionRunsMigration = {
  version: 131,
  name: "great_games_auction_run_catalogs",
  sql: `
    ALTER TABLE great_games_auction_lots
      ADD COLUMN IF NOT EXISTS run_number INTEGER;

    UPDATE great_games_auction_lots lot
       SET run_number=GREATEST(1,COALESCE(season.current_run,1))
      FROM great_games_seasons season
     WHERE season.id=lot.season_id AND lot.run_number IS NULL;

    ALTER TABLE great_games_auction_lots
      ALTER COLUMN run_number SET DEFAULT 1,
      ALTER COLUMN run_number SET NOT NULL;

    ALTER TABLE great_games_auction_lots
      DROP CONSTRAINT IF EXISTS great_games_auction_lots_season_id_lot_order_key;
    ALTER TABLE great_games_auction_lots
      ADD CONSTRAINT great_games_auction_lots_season_run_lot_order_key
      UNIQUE(season_id,run_number,lot_order);

    CREATE INDEX IF NOT EXISTS great_games_auction_lots_run_idx
      ON great_games_auction_lots(season_id,run_number,phase);
  `
} as const;
