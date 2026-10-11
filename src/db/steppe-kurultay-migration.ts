export const steppeKurultayMigration={
  version:178,
  name:"steppe_great_khan_kurultay",
  sql:`
    ALTER TABLE steppe_hegemonies
      ADD COLUMN IF NOT EXISTS term_started_turn INTEGER,
      ADD COLUMN IF NOT EXISTS next_kurultay_turn INTEGER;

    UPDATE steppe_hegemonies hegemony
       SET term_started_turn=COALESCE(term_started_turn,guild.current_turn),
           next_kurultay_turn=COALESCE(next_kurultay_turn,guild.current_turn+6)
      FROM guilds guild
     WHERE guild.discord_id=hegemony.guild_id;

    CREATE TABLE IF NOT EXISTS steppe_kurultay_elections(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL CHECK(sequence>0),
      scheduled_turn INTEGER NOT NULL,
      started_turn INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','COMPLETED','CANCELLED')),
      incumbent_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
      winner_title_id UUID REFERENCES steppe_internal_titles(id) ON DELETE SET NULL,
      started_by TEXT NOT NULL,
      completed_by TEXT,
      completed_turn INTEGER,
      channel_id TEXT,
      message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,sequence)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS steppe_one_open_kurultay_idx
      ON steppe_kurultay_elections(guild_id) WHERE status='OPEN';

    CREATE TABLE IF NOT EXISTS steppe_kurultay_candidates(
      election_id UUID NOT NULL REFERENCES steppe_kurultay_elections(id) ON DELETE CASCADE,
      title_id UUID NOT NULL REFERENCES steppe_internal_titles(id) ON DELETE RESTRICT,
      nominated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(election_id,title_id)
    );

    CREATE TABLE IF NOT EXISTS steppe_kurultay_ballots(
      election_id UUID NOT NULL REFERENCES steppe_kurultay_elections(id) ON DELETE CASCADE,
      voter_title_id UUID NOT NULL REFERENCES steppe_internal_titles(id) ON DELETE RESTRICT,
      candidate_title_id UUID NOT NULL REFERENCES steppe_internal_titles(id) ON DELETE RESTRICT,
      vote_weight INTEGER NOT NULL CHECK(vote_weight IN (1,2)),
      voter_kind TEXT NOT NULL CHECK(voter_kind IN ('PLAYER','NPC')),
      voted_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(election_id,voter_title_id)
    );
    CREATE INDEX IF NOT EXISTS steppe_kurultay_ballots_candidate_idx
      ON steppe_kurultay_ballots(election_id,candidate_title_id);
  `
} as const;
