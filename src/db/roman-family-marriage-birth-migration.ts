export const romanFamilyMarriageBirthMigration={
  version:162,
  name:"roman_family_marriage_and_player_births",
  sql:`
    ALTER TABLE roman_family_members ADD COLUMN IF NOT EXISTS birth_family_id UUID REFERENCES roman_families(id) ON DELETE SET NULL;
    UPDATE roman_family_members SET birth_family_id=family_id WHERE birth_family_id IS NULL;

    CREATE TABLE IF NOT EXISTS roman_family_marriage_proposals(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      proposer_family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      target_family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      proposer_member_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      target_member_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
      created_turn INTEGER NOT NULL CHECK(created_turn>=1),
      resolved_turn INTEGER,
      created_by TEXT NOT NULL,
      resolved_by TEXT,
      public_channel_id TEXT,
      public_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      CHECK(proposer_family_id<>target_family_id),
      CHECK(proposer_member_id<>target_member_id)
    );
    CREATE INDEX IF NOT EXISTS roman_family_marriage_proposals_lookup_idx
      ON roman_family_marriage_proposals(republic_id,status,created_at DESC);

    CREATE TABLE IF NOT EXISTS roman_family_birth_sessions(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      initiated_by TEXT NOT NULL,
      parent_member_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      mother_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      father_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK(game_turn>=1),
      attempt_roll INTEGER NOT NULL CHECK(attempt_roll BETWEEN 1 AND 20),
      age_modifier INTEGER NOT NULL,
      gender_roll INTEGER NOT NULL CHECK(gender_roll BETWEEN 1 AND 2),
      gender TEXT NOT NULL CHECK(gender IN ('MALE','FEMALE')),
      complication_roll INTEGER NOT NULL CHECK(complication_roll BETWEEN 1 AND 20),
      complication TEXT NOT NULL CHECK(complication IN ('DEATH','ILLNESS','HEALTHY')),
      child_relation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_NAME' CHECK(status IN ('PENDING_NAME','NAMED','CANCELLED')),
      child_id UUID REFERENCES roman_family_members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS roman_family_birth_sessions_pending_family_idx
      ON roman_family_birth_sessions(family_id) WHERE status='PENDING_NAME';
  `
} as const;
