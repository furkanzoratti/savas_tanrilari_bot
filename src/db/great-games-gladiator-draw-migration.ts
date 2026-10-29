export const greatGamesGladiatorDrawMigration = {
  version: 231,
  name: "turn_50_gladiator_draw",
  sql: `
    ALTER TABLE great_games_gladiator_ownerships
      DROP CONSTRAINT IF EXISTS great_games_gladiator_ownerships_purchase_price_check;
    ALTER TABLE great_games_gladiator_ownerships
      ADD CONSTRAINT great_games_gladiator_ownerships_purchase_price_check CHECK (purchase_price>=0);
    ALTER TABLE great_games_gladiator_ownerships
      ADD COLUMN IF NOT EXISTS acquisition_method TEXT NOT NULL DEFAULT 'AUCTION'
        CHECK (acquisition_method IN ('AUCTION','DRAW')),
      ADD COLUMN IF NOT EXISTS acquisition_order INTEGER,
      ADD COLUMN IF NOT EXISTS assigned_by TEXT;

    CREATE TABLE IF NOT EXISTS great_games_gladiator_draws (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      season_id UUID NOT NULL UNIQUE REFERENCES great_games_seasons(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED')),
      target_per_country INTEGER NOT NULL DEFAULT 4 CHECK (target_per_country>0),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS great_games_gladiator_draw_countries (
      draw_id UUID NOT NULL REFERENCES great_games_gladiator_draws(id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      joined_order INTEGER NOT NULL,
      PRIMARY KEY (draw_id,country_id),
      UNIQUE (draw_id,joined_order)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS great_games_gladiator_ownerships_draw_order_uq
      ON great_games_gladiator_ownerships(season_id,acquisition_order)
      WHERE acquisition_method='DRAW' AND acquisition_order IS NOT NULL;
  `
} as const;
