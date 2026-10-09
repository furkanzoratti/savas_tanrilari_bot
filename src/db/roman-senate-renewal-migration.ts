export const romanSenateRenewalMigration={
  version:156,
  name:"roman_senate_dynamic_seat_renewals",
  sql:`
    CREATE TABLE IF NOT EXISTS roman_senate_renewals(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      election_id UUID NOT NULL UNIQUE REFERENCES roman_elections(id) ON DELETE CASCADE,
      previous_term_started_turn INTEGER NOT NULL,
      resolved_turn INTEGER NOT NULL,
      total_seats INTEGER NOT NULL CHECK(total_seats>0),
      family_seat_floor INTEGER NOT NULL CHECK(family_seat_floor>=0),
      family_seat_cap INTEGER NOT NULL CHECK(family_seat_cap>=family_seat_floor),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS roman_senate_renewals_republic_idx
      ON roman_senate_renewals(republic_id,resolved_turn DESC);

    CREATE TABLE IF NOT EXISTS roman_senate_seat_changes(
      renewal_id UUID NOT NULL REFERENCES roman_senate_renewals(id) ON DELETE CASCADE,
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      previous_seats INTEGER NOT NULL CHECK(previous_seats>=0),
      new_seats INTEGER NOT NULL CHECK(new_seats>=0),
      performance_score INTEGER NOT NULL,
      reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      PRIMARY KEY(renewal_id,family_id)
    );
  `
} as const;
