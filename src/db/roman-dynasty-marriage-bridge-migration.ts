export const romanDynastyMarriageBridgeMigration={
  version:200,
  name:"roman_family_dynasty_marriage_bridge",
  sql:`
    ALTER TABLE roman_family_members
      ADD COLUMN IF NOT EXISTS dynasty_spouse_id UUID REFERENCES dynasty_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS dynasty_mother_id UUID REFERENCES dynasty_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS dynasty_father_id UUID REFERENCES dynasty_members(id) ON DELETE SET NULL;

    ALTER TABLE dynasty_members
      ADD COLUMN IF NOT EXISTS roman_spouse_id UUID REFERENCES roman_family_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS roman_mother_id UUID REFERENCES roman_family_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS roman_father_id UUID REFERENCES roman_family_members(id) ON DELETE SET NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS roman_family_members_one_dynasty_spouse_idx
      ON roman_family_members(dynasty_spouse_id) WHERE dynasty_spouse_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS dynasty_members_one_roman_spouse_idx
      ON dynasty_members(roman_spouse_id) WHERE roman_spouse_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS roman_dynasty_marriage_proposals(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      proposer_family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      roman_member_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      target_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      target_dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
      dynasty_member_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
      created_turn INTEGER NOT NULL CHECK(created_turn>=0),
      resolved_turn INTEGER,
      created_by TEXT NOT NULL,
      resolved_by TEXT,
      public_channel_id TEXT,
      public_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS roman_dynasty_marriage_proposals_roman_idx
      ON roman_dynasty_marriage_proposals(republic_id,proposer_family_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS roman_dynasty_marriage_proposals_dynasty_idx
      ON roman_dynasty_marriage_proposals(target_dynasty_id,status,created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS roman_dynasty_marriage_pending_roman_idx
      ON roman_dynasty_marriage_proposals(roman_member_id) WHERE status='PENDING';
    CREATE UNIQUE INDEX IF NOT EXISTS roman_dynasty_marriage_pending_dynasty_idx
      ON roman_dynasty_marriage_proposals(dynasty_member_id) WHERE status='PENDING';

    CREATE TABLE IF NOT EXISTS roman_dynasty_marriages(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      republic_id UUID NOT NULL REFERENCES roman_republics(id) ON DELETE CASCADE,
      family_id UUID NOT NULL REFERENCES roman_families(id) ON DELETE CASCADE,
      roman_member_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
      dynasty_member_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      household_type TEXT NOT NULL CHECK(household_type IN ('ROMAN_FAMILY','DYNASTY')),
      married_turn INTEGER NOT NULL CHECK(married_turn>=0),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ENDED')),
      created_by TEXT NOT NULL,
      ended_turn INTEGER,
      ended_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS roman_dynasty_marriages_active_roman_idx
      ON roman_dynasty_marriages(roman_member_id) WHERE status='ACTIVE';
    CREATE UNIQUE INDEX IF NOT EXISTS roman_dynasty_marriages_active_dynasty_idx
      ON roman_dynasty_marriages(dynasty_member_id) WHERE status='ACTIVE';

    CREATE TABLE IF NOT EXISTS roman_dynasty_birth_attempts(
      marriage_id UUID PRIMARY KEY REFERENCES roman_dynasty_marriages(id) ON DELETE CASCADE,
      last_attempt_turn INTEGER NOT NULL CHECK(last_attempt_turn>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS roman_dynasty_birth_sessions(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      marriage_id UUID NOT NULL REFERENCES roman_dynasty_marriages(id) ON DELETE CASCADE,
      household_type TEXT NOT NULL CHECK(household_type IN ('ROMAN_FAMILY','DYNASTY')),
      family_id UUID REFERENCES roman_families(id) ON DELETE CASCADE,
      dynasty_id UUID REFERENCES dynasties(id) ON DELETE CASCADE,
      initiated_by TEXT NOT NULL,
      roman_member_id UUID NOT NULL REFERENCES roman_family_members(id) ON DELETE CASCADE,
      dynasty_member_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      mother_system TEXT NOT NULL CHECK(mother_system IN ('ROMAN_FAMILY','DYNASTY')),
      game_turn INTEGER NOT NULL CHECK(game_turn>=0),
      attempt_roll INTEGER NOT NULL CHECK(attempt_roll BETWEEN 1 AND 20),
      age_modifier INTEGER NOT NULL,
      gender_roll INTEGER NOT NULL CHECK(gender_roll BETWEEN 1 AND 2),
      gender TEXT NOT NULL CHECK(gender IN ('MALE','FEMALE')),
      complication_roll INTEGER NOT NULL CHECK(complication_roll BETWEEN 1 AND 20),
      complication TEXT NOT NULL CHECK(complication IN ('DEATH','ILLNESS','HEALTHY')),
      child_relation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_NAME' CHECK(status IN ('PENDING_NAME','COMPLETED','CANCELLED')),
      roman_child_id UUID REFERENCES roman_family_members(id) ON DELETE SET NULL,
      dynasty_child_id UUID REFERENCES dynasty_members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      CHECK((household_type='ROMAN_FAMILY' AND family_id IS NOT NULL AND dynasty_id IS NULL)
         OR (household_type='DYNASTY' AND dynasty_id IS NOT NULL AND family_id IS NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS roman_dynasty_birth_pending_marriage_idx
      ON roman_dynasty_birth_sessions(marriage_id) WHERE status='PENDING_NAME';
    CREATE UNIQUE INDEX IF NOT EXISTS roman_dynasty_birth_pending_family_idx
      ON roman_dynasty_birth_sessions(family_id) WHERE status='PENDING_NAME' AND family_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS roman_dynasty_birth_pending_dynasty_idx
      ON roman_dynasty_birth_sessions(dynasty_id) WHERE status='PENDING_NAME' AND dynasty_id IS NOT NULL;

    CREATE OR REPLACE FUNCTION close_roman_dynasty_marriage_for_roman_death()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE death_turn INTEGER;
    BEGIN
      IF OLD.status='ALIVE' AND NEW.status='DEAD' THEN
        SELECT guild.current_turn INTO death_turn
          FROM roman_families family
          JOIN roman_republics republic ON republic.id=family.republic_id
          JOIN guilds guild ON guild.discord_id=republic.guild_id
         WHERE family.id=NEW.family_id;
        IF OLD.dynasty_spouse_id IS NOT NULL THEN
          UPDATE dynasty_members SET roman_spouse_id=NULL,updated_at=NOW()
           WHERE id=OLD.dynasty_spouse_id AND roman_spouse_id=NEW.id;
          UPDATE roman_dynasty_marriages
             SET status='ENDED',ended_turn=COALESCE(death_turn,married_turn),ended_reason='Eşin ölümü',ended_at=NOW()
           WHERE roman_member_id=NEW.id AND status='ACTIVE';
        END IF;
        UPDATE roman_dynasty_marriage_proposals
           SET status='CANCELLED',resolved_turn=COALESCE(death_turn,created_turn),resolved_by='system:death',resolved_at=NOW()
         WHERE roman_member_id=NEW.id AND status='PENDING';
        NEW.dynasty_spouse_id:=NULL;
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS roman_dynasty_marriage_roman_death_trigger ON roman_family_members;
    CREATE TRIGGER roman_dynasty_marriage_roman_death_trigger
      BEFORE UPDATE OF status ON roman_family_members
      FOR EACH ROW EXECUTE FUNCTION close_roman_dynasty_marriage_for_roman_death();

    CREATE OR REPLACE FUNCTION close_roman_dynasty_marriage_for_dynasty_death()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE death_turn INTEGER;
    BEGIN
      IF OLD.status='ALIVE' AND NEW.status='DEAD' THEN
        SELECT guild.current_turn INTO death_turn
          FROM dynasties dynasty JOIN guilds guild ON guild.discord_id=dynasty.guild_id
         WHERE dynasty.id=NEW.dynasty_id;
        IF OLD.roman_spouse_id IS NOT NULL THEN
          UPDATE roman_family_members SET dynasty_spouse_id=NULL,updated_at=NOW()
           WHERE id=OLD.roman_spouse_id AND dynasty_spouse_id=NEW.id;
          UPDATE roman_dynasty_marriages
             SET status='ENDED',ended_turn=COALESCE(death_turn,married_turn),ended_reason='Eşin ölümü',ended_at=NOW()
           WHERE dynasty_member_id=NEW.id AND status='ACTIVE';
        END IF;
        UPDATE roman_dynasty_marriage_proposals
           SET status='CANCELLED',resolved_turn=COALESCE(death_turn,created_turn),resolved_by='system:death',resolved_at=NOW()
         WHERE dynasty_member_id=NEW.id AND status='PENDING';
        NEW.roman_spouse_id:=NULL;
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS roman_dynasty_marriage_dynasty_death_trigger ON dynasty_members;
    CREATE TRIGGER roman_dynasty_marriage_dynasty_death_trigger
      BEFORE UPDATE OF status ON dynasty_members
      FOR EACH ROW EXECUTE FUNCTION close_roman_dynasty_marriage_for_dynasty_death();
  `
} as const;
