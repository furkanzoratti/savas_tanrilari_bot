export const greatGamesGladiatorAuctionMigration = {
  version: 119,
  name: "capua_gladiator_auction_and_ownership",
  sql: `
    CREATE TABLE IF NOT EXISTS great_games_gladiator_auctions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      season_id UUID NOT NULL UNIQUE REFERENCES great_games_seasons(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FINISHED','CANCELLED')),
      opened_by TEXT NOT NULL,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS great_games_gladiator_auction_bids (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      auction_id UUID NOT NULL REFERENCES great_games_gladiator_auctions(id) ON DELETE CASCADE,
      gladiator_id UUID NOT NULL REFERENCES great_games_gladiators(id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      discord_user_id TEXT NOT NULL,
      amount BIGINT NOT NULL CHECK (amount>=50 AND MOD(amount-50,25)=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (auction_id,gladiator_id,country_id)
    );

    CREATE TABLE IF NOT EXISTS great_games_gladiator_ownerships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      season_id UUID NOT NULL REFERENCES great_games_seasons(id) ON DELETE CASCADE,
      gladiator_id UUID NOT NULL REFERENCES great_games_gladiators(id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      purchase_price BIGINT NOT NULL CHECK (purchase_price>=50),
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (season_id,gladiator_id)
    );

    CREATE INDEX IF NOT EXISTS great_games_gladiator_auction_bids_lot_idx
      ON great_games_gladiator_auction_bids(auction_id,gladiator_id,amount DESC,updated_at);
    CREATE INDEX IF NOT EXISTS great_games_gladiator_ownerships_country_idx
      ON great_games_gladiator_ownerships(season_id,country_id);
  `
} as const;
