export const landRaidsMigration = {
  version: 87,
  name: "regional_and_city_raids",
  sql: `
    CREATE TABLE IF NOT EXISTS land_raids (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      raid_type TEXT NOT NULL CHECK (raid_type IN ('REGIONAL','CITY')),
      war_id UUID NOT NULL REFERENCES state_wars(id) ON DELETE CASCADE,
      raider_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      army_id UUID NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
      target_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      target_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      payout_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'WAITING_ROLL' CHECK (status IN ('WAITING_ROLL','RESOLVED','CANCELLED')),
      game_turn INTEGER NOT NULL,
      army_strength INTEGER NOT NULL CHECK (army_strength > 0),
      target_population_before BIGINT NOT NULL CHECK (target_population_before >= 0),
      income_basis BIGINT NOT NULL CHECK (income_basis >= 0),
      size_modifier INTEGER NOT NULL,
      roll_sides INTEGER NOT NULL CHECK (roll_sides IN (20,100)),
      roll_value INTEGER,
      roll_total INTEGER,
      result_tier TEXT CHECK (result_tier IS NULL OR result_tier IN ('CRITICAL_FAILURE','LOW','MEDIUM','HIGH','TOP')),
      loot_percent INTEGER,
      loot_amount BIGINT,
      population_loss_percent NUMERIC(5,2),
      population_loss BIGINT,
      slave_amount BIGINT,
      income_penalty_percent INTEGER,
      army_exposed BOOLEAN NOT NULL DEFAULT FALSE,
      roller_user_id TEXT,
      public_channel_id TEXT,
      public_message_id TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS land_raids_one_waiting_army
      ON land_raids(army_id) WHERE status='WAITING_ROLL';
    CREATE UNIQUE INDEX IF NOT EXISTS land_raids_one_target_per_war
      ON land_raids(war_id,target_settlement_id) WHERE status IN ('WAITING_ROLL','RESOLVED');
    CREATE INDEX IF NOT EXISTS land_raids_guild_status ON land_raids(guild_id,status);
  `
} as const;
