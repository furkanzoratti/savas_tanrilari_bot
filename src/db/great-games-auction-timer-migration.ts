export const greatGamesAuctionTimerMigration = {
  version: 134,
  name: "great_games_auction_durable_timer",
  sql: `
    ALTER TABLE great_games_seasons
      ADD COLUMN IF NOT EXISTS auction_ends_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS auction_channel_id TEXT,
      ADD COLUMN IF NOT EXISTS auction_message_id TEXT,
      ADD COLUMN IF NOT EXISTS auction_closed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS auction_result_published_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS great_games_auction_due_idx
      ON great_games_seasons(auction_ends_at)
      WHERE auction_ends_at IS NOT NULL
        AND auction_result_published_at IS NULL
        AND auction_status IN ('ACTIVE','FINISHED');
  `
} as const;
