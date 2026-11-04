export const expandedVisualMapMigration={
  version:244,
  name:"expanded_visual_map_versioning",
  sql:`
    CREATE TABLE IF NOT EXISTS visual_map_configuration(
      guild_id TEXT PRIMARY KEY REFERENCES guilds(discord_id) ON DELETE CASCADE,
      map_version TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS visual_map_territory_baselines(
      settlement_id UUID PRIMARY KEY REFERENCES settlements(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS visual_map_territory_baselines_guild_idx
      ON visual_map_territory_baselines(guild_id);

    INSERT INTO visual_map_territory_baselines(settlement_id,guild_id,country_id)
    SELECT settlement.id,country.guild_id,settlement.country_id
      FROM settlements settlement
      JOIN countries country ON country.id=settlement.country_id
    ON CONFLICT(settlement_id) DO NOTHING;

    INSERT INTO visual_map_configuration(guild_id,map_version)
    SELECT DISTINCT guild_id,'r56-india-v6'
      FROM visual_map_settlement_positions
    ON CONFLICT(guild_id) DO NOTHING;
  `
} as const;
