export const npcDynastyAutomationMigration={
  version:160,
  name:"npc_dynasty_birth_and_marriage_turn_automation",
  sql:`
    CREATE TABLE IF NOT EXISTS dynasty_npc_turn_resolutions (
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn>=0),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(guild_id,game_turn)
    );

    INSERT INTO dynasty_npc_turn_resolutions(guild_id,game_turn,details)
    SELECT discord_id,current_turn,'{"baseline":true}'::jsonb
      FROM guilds
    ON CONFLICT(guild_id,game_turn) DO NOTHING;
  `
} as const;
