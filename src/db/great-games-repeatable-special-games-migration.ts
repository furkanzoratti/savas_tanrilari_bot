export const greatGamesRepeatableSpecialGamesMigration={
  version:234,
  name:"repeatable_turn_50_special_games",
  sql:`
    ALTER TABLE great_games_court_games
      ADD COLUMN IF NOT EXISTS run_number INTEGER NOT NULL DEFAULT 1 CHECK(run_number>0);
    ALTER TABLE great_games_court_games
      DROP CONSTRAINT IF EXISTS great_games_court_games_season_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS great_games_court_games_season_run_uq
      ON great_games_court_games(season_id,run_number);

    ALTER TABLE great_games_special_rounds
      ADD COLUMN IF NOT EXISTS run_number INTEGER NOT NULL DEFAULT 1 CHECK(run_number>0);
    ALTER TABLE great_games_special_rounds
      DROP CONSTRAINT IF EXISTS great_games_special_rounds_season_id_game_type_round_key;
    CREATE UNIQUE INDEX IF NOT EXISTS great_games_special_rounds_run_round_uq
      ON great_games_special_rounds(season_id,game_type,run_number,round);
  `
}as const;
