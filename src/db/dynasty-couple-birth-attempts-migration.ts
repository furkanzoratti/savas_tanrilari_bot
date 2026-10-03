export const dynastyCoupleBirthAttemptsMigration={
  version:125,
  name:"dynasty_birth_attempt_cooldown_per_couple",
  sql:`
    CREATE TABLE IF NOT EXISTS dynasty_couple_birth_attempts (
      dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
      first_member_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      second_member_id UUID NOT NULL REFERENCES dynasty_members(id) ON DELETE CASCADE,
      last_attempt_turn INTEGER NOT NULL CHECK (last_attempt_turn>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (dynasty_id,first_member_id,second_member_id),
      CHECK (first_member_id<second_member_id)
    );

    INSERT INTO dynasty_couple_birth_attempts(
      dynasty_id,first_member_id,second_member_id,last_attempt_turn
    )
    SELECT session.dynasty_id,
           LEAST(session.mother_id,session.father_id),
           GREATEST(session.mother_id,session.father_id),
           MAX(session.game_turn)
      FROM dynasty_birth_sessions session
     GROUP BY session.dynasty_id,LEAST(session.mother_id,session.father_id),GREATEST(session.mother_id,session.father_id)
    ON CONFLICT(dynasty_id,first_member_id,second_member_id)
    DO UPDATE SET last_attempt_turn=GREATEST(
      dynasty_couple_birth_attempts.last_attempt_turn,EXCLUDED.last_attempt_turn
    ),updated_at=NOW();

    INSERT INTO dynasty_couple_birth_attempts(
      dynasty_id,first_member_id,second_member_id,last_attempt_turn
    )
    SELECT event.dynasty_id,
           LEAST(event.member_id,father.id),
           GREATEST(event.member_id,father.id),
           MAX(event.game_turn)
      FROM dynasty_events event
      JOIN dynasty_members father
        ON father.dynasty_id=event.dynasty_id
       AND lower(father.name)=lower(event.details->>'fatherName')
     WHERE event.event_type='BIRTH_ATTEMPT_FAILED'
       AND event.member_id IS NOT NULL
       AND event.details->>'fatherName' IS NOT NULL
     GROUP BY event.dynasty_id,LEAST(event.member_id,father.id),GREATEST(event.member_id,father.id)
    ON CONFLICT(dynasty_id,first_member_id,second_member_id)
    DO UPDATE SET last_attempt_turn=GREATEST(
      dynasty_couple_birth_attempts.last_attempt_turn,EXCLUDED.last_attempt_turn
    ),updated_at=NOW();
  `
} as const;
