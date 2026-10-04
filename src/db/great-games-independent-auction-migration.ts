export const greatGamesIndependentAuctionMigration = {
  version: 133,
  name: "great_games_independent_auction_state",
  sql: `
    ALTER TABLE great_games_seasons
      ADD COLUMN IF NOT EXISTS auction_status TEXT NOT NULL DEFAULT 'IDLE',
      ADD COLUMN IF NOT EXISTS auction_run INTEGER NOT NULL DEFAULT 0;

    UPDATE great_games_seasons season
       SET auction_run=GREATEST(
             season.auction_run,
             COALESCE((
               SELECT MAX(lot.run_number)
                 FROM great_games_auction_lots lot
                WHERE lot.season_id=season.id
             ),0),
             CASE WHEN season.current_game='AUCTION' THEN season.current_run ELSE 0 END
           ),
           auction_status=CASE
             WHEN season.current_game='AUCTION' AND season.status='ACTIVE' THEN 'ACTIVE'
             WHEN season.current_game='AUCTION' AND season.status='PUBLISHED' THEN 'PUBLISHED'
             WHEN season.current_game='AUCTION' AND season.status='OPEN' THEN 'PREPARED'
             WHEN season.current_game='AUCTION' AND season.status='CANCELLED' THEN 'CANCELLED'
             WHEN EXISTS (
               SELECT 1 FROM great_games_auction_lots lot
                WHERE lot.season_id=season.id AND lot.phase='FINAL'
             ) THEN 'ACTIVE'
             WHEN EXISTS (
               SELECT 1 FROM great_games_auction_lots lot
                WHERE lot.season_id=season.id AND lot.phase='SEALED'
             ) THEN 'PREPARED'
             WHEN EXISTS (
               SELECT 1 FROM great_games_auction_lots lot
                WHERE lot.season_id=season.id AND lot.phase='FINISHED'
             ) THEN 'FINISHED'
             ELSE season.auction_status
           END;

    ALTER TABLE great_games_seasons
      DROP CONSTRAINT IF EXISTS great_games_seasons_auction_status_check;
    ALTER TABLE great_games_seasons
      ADD CONSTRAINT great_games_seasons_auction_status_check
      CHECK (auction_status IN ('IDLE','PREPARED','PUBLISHED','ACTIVE','FINISHED','CANCELLED')) NOT VALID;
  `
} as const;
