export const adminPanelMigration = {
  version: 95,
  name: "gm_admin_panel_operations",
  sql: `
    CREATE TABLE IF NOT EXISTS admin_panel_operations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK(status IN ('PROCESSING','APPLIED')),
      request JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS admin_panel_operations_guild_created_idx
      ON admin_panel_operations(guild_id,created_at DESC);
  `
} as const;
