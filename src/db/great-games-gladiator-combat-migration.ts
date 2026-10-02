export const greatGamesGladiatorCombatMigration = {
  version: 118,
  name: "capua_gladiator_hit_points_and_combat_log",
  sql: `
    ALTER TABLE great_games_gladiators
      ADD COLUMN IF NOT EXISTS max_hp INTEGER NOT NULL DEFAULT 35 CHECK (max_hp BETWEEN 1 AND 100);

    UPDATE great_games_gladiators
       SET max_hp=28 + ((substring(code FROM 5)::integer * 19) % 18)
     WHERE code ~ '^CAP-[0-9]{2}$';

    ALTER TABLE great_games_gladiator_matches
      ADD COLUMN IF NOT EXISTS combat_turns INTEGER NOT NULL DEFAULT 0 CHECK (combat_turns>=0),
      ADD COLUMN IF NOT EXISTS combat_log JSONB NOT NULL DEFAULT '[]'::jsonb;
  `
} as const;
