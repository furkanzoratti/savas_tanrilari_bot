export const navalOperationsMigration = {
  version: 85,
  name: "naval_blockades_and_raids",
  sql: `
    CREATE TABLE IF NOT EXISTS naval_blockades (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      blockader_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      fleet_id UUID NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
      target_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      target_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LIFTED')),
      sea_trade_loss_percent INTEGER NOT NULL CHECK (sea_trade_loss_percent BETWEEN 0 AND 100),
      admiral_character_id UUID REFERENCES country_characters(id) ON DELETE SET NULL,
      admiral_specialization_level INTEGER NOT NULL DEFAULT 0 CHECK (admiral_specialization_level BETWEEN 0 AND 3),
      started_turn INTEGER NOT NULL,
      ended_turn INTEGER,
      siege_battle_id UUID REFERENCES battles(id) ON DELETE SET NULL,
      starvation_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT NOT NULL,
      ended_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    );

    CREATE UNIQUE INDEX IF NOT EXISTS naval_blockades_one_active_fleet
      ON naval_blockades(fleet_id) WHERE status='ACTIVE';
    CREATE UNIQUE INDEX IF NOT EXISTS naval_blockades_one_active_target
      ON naval_blockades(target_settlement_id) WHERE status='ACTIVE';
    CREATE INDEX IF NOT EXISTS naval_blockades_guild_status
      ON naval_blockades(guild_id,status);

    CREATE TABLE IF NOT EXISTS naval_raids (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      raider_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      fleet_id UUID NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
      target_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      target_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'WAITING_ROLL' CHECK (status IN ('WAITING_ROLL','RESOLVED','CANCELLED')),
      game_turn INTEGER NOT NULL,
      admiral_character_id UUID REFERENCES country_characters(id) ON DELETE SET NULL,
      admiral_specialization_level INTEGER NOT NULL DEFAULT 0 CHECK (admiral_specialization_level BETWEEN 0 AND 3),
      detection_roll INTEGER NOT NULL CHECK (detection_roll BETWEEN 1 AND 20),
      detection_modifier INTEGER NOT NULL DEFAULT 0,
      detection_total INTEGER NOT NULL,
      detected BOOLEAN NOT NULL,
      roll_value INTEGER CHECK (roll_value BETWEEN 1 AND 20),
      roll_bonus INTEGER,
      roll_total INTEGER,
      result_tier TEXT CHECK (result_tier IS NULL OR result_tier IN ('CRITICAL_FAILURE','FAILED','PARTIAL','SUCCESS','SUPERIOR')),
      loot_percent INTEGER,
      loot_amount BIGINT,
      payout_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      roller_user_id TEXT,
      public_channel_id TEXT,
      public_message_id TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );

    CREATE UNIQUE INDEX IF NOT EXISTS naval_raids_one_waiting_fleet
      ON naval_raids(fleet_id) WHERE status='WAITING_ROLL';
    CREATE INDEX IF NOT EXISTS naval_raids_guild_status
      ON naval_raids(guild_id,status);
  `
} as const;
