export const espionagePublicationsPanelMigration = {
  version: 212,
  name: "espionage_publications_panel",
  sql: `
    ALTER TABLE settlements
      ADD COLUMN IF NOT EXISTS espionage_event_channel_id TEXT;

    CREATE TABLE IF NOT EXISTS espionage_public_templates (
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS','FAILURE')),
      title_template TEXT NOT NULL CHECK (char_length(title_template) BETWEEN 2 AND 100),
      body_template TEXT NOT NULL CHECK (char_length(body_template) BETWEEN 10 AND 1800),
      image_key TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id,target_type,outcome)
    );

    CREATE INDEX IF NOT EXISTS espionage_public_templates_updated_idx
      ON espionage_public_templates(guild_id,updated_at DESC);
  `
} as const;
