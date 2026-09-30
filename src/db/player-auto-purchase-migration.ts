export const playerAutoPurchaseMigration = {
  version: 100,
  name: "player_auto_purchase_previews",
  sql: `
    CREATE TABLE IF NOT EXISTS player_auto_purchase_previews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,
      acquisition_turn INTEGER NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('SHIPS','QUALITY','GENERAL')),
      plan JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','PROCESSING','COMPLETE','PARTIAL','FAILED','CANCELLED','STALE')),
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
      completed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS player_auto_purchase_previews_actor_idx
      ON player_auto_purchase_previews(guild_id,actor_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS player_auto_purchase_previews_expiry_idx
      ON player_auto_purchase_previews(status,expires_at);
  `
} as const;
