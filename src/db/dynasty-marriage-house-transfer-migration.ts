export const dynastyMarriageHouseTransferMigration={
  version:148,
  name:"dynasty_married_women_join_husbands_house",
  sql:`
    ALTER TABLE dynasty_members
      ADD COLUMN IF NOT EXISTS birth_dynasty_id UUID REFERENCES dynasties(id) ON DELETE SET NULL;

    UPDATE dynasty_members
       SET birth_dynasty_id=dynasty_id
     WHERE birth_dynasty_id IS NULL;

    CREATE INDEX IF NOT EXISTS dynasty_members_birth_dynasty_idx
      ON dynasty_members(birth_dynasty_id);

    CREATE TEMP TABLE dynasty_wife_house_transfers ON COMMIT DROP AS
    SELECT wife.id AS wife_id,
           wife.dynasty_id AS source_dynasty_id,
           husband.dynasty_id AS target_dynasty_id,
           wife.is_heir AS was_heir
      FROM dynasty_members wife
      JOIN dynasty_members husband
        ON husband.id=wife.spouse_id
       AND husband.spouse_id=wife.id
     WHERE wife.gender='FEMALE'
       AND husband.gender='MALE'
       AND wife.dynasty_id<>husband.dynasty_id
       AND wife.is_monarch=FALSE;

    INSERT INTO dynasty_couple_birth_attempts(
      dynasty_id,first_member_id,second_member_id,last_attempt_turn
    )
    SELECT transfer.target_dynasty_id,
           attempt.first_member_id,
           attempt.second_member_id,
           MAX(attempt.last_attempt_turn)
      FROM dynasty_couple_birth_attempts attempt
      JOIN dynasty_wife_house_transfers transfer
        ON transfer.wife_id IN (attempt.first_member_id,attempt.second_member_id)
     GROUP BY transfer.target_dynasty_id,attempt.first_member_id,attempt.second_member_id
    ON CONFLICT(dynasty_id,first_member_id,second_member_id)
    DO UPDATE SET last_attempt_turn=GREATEST(
      dynasty_couple_birth_attempts.last_attempt_turn,EXCLUDED.last_attempt_turn
    ),updated_at=NOW();

    DELETE FROM dynasty_couple_birth_attempts attempt
     USING dynasty_wife_house_transfers transfer
     WHERE attempt.dynasty_id=transfer.source_dynasty_id
       AND transfer.wife_id IN (attempt.first_member_id,attempt.second_member_id);

    UPDATE dynasty_members wife
       SET birth_dynasty_id=COALESCE(wife.birth_dynasty_id,transfer.source_dynasty_id),
           dynasty_id=transfer.target_dynasty_id,
           is_heir=FALSE,
           succession_rank=NULL,
           relation='Evlilik yoluyla hanedana katıldı',
           updated_at=NOW()
      FROM dynasty_wife_house_transfers transfer
     WHERE wife.id=transfer.wife_id;

    CREATE TEMP TABLE dynasty_transfer_replacement_heirs ON COMMIT DROP AS
    SELECT id,dynasty_id
      FROM (
        SELECT member.id,member.dynasty_id,
               ROW_NUMBER() OVER (
                 PARTITION BY member.dynasty_id
                 ORDER BY CASE WHEN member.gender='MALE' THEN 0 ELSE 1 END,
                          member.succession_rank NULLS LAST,
                          member.age DESC,
                          member.created_at
               ) AS row_number
          FROM dynasty_members member
         WHERE member.status='ALIVE'
           AND member.is_monarch=FALSE
           AND (member.succession_rank IS NOT NULL OR member.is_heir=TRUE)
           AND member.dynasty_id IN (
             SELECT source_dynasty_id FROM dynasty_wife_house_transfers WHERE was_heir=TRUE
           )
      ) ranked
     WHERE ranked.row_number=1;

    UPDATE dynasty_members member
       SET is_heir=TRUE,updated_at=NOW()
      FROM dynasty_transfer_replacement_heirs replacement
     WHERE member.id=replacement.id
       AND NOT EXISTS (
         SELECT 1 FROM dynasty_members current_heir
          WHERE current_heir.dynasty_id=replacement.dynasty_id
            AND current_heir.status='ALIVE'
            AND current_heir.is_heir=TRUE
       );
  `
} as const;
