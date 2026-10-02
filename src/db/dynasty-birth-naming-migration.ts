export const dynastyBirthNamingMigration={
  version:114,
  name:"dynasty_birth_gender_before_naming",
  sql:`
    CREATE TABLE IF NOT EXISTS dynasty_birth_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
      initiated_by TEXT NOT NULL,
      parent_member_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      mother_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      father_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn>=0),
      attempt_roll INTEGER NOT NULL CHECK (attempt_roll BETWEEN 1 AND 20),
      age_modifier INTEGER NOT NULL,
      gender_roll INTEGER NOT NULL CHECK (gender_roll BETWEEN 1 AND 2),
      gender TEXT NOT NULL CHECK (gender IN ('MALE','FEMALE')),
      complication_roll INTEGER NOT NULL CHECK (complication_roll BETWEEN 1 AND 20),
      complication TEXT NOT NULL CHECK (complication IN ('DEATH','ILLNESS','HEALTHY')),
      child_relation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_NAME' CHECK (status IN ('PENDING_NAME','COMPLETED')),
      child_id UUID REFERENCES dynasty_members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE UNIQUE INDEX IF NOT EXISTS dynasty_one_pending_birth_name
      ON dynasty_birth_sessions(dynasty_id) WHERE status='PENDING_NAME';
    CREATE INDEX IF NOT EXISTS dynasty_birth_sessions_parent_idx
      ON dynasty_birth_sessions(parent_member_id,status,created_at DESC);
  `
} as const;
