export const movementMapPanelMigration = {
  version: 242,
  name: "secure_player_movement_map_panel",
  sql: `
    CREATE TABLE IF NOT EXISTS movement_map_login_tokens (
      token_hash TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      avatar TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS movement_map_login_tokens_expiry_idx
      ON movement_map_login_tokens(expires_at) WHERE used_at IS NULL;

  `
} as const;
