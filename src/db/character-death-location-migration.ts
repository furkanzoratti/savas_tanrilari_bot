export const characterDeathLocationMigration = {
  version: 83,
  name: "character_death_location_and_spy_cleanup",
  sql: `
    ALTER TABLE country_characters
      ADD COLUMN IF NOT EXISTS died_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS death_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL;

    WITH death_events AS (
      SELECT character.id,
             COALESCE(
               (SELECT operation.target_settlement_id
                  FROM espionage_operations operation
                 WHERE (operation.spy_character_id=character.id AND operation.captured=TRUE)
                    OR (operation.target_character_id=character.id AND operation.target_type='ASSASSINATE' AND operation.severity='HEAVY')
                 ORDER BY COALESCE(operation.executed_at,operation.resolved_at,operation.created_at) DESC
                 LIMIT 1),
               character.assigned_settlement_id,
               character.trained_settlement_id
             ) AS settlement_id,
             COALESCE(
               (SELECT COALESCE(operation.executed_at,operation.resolved_at,operation.created_at)
                  FROM espionage_operations operation
                 WHERE (operation.spy_character_id=character.id AND operation.captured=TRUE)
                    OR (operation.target_character_id=character.id AND operation.target_type='ASSASSINATE' AND operation.severity='HEAVY')
                 ORDER BY COALESCE(operation.executed_at,operation.resolved_at,operation.created_at) DESC
                 LIMIT 1),
               NOW()
             ) AS death_time
        FROM country_characters character
       WHERE character.character_status='DEAD'
    )
    UPDATE country_characters character
       SET death_settlement_id=COALESCE(character.death_settlement_id,event.settlement_id),
           died_at=COALESCE(character.died_at,event.death_time)
      FROM death_events event
     WHERE character.id=event.id;

    UPDATE espionage_operations operation
       SET status='CANCELLED',resolved_at=COALESCE(resolved_at,NOW()),
           effect_text=CASE WHEN COALESCE(effect_text,'')=''
             THEN 'Casus öldüğü için görevi iptal edildi.'
             ELSE effect_text || ' Casus öldüğü için görevi iptal edildi.' END
      FROM country_characters character
     WHERE operation.spy_character_id=character.id
       AND character.role='SPY' AND character.character_status='DEAD'
       AND operation.status='TRAVELING';

    UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,
      protected_character_id=NULL,assignment_ready_turn=NULL,unavailable_until_turn=NULL
      WHERE role='SPY' AND character_status='DEAD';
  `
} as const;
