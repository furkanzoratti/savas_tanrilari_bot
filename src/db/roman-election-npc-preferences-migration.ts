export const romanElectionNpcPreferencesMigration={
  version:216,
  name:"roman_election_npc_vote_preferences",
  sql:`
    CREATE TABLE IF NOT EXISTS roman_election_npc_preferences (
      election_id UUID NOT NULL REFERENCES roman_elections(id) ON DELETE CASCADE,
      voter_family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      candidate_id UUID NOT NULL REFERENCES roman_election_candidates(id) ON DELETE CASCADE,
      set_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(election_id,voter_family_id)
    );
    CREATE INDEX IF NOT EXISTS roman_election_npc_preferences_candidate_idx
      ON roman_election_npc_preferences(candidate_id);
  `
} as const;
