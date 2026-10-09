export const romanRepublicElectionsMigration={
  version:152,
  name:"roman_republic_elections_and_governors",
  sql:`
    ALTER TABLE roman_republics
      ADD COLUMN IF NOT EXISTS senate_total_seats INTEGER NOT NULL DEFAULT 100 CHECK(senate_total_seats BETWEEN 10 AND 500),
      ADD COLUMN IF NOT EXISTS family_seat_cap INTEGER NOT NULL DEFAULT 35 CHECK(family_seat_cap BETWEEN 1 AND 250);

    CREATE TABLE IF NOT EXISTS roman_elections(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL CHECK(sequence>0),
      started_turn INTEGER NOT NULL,
      closes_turn INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','COMPLETED','CANCELLED')),
      winner_family_id UUID REFERENCES roman_families(id) ON DELETE SET NULL,
      resolved_turn INTEGER,
      started_by TEXT,
      resolved_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      UNIQUE(republic_id,sequence)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS roman_elections_one_open_idx
      ON roman_elections(republic_id) WHERE status='OPEN';

    CREATE TABLE IF NOT EXISTS roman_election_candidates(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      election_id UUID NOT NULL REFERENCES roman_elections(id) ON DELETE CASCADE,
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      candidate_name TEXT NOT NULL CHECK(char_length(candidate_name) BETWEEN 2 AND 80),
      nomination_cost INTEGER NOT NULL DEFAULT 5 CHECK(nomination_cost>=0),
      nominated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(election_id,family_id),
      UNIQUE(election_id,candidate_name)
    );

    CREATE TABLE IF NOT EXISTS roman_election_ballots(
      election_id UUID NOT NULL REFERENCES roman_elections(id) ON DELETE CASCADE,
      voter_family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      candidate_id UUID NOT NULL REFERENCES roman_election_candidates(id) ON DELETE CASCADE,
      seat_weight INTEGER NOT NULL CHECK(seat_weight>=1),
      influence_spent INTEGER NOT NULL DEFAULT 0 CHECK(influence_spent BETWEEN 0 AND 10),
      total_weight INTEGER NOT NULL CHECK(total_weight>=1),
      voted_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(election_id,voter_family_id)
    );

    CREATE TABLE IF NOT EXISTS roman_governorships(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      governor_name TEXT NOT NULL CHECK(char_length(governor_name) BETWEEN 2 AND 80),
      appointed_turn INTEGER NOT NULL,
      end_turn INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','REMOVED')),
      appointed_by TEXT NOT NULL,
      removed_by TEXT,
      removed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS roman_governorships_active_settlement_idx
      ON roman_governorships(republic_id,settlement_id) WHERE status='ACTIVE';
    CREATE INDEX IF NOT EXISTS roman_governorships_family_idx
      ON roman_governorships(family_id,status,end_turn);

    CREATE TABLE IF NOT EXISTS roman_governorship_income_runs(
      governorship_id UUID NOT NULL REFERENCES roman_governorships(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      settlement_net_income BIGINT NOT NULL DEFAULT 0,
      treasury_share BIGINT NOT NULL DEFAULT 0,
      influence_gain INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(governorship_id,game_turn)
    );
  `
} as const;
