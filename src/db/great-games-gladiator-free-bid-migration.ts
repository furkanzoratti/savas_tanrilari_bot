export const greatGamesGladiatorFreeBidMigration = {
  version: 120,
  name: "capua_gladiator_free_bid_amounts",
  sql: `
    ALTER TABLE great_games_gladiator_auction_bids
      DROP CONSTRAINT IF EXISTS great_games_gladiator_auction_bids_amount_check;

    ALTER TABLE great_games_gladiator_auction_bids
      ADD CONSTRAINT great_games_gladiator_auction_bids_amount_check
      CHECK (amount>=50);
  `
} as const;
