export const greatGamesGladiatorCouponsMigration={
  version:128,
  name:"capua_gladiator_combination_coupons",
  sql:`
    CREATE TABLE IF NOT EXISTS great_games_gladiator_coupons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tournament_id UUID NOT NULL REFERENCES great_games_gladiator_tournaments(id) ON DELETE CASCADE,
      round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 5),
      bettor_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      amount BIGINT NOT NULL CHECK (amount BETWEEN 100 AND 5000),
      combined_odds NUMERIC(8,2) NOT NULL CHECK (combined_odds>=1 AND combined_odds<=12),
      payout BIGINT NOT NULL DEFAULT 0 CHECK (payout>=0),
      status TEXT NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED','WON','LOST','REFUNDED')),
      source_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      settled_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS great_games_gladiator_coupon_selections (
      coupon_id UUID NOT NULL REFERENCES great_games_gladiator_coupons(id) ON DELETE CASCADE,
      match_id UUID NOT NULL REFERENCES great_games_gladiator_matches(id) ON DELETE CASCADE,
      fighter_id UUID NOT NULL REFERENCES great_games_gladiators(id) ON DELETE RESTRICT,
      locked_odds NUMERIC(6,2) NOT NULL CHECK (locked_odds>=1),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','WON','LOST','REFUNDED')),
      resolved_at TIMESTAMPTZ,
      PRIMARY KEY (coupon_id,match_id)
    );

    CREATE INDEX IF NOT EXISTS great_games_gladiator_coupons_round_idx
      ON great_games_gladiator_coupons(tournament_id,round,status);
    CREATE INDEX IF NOT EXISTS great_games_gladiator_coupon_selections_match_idx
      ON great_games_gladiator_coupon_selections(match_id,status);
  `
} as const;
