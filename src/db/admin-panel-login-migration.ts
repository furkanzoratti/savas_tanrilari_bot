export const adminPanelLoginMigration = {
  version: 96,
  name: "gm_admin_panel_one_time_login",
  sql: `
    CREATE TABLE IF NOT EXISTS admin_panel_login_tokens (
      token_hash TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS admin_panel_login_tokens_expiry_idx
      ON admin_panel_login_tokens(expires_at) WHERE used_at IS NULL;
  `
} as const;
