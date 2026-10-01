import { RELIGIONS } from "../domain/religions.js";

const religionKeys = Object.keys(RELIGIONS).map((key) => `'${key}'`).join(",");

export const missionariesMigration = {
  version: 107,
  name: "missionary_characters_and_conversion_operations",
  sql: `
    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_role_check;
    ALTER TABLE country_characters ADD CONSTRAINT country_characters_role_check
      CHECK (role IN ('SPY','MERCHANT','COMMANDER','DIPLOMAT','MISSIONARY'));

    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_assignment_check;
    ALTER TABLE country_characters ADD CONSTRAINT country_characters_assignment_check CHECK (assignment IN (
      'NONE','CURIA','AGORA','ARMY','FLEET','ESPIONAGE','ESPIONAGE_RETURNING','CAPTURED',
      'COUNTERINTELLIGENCE_TRAVELING_COUNTRY','COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT',
      'COUNTERINTELLIGENCE_COUNTRY','COUNTERINTELLIGENCE_SETTLEMENT','PERSONAL_GUARD','ASSIMILATION',
      'MERCHANT_LOCAL_TRAVELING','MERCHANT_LOCAL','MERCHANT_FOREIGN_PENDING','MERCHANT_FOREIGN_TRAVELING',
      'MERCHANT_FOREIGN','MERCHANT_PURCHASE','MERCHANT_BLACK_MARKET_TRAVELING','MERCHANT_BLACK_MARKET',
      'DIPLOMAT_TRAVELING','DIPLOMAT_RECONCILIATION','DIPLOMAT_CULTURE','DIPLOMAT_VASSALIZE',
      'DIPLOMAT_INTEGRATE','DIPLOMAT_DEFENSE','MISSIONARY_TRAVELING','MISSIONARY_CONVERSION'
    ));

    CREATE TABLE IF NOT EXISTS missionary_operations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      missionary_character_id UUID NOT NULL REFERENCES country_characters(id) ON DELETE CASCADE,
      target_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      religion_key TEXT NOT NULL CHECK (religion_key IN (${religionKeys})),
      status TEXT NOT NULL CHECK (status IN ('TRAVELING','ACTIVE','COMPLETED','CANCELLED')),
      started_turn INTEGER NOT NULL CHECK (started_turn >= 0),
      arrival_turn INTEGER NOT NULL CHECK (arrival_turn > started_turn),
      last_resolved_turn INTEGER,
      converted_percent NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (converted_percent BETWEEN 0 AND 100),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS missionary_one_live_operation_per_character
      ON missionary_operations(missionary_character_id)
      WHERE status IN ('TRAVELING','ACTIVE');
    CREATE UNIQUE INDEX IF NOT EXISTS missionary_one_live_operation_per_settlement
      ON missionary_operations(target_settlement_id)
      WHERE status IN ('TRAVELING','ACTIVE');
    CREATE INDEX IF NOT EXISTS missionary_operations_due_idx
      ON missionary_operations(guild_id,status,arrival_turn,last_resolved_turn);

    CREATE TABLE IF NOT EXISTS missionary_rolls (
      operation_id UUID NOT NULL REFERENCES missionary_operations(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      attack_roll SMALLINT NOT NULL CHECK (attack_roll BETWEEN 1 AND 20),
      attack_bonus SMALLINT NOT NULL,
      attack_total SMALLINT NOT NULL,
      defense_roll SMALLINT NOT NULL CHECK (defense_roll BETWEEN 1 AND 20),
      defense_bonus SMALLINT NOT NULL,
      defense_total SMALLINT NOT NULL,
      converted_percent NUMERIC(5,2) NOT NULL CHECK (converted_percent BETWEEN 0 AND 12),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(operation_id,game_turn)
    );
  `
} as const;
