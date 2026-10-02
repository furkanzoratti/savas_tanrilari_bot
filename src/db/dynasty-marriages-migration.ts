export const dynastyMarriagesMigration={
  version:110,
  name:"cross_dynasty_marriage_proposals",
  sql:`
    CREATE TABLE IF NOT EXISTS dynasty_marriage_proposals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      proposer_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      target_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      proposer_member_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      target_member_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
      created_turn INTEGER NOT NULL CHECK(created_turn>=0),
      resolved_turn INTEGER CHECK(resolved_turn IS NULL OR resolved_turn>=created_turn),
      created_by TEXT NOT NULL,
      resolved_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      CHECK(proposer_country_id<>target_country_id),
      CHECK(proposer_member_id<>target_member_id)
    );
    CREATE INDEX IF NOT EXISTS dynasty_marriage_target_pending_idx
      ON dynasty_marriage_proposals(guild_id,target_country_id,created_at DESC)
      WHERE status='PENDING';
    CREATE INDEX IF NOT EXISTS dynasty_marriage_proposer_pending_idx
      ON dynasty_marriage_proposals(guild_id,proposer_country_id,created_at DESC)
      WHERE status='PENDING';
    CREATE UNIQUE INDEX IF NOT EXISTS dynasty_member_one_pending_marriage_as_proposer
      ON dynasty_marriage_proposals(proposer_member_id) WHERE status='PENDING';
    CREATE UNIQUE INDEX IF NOT EXISTS dynasty_member_one_pending_marriage_as_target
      ON dynasty_marriage_proposals(target_member_id) WHERE status='PENDING';
  `
} as const;
