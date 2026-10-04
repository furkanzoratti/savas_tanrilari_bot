export const greatGamesAuctionBidRulesMigration = {
  version: 132,
  name: "great_games_auction_bid_rules_1000_500",
  sql: `
    ALTER TABLE great_games_auction_bids
      DROP CONSTRAINT IF EXISTS great_games_auction_bids_amount_check;
    ALTER TABLE great_games_auction_bids
      ADD CONSTRAINT great_games_auction_bids_amount_check
      CHECK (amount >= 1000 AND MOD(amount - 1000, 500) = 0) NOT VALID;
  `
} as const;
