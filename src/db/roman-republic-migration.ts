export const romanRepublicMigration = {
  version: 151,
  name: "roman_republic_phase_one",
  sql: `
    CREATE TABLE IF NOT EXISTS roman_republics(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')),
      term_length INTEGER NOT NULL DEFAULT 6 CHECK(term_length BETWEEN 2 AND 20),
      current_consul_family_id UUID,
      term_started_turn INTEGER,
      next_election_turn INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,country_id)
    );

    CREATE TABLE IF NOT EXISTS roman_families(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK(char_length(name) BETWEEN 2 AND 80),
      treasury BIGINT NOT NULL DEFAULT 0 CHECK(treasury>=0),
      political_influence INTEGER NOT NULL DEFAULT 0 CHECK(political_influence>=0),
      senate_seats INTEGER NOT NULL DEFAULT 0 CHECK(senate_seats>=0),
      leader_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(republic_id,name)
    );

    DO $$ BEGIN
      ALTER TABLE roman_republics
        ADD CONSTRAINT roman_republics_consul_family_fk
        FOREIGN KEY(current_consul_family_id) REFERENCES roman_families(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS roman_family_players(
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      discord_user_id TEXT NOT NULL,
      is_leader BOOLEAN NOT NULL DEFAULT FALSE,
      joined_turn INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','LEFT')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(republic_id,discord_user_id)
    );
    CREATE INDEX IF NOT EXISTS roman_family_players_family_idx
      ON roman_family_players(family_id,status);

    CREATE TABLE IF NOT EXISTS roman_family_businesses(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
      business_type TEXT NOT NULL CHECK(business_type IN ('MARKET_STALL','WORKSHOP','BROTHEL','BATHHOUSE','LUDUS','LATIFUNDIUM')),
      purchase_cost BIGINT NOT NULL CHECK(purchase_cost>=0),
      turn_income BIGINT NOT NULL CHECK(turn_income>=0),
      acquired_turn INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS roman_family_businesses_family_idx
      ON roman_family_businesses(family_id,status,business_type);

    CREATE TABLE IF NOT EXISTS roman_family_ledger(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      entry_type TEXT NOT NULL,
      amount BIGINT NOT NULL DEFAULT 0,
      influence_delta INTEGER NOT NULL DEFAULT 0,
      business_id UUID REFERENCES roman_family_businesses(id) ON DELETE SET NULL,
      actor_user_id TEXT,
      description TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS roman_family_ledger_family_turn_idx
      ON roman_family_ledger(family_id,game_turn DESC,created_at DESC);

    CREATE TABLE IF NOT EXISTS roman_family_turn_income_runs(
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      business_income BIGINT NOT NULL DEFAULT 0,
      consul_stipend BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(family_id,game_turn)
    );

    CREATE TABLE IF NOT EXISTS roman_republic_events(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor_user_id TEXT,
      family_id UUID REFERENCES roman_families(id) ON DELETE SET NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS roman_republic_events_turn_idx
      ON roman_republic_events(republic_id,game_turn DESC,created_at DESC);
  `
} as const;
