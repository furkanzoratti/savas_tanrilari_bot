export const structuredWarPeaceGovernorshipMigration = {
  version: 224,
  name: "structured_war_peace_occupation_and_governorship",
  sql: `
    ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'LEGACY';
    ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS goal_target_country_id UUID REFERENCES countries(id) ON DELETE SET NULL;
    ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS goal_target_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL;
    ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS goal_locked_at TIMESTAMPTZ;
    ALTER TABLE state_wars ADD COLUMN IF NOT EXISTS attacker_score INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE state_wars DROP CONSTRAINT IF EXISTS state_wars_goal_type_check;
    ALTER TABLE state_wars ADD CONSTRAINT state_wars_goal_type_check CHECK (goal_type IN (
      'CONQUEST','RESTORATION','VASSALIZATION','INDEPENDENCE','REPARATIONS','RELEASE_VASSAL','LEGACY'
    ));
    ALTER TABLE state_wars DROP CONSTRAINT IF EXISTS state_wars_attacker_score_check;
    ALTER TABLE state_wars ADD CONSTRAINT state_wars_attacker_score_check CHECK (attacker_score BETWEEN -100 AND 100);
    UPDATE state_wars SET goal_locked_at=COALESCE(goal_locked_at,created_at);

    ALTER TABLE battles ADD COLUMN IF NOT EXISTS state_war_id UUID REFERENCES state_wars(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS battles_state_war_idx ON battles(state_war_id,status);

    CREATE TABLE IF NOT EXISTS state_war_score_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      war_id UUID NOT NULL REFERENCES state_wars(id) ON DELETE CASCADE,
      side TEXT NOT NULL CHECK (side IN ('ATTACKER','DEFENDER')),
      event_type TEXT NOT NULL CHECK (event_type IN ('BATTLE','OCCUPATION','TARGET_OCCUPATION','CAPITAL_OCCUPATION','GM_ADJUSTMENT')),
      points INTEGER NOT NULL CHECK (points > 0),
      game_turn INTEGER NOT NULL CHECK (game_turn >= 0),
      battle_id UUID REFERENCES battles(id) ON DELETE SET NULL,
      settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      source_key TEXT NOT NULL UNIQUE,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS state_war_score_events_war_idx ON state_war_score_events(war_id,created_at);

    CREATE TABLE IF NOT EXISTS settlement_occupations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      war_id UUID NOT NULL REFERENCES state_wars(id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      occupier_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      legal_owner_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      started_turn INTEGER NOT NULL CHECK (started_turn >= 0),
      started_by_battle_id UUID REFERENCES battles(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
      ended_turn INTEGER,
      ended_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      CHECK (occupier_country_id <> legal_owner_country_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS settlement_one_active_occupation_idx
      ON settlement_occupations(settlement_id) WHERE status='ACTIVE';
    CREATE INDEX IF NOT EXISTS settlement_occupations_war_idx ON settlement_occupations(war_id,status);
    CREATE INDEX IF NOT EXISTS settlement_occupations_country_idx ON settlement_occupations(occupier_country_id,status);

    CREATE TABLE IF NOT EXISTS peace_offer_terms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      peace_offer_id UUID NOT NULL REFERENCES peace_offers(id) ON DELETE CASCADE,
      term_type TEXT NOT NULL CHECK (term_type IN (
        'WHITE_PEACE','TRANSFER_SETTLEMENT','INDEMNITY','VASSALIZE','RELEASE_VASSAL','RECOGNIZE_INDEPENDENCE'
      )),
      source_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
      target_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
      settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      amount BIGINT CHECK (amount IS NULL OR amount >= 0),
      duration_turns INTEGER CHECK (duration_turns IS NULL OR duration_turns > 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS peace_offer_terms_offer_idx ON peace_offer_terms(peace_offer_id,sort_order,id);

    CREATE TABLE IF NOT EXISTS settlement_governorships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      character_id UUID NOT NULL REFERENCES country_characters(id) ON DELETE CASCADE,
      focus TEXT NOT NULL CHECK (focus IN ('REVENUE','PUBLIC_ORDER','RECONSTRUCTION','INTEGRATION')),
      appointed_turn INTEGER NOT NULL CHECK (appointed_turn >= 0),
      minimum_end_turn INTEGER NOT NULL CHECK (minimum_end_turn >= appointed_turn),
      last_focus_turn INTEGER NOT NULL CHECK (last_focus_turn >= appointed_turn),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
      ended_turn INTEGER,
      ended_reason TEXT,
      appointed_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS settlement_one_active_governor_idx
      ON settlement_governorships(settlement_id) WHERE status='ACTIVE';
    CREATE UNIQUE INDEX IF NOT EXISTS character_one_active_governorship_idx
      ON settlement_governorships(character_id) WHERE status='ACTIVE';
    CREATE INDEX IF NOT EXISTS settlement_governorships_country_idx ON settlement_governorships(country_id,status);

    CREATE TABLE IF NOT EXISTS settlement_governorship_turns (
      governorship_id UUID NOT NULL REFERENCES settlement_governorships(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn >= 0),
      focus TEXT NOT NULL,
      income_bonus BIGINT NOT NULL DEFAULT 0,
      rebellion_delta INTEGER NOT NULL DEFAULT 0,
      prosperity_delta INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(governorship_id,game_turn)
    );

    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_assignment_check;
    ALTER TABLE country_characters ADD CONSTRAINT country_characters_assignment_check CHECK (assignment IN (
      'NONE','CURIA','AGORA','ARMY','FLEET','ESPIONAGE','ESPIONAGE_RETURNING','CAPTURED',
      'COUNTERINTELLIGENCE_TRAVELING_COUNTRY','COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT',
      'COUNTERINTELLIGENCE_COUNTRY','COUNTERINTELLIGENCE_SETTLEMENT','PERSONAL_GUARD','ASSIMILATION','GOVERNOR',
      'MERCHANT_LOCAL_TRAVELING','MERCHANT_LOCAL','MERCHANT_FOREIGN_PENDING','MERCHANT_FOREIGN_TRAVELING',
      'MERCHANT_FOREIGN','MERCHANT_PURCHASE','MERCHANT_BLACK_MARKET_TRAVELING','MERCHANT_BLACK_MARKET',
      'DIPLOMAT_TRAVELING','DIPLOMAT_RECONCILIATION','DIPLOMAT_CULTURE','DIPLOMAT_VASSALIZE',
      'DIPLOMAT_INTEGRATE','DIPLOMAT_DEFENSE','MISSIONARY_TRAVELING','MISSIONARY_CONVERSION'
    ));
  `
} as const;

