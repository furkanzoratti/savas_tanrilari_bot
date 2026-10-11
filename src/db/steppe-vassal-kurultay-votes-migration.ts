export const steppeVassalKurultayVotesMigration={
  version:185,
  name:"allow_steppe_vassal_votes_in_kurultay",
  sql:`
    ALTER TABLE steppe_kurultay_ballots
      DROP CONSTRAINT IF EXISTS steppe_kurultay_ballots_pkey;

    ALTER TABLE steppe_kurultay_ballots
      ALTER COLUMN voter_title_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS voter_country_id UUID REFERENCES countries(id) ON DELETE RESTRICT;

    ALTER TABLE steppe_kurultay_ballots
      DROP CONSTRAINT IF EXISTS steppe_kurultay_ballots_single_voter_source_check;
    ALTER TABLE steppe_kurultay_ballots
      ADD CONSTRAINT steppe_kurultay_ballots_single_voter_source_check
      CHECK (num_nonnulls(voter_title_id,voter_country_id)=1);

    CREATE UNIQUE INDEX IF NOT EXISTS steppe_kurultay_ballots_title_voter_unique
      ON steppe_kurultay_ballots(election_id,voter_title_id)
      WHERE voter_title_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS steppe_kurultay_ballots_country_voter_unique
      ON steppe_kurultay_ballots(election_id,voter_country_id)
      WHERE voter_country_id IS NOT NULL;
  `
} as const;
