export const romanElectionNpcScoreMigration={
  version:196,
  name:"roman_election_npc_score",
  sql:`
    ALTER TABLE roman_election_ballots
      ADD COLUMN IF NOT EXISTS npc_score INTEGER;
  `
} as const;
