export const greatProjectsMigration={
  version:218,
  name:"settlement_great_projects",
  sql:`
    CREATE TABLE IF NOT EXISTS settlement_great_projects(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL UNIQUE REFERENCES settlements(id) ON DELETE CASCADE,
      project_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'BUILDING' CHECK(status IN ('BUILDING','ACTIVE')),
      founded_by_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
      started_turn INTEGER NOT NULL,
      completion_turn INTEGER NOT NULL,
      completed_turn INTEGER,
      paid_amount BIGINT NOT NULL CHECK(paid_amount>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,project_key)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS settlement_great_projects_one_founding_per_country_idx
      ON settlement_great_projects(founded_by_country_id);
    CREATE INDEX IF NOT EXISTS settlement_great_projects_owner_lookup_idx
      ON settlement_great_projects(settlement_id,status);
    CREATE INDEX IF NOT EXISTS settlement_great_projects_completion_idx
      ON settlement_great_projects(guild_id,status,completion_turn);
  `
} as const;
