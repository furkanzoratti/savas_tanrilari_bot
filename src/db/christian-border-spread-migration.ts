export const christianBorderSpreadMigration={
  version:137,
  name:"manual_christian_border_spread",
  sql:`
    CREATE TABLE IF NOT EXISTS christian_border_spreads(
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED')),
      started_turn INTEGER NOT NULL CHECK (started_turn>=0),
      completed_turn INTEGER CHECK (completed_turn IS NULL OR completed_turn>=0),
      started_by_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(guild_id,settlement_id)
    );
    CREATE INDEX IF NOT EXISTS christian_border_spreads_active_idx
      ON christian_border_spreads(guild_id,status);
  `
} as const;
