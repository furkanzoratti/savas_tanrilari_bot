export const countryLastStandMigration={
  version:139,
  name:"country_last_stand_lifecycle",
  sql:`
    CREATE TABLE IF NOT EXISTS country_settlement_claims(
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      first_owned_turn INTEGER NOT NULL DEFAULT 0 CHECK(first_owned_turn>=0),
      last_owned_turn INTEGER NOT NULL DEFAULT 0 CHECK(last_owned_turn>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(country_id,settlement_id)
    );

    INSERT INTO country_settlement_claims(country_id,settlement_id,first_owned_turn,last_owned_turn)
      SELECT settlement.country_id,settlement.id,0,guild.current_turn
        FROM settlements settlement
        JOIN countries country ON country.id=settlement.country_id
        JOIN guilds guild ON guild.discord_id=country.guild_id
      ON CONFLICT(country_id,settlement_id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS country_last_stands(
      country_id UUID PRIMARY KEY REFERENCES countries(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      started_turn INTEGER NOT NULL CHECK(started_turn>=0),
      deadline_turn INTEGER NOT NULL CHECK(deadline_turn>=started_turn),
      status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK(status IN('ACTIVE','RECOVERED','FAILED')),
      recovered_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      resolved_turn INTEGER CHECK(resolved_turn IS NULL OR resolved_turn>=started_turn),
      resolution_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS country_last_stands_guild_status_idx
      ON country_last_stands(guild_id,status,deadline_turn);
  `
} as const;
