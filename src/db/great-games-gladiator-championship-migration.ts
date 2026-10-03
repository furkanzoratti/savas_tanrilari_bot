export const greatGamesGladiatorChampionshipMigration = {
  version: 124,
  name: "capua_four_qualifiers_and_final_championship",
  sql: `
    ALTER TABLE great_games_gladiator_tournaments
      ADD COLUMN IF NOT EXISTS tournament_type TEXT NOT NULL DEFAULT 'QUALIFIER'
        CHECK (tournament_type IN ('QUALIFIER','FINAL')),
      ADD COLUMN IF NOT EXISTS round_count INTEGER NOT NULL DEFAULT 5
        CHECK (round_count BETWEEN 1 AND 5);

    CREATE TABLE IF NOT EXISTS great_games_gladiator_tournament_entries (
      tournament_id UUID NOT NULL REFERENCES great_games_gladiator_tournaments(id) ON DELETE CASCADE,
      gladiator_id UUID NOT NULL REFERENCES great_games_gladiators(id) ON DELETE RESTRICT,
      seed INTEGER NOT NULL CHECK (seed>0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tournament_id,gladiator_id),
      UNIQUE (tournament_id,seed)
    );

    INSERT INTO great_games_gladiator_tournament_entries(tournament_id,gladiator_id,seed)
    SELECT participant.tournament_id,participant.gladiator_id,
           ROW_NUMBER() OVER (PARTITION BY participant.tournament_id ORDER BY participant.bracket_position,participant.side)::integer
      FROM (
        SELECT tournament_id,bracket_position,1 AS side,fighter_a_id AS gladiator_id
          FROM great_games_gladiator_matches
         WHERE round=1 AND fighter_a_id IS NOT NULL
        UNION ALL
        SELECT tournament_id,bracket_position,2 AS side,fighter_b_id AS gladiator_id
          FROM great_games_gladiator_matches
         WHERE round=1 AND fighter_b_id IS NOT NULL
      ) participant
    ON CONFLICT(tournament_id,gladiator_id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS great_games_gladiator_tournament_results (
      tournament_id UUID NOT NULL REFERENCES great_games_gladiator_tournaments(id) ON DELETE CASCADE,
      gladiator_id UUID NOT NULL REFERENCES great_games_gladiators(id) ON DELETE RESTRICT,
      placement INTEGER NOT NULL CHECK (placement BETWEEN 1 AND 32),
      points INTEGER NOT NULL CHECK (points BETWEEN 1 AND 32),
      eliminated_round INTEGER NOT NULL CHECK (eliminated_round BETWEEN 1 AND 5),
      damage_dealt INTEGER NOT NULL DEFAULT 0 CHECK (damage_dealt>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tournament_id,gladiator_id),
      UNIQUE (tournament_id,placement)
    );

    CREATE INDEX IF NOT EXISTS great_games_gladiator_entries_gladiator_idx
      ON great_games_gladiator_tournament_entries(gladiator_id,tournament_id);
    CREATE INDEX IF NOT EXISTS great_games_gladiator_results_gladiator_idx
      ON great_games_gladiator_tournament_results(gladiator_id,points DESC);
  `
} as const;
