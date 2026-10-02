export const dynastyDeathLogsMigration={
  version:111,
  name:"dynasty_death_save_log_channel_and_delivery",
  sql:`
    ALTER TABLE guilds
      ADD COLUMN IF NOT EXISTS dynasty_death_log_channel_id TEXT;

    ALTER TABLE dynasty_turn_resolutions
      ADD COLUMN IF NOT EXISTS death_log_published_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS death_log_publish_attempts INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS death_log_last_error TEXT;

    CREATE INDEX IF NOT EXISTS dynasty_death_logs_pending_idx
      ON dynasty_turn_resolutions(game_turn,processed_at)
      WHERE death_log_published_at IS NULL;
  `
} as const;
