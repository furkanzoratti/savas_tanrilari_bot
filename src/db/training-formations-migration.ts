export const trainingFormationsMigration = {
  version: 241,
  name: "automatic_training_armies_and_fleets",
  sql: `
    ALTER TABLE armies
      ADD COLUMN IF NOT EXISTS formation_kind TEXT NOT NULL DEFAULT 'PERMANENT',
      ADD COLUMN IF NOT EXISTS origin_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS completion_turn INTEGER;
    ALTER TABLE armies DROP CONSTRAINT IF EXISTS armies_formation_kind_check;
    ALTER TABLE armies ADD CONSTRAINT armies_formation_kind_check
      CHECK (formation_kind IN ('PERMANENT','TRAINING'));
    CREATE UNIQUE INDEX IF NOT EXISTS armies_training_formation_unique
      ON armies(country_id,origin_settlement_id,completion_turn)
      WHERE formation_kind='TRAINING' AND origin_settlement_id IS NOT NULL AND completion_turn IS NOT NULL;

    ALTER TABLE fleets
      ADD COLUMN IF NOT EXISTS formation_kind TEXT NOT NULL DEFAULT 'PERMANENT',
      ADD COLUMN IF NOT EXISTS origin_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS completion_turn INTEGER;
    ALTER TABLE fleets DROP CONSTRAINT IF EXISTS fleets_formation_kind_check;
    ALTER TABLE fleets ADD CONSTRAINT fleets_formation_kind_check
      CHECK (formation_kind IN ('PERMANENT','TRAINING'));
    CREATE UNIQUE INDEX IF NOT EXISTS fleets_training_formation_unique
      ON fleets(country_id,origin_settlement_id,completion_turn)
      WHERE formation_kind='TRAINING' AND origin_settlement_id IS NOT NULL AND completion_turn IS NOT NULL;

    CREATE INDEX IF NOT EXISTS audit_logs_military_history_idx
      ON audit_logs(guild_id,created_at DESC)
      WHERE action LIKE 'army.%' OR action LIKE 'fleet.%'
         OR action IN ('UNIT_PURCHASE','SHIP_PURCHASE','army.training.complete','fleet.training.complete');

    UPDATE audit_logs log SET details=jsonb_set(log.details,'{countryId}',to_jsonb(army.country_id::text),TRUE)
      FROM armies army
     WHERE log.entity_type='army' AND log.entity_id=army.id::text
       AND log.details->>'countryId' IS NULL;
    UPDATE audit_logs log SET details=jsonb_set(log.details,'{countryId}',to_jsonb(fleet.country_id::text),TRUE)
      FROM fleets fleet
     WHERE log.entity_type='fleet' AND log.entity_id=fleet.id::text
       AND log.details->>'countryId' IS NULL;
  `
} as const;
