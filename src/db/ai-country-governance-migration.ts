export const aiCountryGovernanceMigration = {
  version: 98,
  name: "sealed_ai_country_governance",
  sql: `
    CREATE TABLE IF NOT EXISTS ai_governance_settings (
      guild_id TEXT PRIMARY KEY REFERENCES guilds(discord_id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      automatic_planning BOOLEAN NOT NULL DEFAULT FALSE,
      automatic_execution BOOLEAN NOT NULL DEFAULT FALSE,
      model TEXT NOT NULL DEFAULT 'gpt-6-sol',
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (NOT automatic_planning OR enabled),
      CHECK (NOT automatic_execution OR (enabled AND automatic_planning))
    );

    CREATE TABLE IF NOT EXISTS ai_country_profiles (
      country_id UUID PRIMARY KEY REFERENCES countries(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      doctrine TEXT NOT NULL DEFAULT 'BALANCED'
        CHECK (doctrine IN ('BALANCED','EXPANSIONIST','DEFENSIVE','MERCANTILE','NAVAL')),
      aggression SMALLINT NOT NULL DEFAULT 50 CHECK (aggression BETWEEN 0 AND 100),
      risk_tolerance SMALLINT NOT NULL DEFAULT 50 CHECK (risk_tolerance BETWEEN 0 AND 100),
      reserve_percent SMALLINT NOT NULL DEFAULT 25 CHECK (reserve_percent BETWEEN 0 AND 100),
      strategic_goals TEXT NOT NULL DEFAULT '',
      custom_instructions TEXT NOT NULL DEFAULT '',
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_country_turn_plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn >= 1),
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','APPROVED','SEALED','VALIDATED','EXECUTED','REJECTED','EXPIRED')),
      model TEXT NOT NULL,
      observation JSONB NOT NULL,
      plan JSONB NOT NULL,
      validation JSONB NOT NULL DEFAULT '{"valid":true,"errors":[]}'::jsonb,
      plan_hash TEXT NOT NULL,
      provider_response_id TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      review_note TEXT,
      sealed_at TIMESTAMPTZ,
      executed_at TIMESTAMPTZ,
      UNIQUE (country_id,game_turn,revision)
    );

    CREATE INDEX IF NOT EXISTS ai_country_turn_plans_country_turn_idx
      ON ai_country_turn_plans(country_id,game_turn DESC,revision DESC);
    CREATE INDEX IF NOT EXISTS ai_country_turn_plans_status_idx
      ON ai_country_turn_plans(guild_id,status,created_at DESC);
  `
} as const;
