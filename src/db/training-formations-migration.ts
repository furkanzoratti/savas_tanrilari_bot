export const trainingFormationsMigration = {
  version: 241,
  name: "automatic_training_armies_and_fleets",
  sql: `
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS game_turn INTEGER;
    CREATE OR REPLACE FUNCTION capture_audit_log_game_turn() RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.game_turn IS NULL THEN
        SELECT current_turn INTO NEW.game_turn FROM guilds WHERE discord_id=NEW.guild_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS audit_logs_capture_game_turn ON audit_logs;
    CREATE TRIGGER audit_logs_capture_game_turn
      BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION capture_audit_log_game_turn();

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
    UPDATE audit_logs SET game_turn=(details->>'completionTurn')::integer
     WHERE game_turn IS NULL AND details->>'completionTurn' ~ '^[0-9]+$';
    UPDATE audit_logs log SET game_turn=COALESCE(
      (SELECT (turn_log.details->>'to')::integer
         FROM audit_logs turn_log
        WHERE turn_log.guild_id=log.guild_id AND turn_log.action='TURN_ADVANCE'
          AND turn_log.created_at<=log.created_at AND turn_log.details->>'to' ~ '^[0-9]+$'
        ORDER BY turn_log.created_at DESC LIMIT 1),
      (SELECT (turn_log.details->>'from')::integer
         FROM audit_logs turn_log
        WHERE turn_log.guild_id=log.guild_id AND turn_log.action='TURN_ADVANCE'
          AND turn_log.created_at>log.created_at AND turn_log.details->>'from' ~ '^[0-9]+$'
        ORDER BY turn_log.created_at ASC LIMIT 1)
    )
     WHERE log.game_turn IS NULL
       AND (log.action LIKE 'army.%' OR log.action LIKE 'fleet.%'
         OR log.action IN ('UNIT_PURCHASE','SHIP_PURCHASE'));
  `
} as const;
