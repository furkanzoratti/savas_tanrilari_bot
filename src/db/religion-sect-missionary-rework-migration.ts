export const religionSectMissionaryReworkMigration={
  version:236,
  name:"religion_sect_missionary_rework",
  sql:`
    ALTER TABLE missionary_operations
      ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'RELIGION',
      ADD COLUMN IF NOT EXISTS sect_key TEXT;

    ALTER TABLE missionary_operations DROP CONSTRAINT IF EXISTS missionary_operations_task_type_check;
    ALTER TABLE missionary_operations ADD CONSTRAINT missionary_operations_task_type_check
      CHECK(task_type IN ('RELIGION','SECT'));
    ALTER TABLE missionary_operations DROP CONSTRAINT IF EXISTS missionary_operations_sect_target_check;
    ALTER TABLE missionary_operations ADD CONSTRAINT missionary_operations_sect_target_check
      CHECK((task_type='RELIGION' AND sect_key IS NULL) OR (task_type='SECT' AND sect_key IS NOT NULL));

    CREATE TABLE IF NOT EXISTS missionary_progress_logs(
      operation_id UUID NOT NULL REFERENCES missionary_operations(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      base_progress SMALLINT NOT NULL,
      task_bonus SMALLINT NOT NULL,
      population_penalty SMALLINT NOT NULL,
      belief_penalty SMALLINT NOT NULL,
      building_penalty SMALLINT NOT NULL,
      actual_progress NUMERIC(5,2) NOT NULL CHECK(actual_progress BETWEEN 0 AND 100),
      before_percent NUMERIC(5,2) NOT NULL CHECK(before_percent BETWEEN 0 AND 100),
      after_percent NUMERIC(5,2) NOT NULL CHECK(after_percent BETWEEN 0 AND 100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(operation_id,game_turn)
    );

    CREATE OR REPLACE FUNCTION validate_and_sync_settlement_religion_shares()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
      target_settlement UUID;
      share_total NUMERIC(7,2);
      leading_religion TEXT;
      leading_total NUMERIC(5,2);
    BEGIN
      IF TG_OP='DELETE' THEN target_settlement:=OLD.settlement_id;
      ELSE target_settlement:=NEW.settlement_id;
      END IF;
      IF NOT EXISTS(SELECT 1 FROM settlements WHERE id=target_settlement) THEN RETURN NULL; END IF;

      SELECT COALESCE(SUM(primary_percent+secondary_percent),0)
        INTO share_total FROM settlement_religion_shares WHERE settlement_id=target_settlement;
      IF share_total<>100 THEN
        RAISE EXCEPTION 'Yerleşke din dağılımı toplamı 100 olmalıdır; mevcut toplam: %',share_total;
      END IF;

      SELECT shares.religion_key,shares.primary_percent+shares.secondary_percent
        INTO leading_religion,leading_total
        FROM settlement_religion_shares shares
        JOIN settlements settlement ON settlement.id=shares.settlement_id
       WHERE shares.settlement_id=target_settlement
       ORDER BY (shares.primary_percent+shares.secondary_percent) DESC,
                (shares.religion_key=settlement.religion_key) DESC,shares.religion_key
       LIMIT 1;

      UPDATE settlements
         SET religion_key=leading_religion,religion_adherence_percent=leading_total
       WHERE id=target_settlement;
      RETURN NULL;
    END
    $$;

    WITH leading AS (
      SELECT DISTINCT ON (share.settlement_id)
             share.settlement_id,share.religion_key,
             share.primary_percent+share.secondary_percent AS family_percent
        FROM settlement_religion_shares share
        JOIN settlements settlement ON settlement.id=share.settlement_id
       ORDER BY share.settlement_id,(share.primary_percent+share.secondary_percent) DESC,
                (share.religion_key=settlement.religion_key) DESC,share.religion_key
    )
    UPDATE settlements settlement
       SET religion_key=leading.religion_key,religion_adherence_percent=leading.family_percent
      FROM leading WHERE leading.settlement_id=settlement.id;
  `
} as const;
