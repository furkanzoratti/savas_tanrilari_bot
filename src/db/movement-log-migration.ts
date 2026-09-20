export const movementLogMigration = {
  version: 74,
  name: "movement_private_log_delivery",
  sql: `
    ALTER TABLE guilds ADD COLUMN IF NOT EXISTS movement_log_channel_id TEXT;
    ALTER TABLE guilds ADD COLUMN IF NOT EXISTS movement_log_started_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS movement_log_deliveries (
      audit_log_id UUID PRIMARY KEY REFERENCES audit_logs(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS movement_log_deliveries_guild_idx
      ON movement_log_deliveries(guild_id,delivered_at DESC);
    CREATE INDEX IF NOT EXISTS audit_logs_movement_pending_idx
      ON audit_logs(guild_id,created_at,id);
  `
} as const;
