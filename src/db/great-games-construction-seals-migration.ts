export const greatGamesConstructionSealsMigration={
  version:233,
  name:"turn_50_construction_and_seven_seals",
  sql:`
    ALTER TABLE great_games_entries DROP CONSTRAINT IF EXISTS great_games_entries_game_type_check;
    ALTER TABLE great_games_entries ADD CONSTRAINT great_games_entries_game_type_check
      CHECK (game_type IN ('AUCTION','CHARIOT','CARAVAN','KINGS_BET','DIPLOMACY','GLADIATOR','COURT_INTRIGUE','GREAT_CONSTRUCTION','SEVEN_SEALS'));

    ALTER TABLE great_games_actions DROP CONSTRAINT IF EXISTS great_games_actions_game_type_check;
    ALTER TABLE great_games_actions ADD CONSTRAINT great_games_actions_game_type_check
      CHECK (game_type IN ('AUCTION','CHARIOT','CARAVAN','KINGS_BET','DIPLOMACY','GLADIATOR','COURT_INTRIGUE','GREAT_CONSTRUCTION','SEVEN_SEALS'));

    CREATE TABLE IF NOT EXISTS great_games_special_rounds(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      season_id UUID NOT NULL REFERENCES great_games_seasons(id) ON DELETE CASCADE,
      game_type TEXT NOT NULL CHECK(game_type IN('GREAT_CONSTRUCTION','SEVEN_SEALS')),
      round INTEGER NOT NULL CHECK(round>0),
      event_key TEXT,
      public_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
      resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(season_id,game_type,round)
    );
    CREATE INDEX IF NOT EXISTS great_games_special_rounds_lookup_idx
      ON great_games_special_rounds(season_id,game_type,round DESC);
  `
}as const;
