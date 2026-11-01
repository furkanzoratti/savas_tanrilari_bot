export const greatGamesBetLimitMigration={
  version:238,
  name:"great_games_bet_limit_10000",
  sql:`
    ALTER TABLE great_games_gladiator_bets
      DROP CONSTRAINT IF EXISTS great_games_gladiator_bets_amount_check;
    ALTER TABLE great_games_gladiator_bets
      ADD CONSTRAINT great_games_gladiator_bets_amount_check
      CHECK (amount BETWEEN 100 AND 10000);

    ALTER TABLE great_games_gladiator_coupons
      DROP CONSTRAINT IF EXISTS great_games_gladiator_coupons_amount_check;
    ALTER TABLE great_games_gladiator_coupons
      ADD CONSTRAINT great_games_gladiator_coupons_amount_check
      CHECK (amount BETWEEN 100 AND 10000);
  `
} as const;
