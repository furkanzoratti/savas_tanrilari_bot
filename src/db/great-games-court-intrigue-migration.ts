export const greatGamesCourtIntrigueMigration={
  version:232,
  name:"turn_50_court_intrigue",
  sql:`
    ALTER TABLE great_games_entries DROP CONSTRAINT IF EXISTS great_games_entries_game_type_check;
    ALTER TABLE great_games_entries ADD CONSTRAINT great_games_entries_game_type_check
      CHECK (game_type IN ('AUCTION','CHARIOT','CARAVAN','KINGS_BET','DIPLOMACY','GLADIATOR','COURT_INTRIGUE'));

    ALTER TABLE great_games_actions DROP CONSTRAINT IF EXISTS great_games_actions_game_type_check;
    ALTER TABLE great_games_actions ADD CONSTRAINT great_games_actions_game_type_check
      CHECK (game_type IN ('AUCTION','CHARIOT','CARAVAN','KINGS_BET','DIPLOMACY','GLADIATOR','COURT_INTRIGUE'));

    CREATE TABLE IF NOT EXISTS great_games_court_games(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      season_id UUID NOT NULL UNIQUE REFERENCES great_games_seasons(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','COMPLETED')),
      current_event_key TEXT NOT NULL,
      max_rounds INTEGER NOT NULL DEFAULT 5 CHECK(max_rounds>0),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS great_games_court_rounds(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id UUID NOT NULL REFERENCES great_games_court_games(id) ON DELETE CASCADE,
      round INTEGER NOT NULL CHECK(round>0),
      event_key TEXT NOT NULL,
      public_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
      resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(game_id,round)
    );

    CREATE TABLE IF NOT EXISTS great_games_court_pacts(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id UUID NOT NULL REFERENCES great_games_court_games(id) ON DELETE CASCADE,
      proposer_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      receiver_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','ACTIVE','REJECTED','BROKEN','COMPLETED')),
      proposed_round INTEGER NOT NULL CHECK(proposed_round>0),
      active_until_round INTEGER,
      broken_by_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(proposer_country_id<>receiver_country_id)
    );
    CREATE INDEX IF NOT EXISTS great_games_court_pacts_game_status_idx ON great_games_court_pacts(game_id,status);
  `
}as const;
