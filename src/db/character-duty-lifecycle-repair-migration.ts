export const characterDutyLifecycleRepairMigration={
  version:195,
  name:"character_duty_lifecycle_repair",
  sql:`
    WITH affected AS (
      SELECT operation.id,operation.spy_character_id AS character_id
        FROM espionage_operations operation
       WHERE operation.status='TRAVELING' AND (
         EXISTS (SELECT 1 FROM espionage_captivities captivity
                  WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=operation.spy_character_id AND captivity.status='HELD')
         OR EXISTS (SELECT 1 FROM countries country
                     WHERE country.status='YOK_EDİLDİ' AND country.id IN(operation.attacker_country_id,operation.target_country_id))
       )
    ), cancelled AS (
      UPDATE espionage_operations operation
         SET status='CANCELLED',resolved_at=COALESCE(operation.resolved_at,NOW()),
             effect_text=CASE WHEN COALESCE(operation.effect_text,'')='' THEN 'Karakter veya devlet etkin olmadığı için görev sonlandırıldı.'
                              ELSE operation.effect_text||' Karakter veya devlet etkin olmadığı için görev sonlandırıldı.' END
       WHERE operation.id IN(SELECT id FROM affected)
       RETURNING operation.spy_character_id
    )
    UPDATE country_characters character
       SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
           assignment_ready_turn=NULL,unavailable_until_turn=NULL
     WHERE character.id IN(SELECT spy_character_id FROM cancelled)
       AND character.character_status='ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM espionage_captivities captivity
                        WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD');

    WITH affected AS (
      SELECT operation.id,operation.merchant_character_id AS character_id
        FROM merchant_operations operation
       WHERE operation.status IN('PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED') AND (
         EXISTS (SELECT 1 FROM espionage_captivities captivity
                  WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=operation.merchant_character_id AND captivity.status='HELD')
         OR EXISTS (SELECT 1 FROM countries country
                     WHERE country.status='YOK_EDİLDİ' AND (country.id=operation.country_id OR country.id=operation.target_country_id))
       )
    ), cancelled AS (
      UPDATE merchant_operations operation SET status='CANCELLED',updated_at=NOW()
       WHERE operation.id IN(SELECT id FROM affected)
       RETURNING operation.merchant_character_id
    )
    UPDATE country_characters character
       SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
           assignment_ready_turn=NULL,unavailable_until_turn=NULL
     WHERE character.id IN(SELECT merchant_character_id FROM cancelled)
       AND character.character_status='ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM espionage_captivities captivity
                        WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD');

    WITH affected AS (
      SELECT operation.id,operation.diplomat_character_id AS character_id
        FROM diplomat_operations operation
       WHERE operation.status IN('TRAVELING','ACTIVE','PAUSED') AND (
         EXISTS (SELECT 1 FROM espionage_captivities captivity
                  WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=operation.diplomat_character_id AND captivity.status='HELD')
         OR EXISTS (SELECT 1 FROM countries country
                     WHERE country.status='YOK_EDİLDİ' AND (country.id=operation.country_id OR country.id=operation.target_country_id))
       )
    ), cancelled AS (
      UPDATE diplomat_operations operation
         SET status='CANCELLED',updated_at=NOW(),completion_text='Karakter veya devlet etkin olmadığı için görev sonlandırıldı.'
       WHERE operation.id IN(SELECT id FROM affected)
       RETURNING operation.diplomat_character_id
    )
    UPDATE country_characters character
       SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
           assignment_ready_turn=NULL,unavailable_until_turn=NULL
     WHERE character.id IN(SELECT diplomat_character_id FROM cancelled)
       AND character.character_status='ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM espionage_captivities captivity
                        WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD');

    WITH affected AS (
      SELECT operation.id,operation.missionary_character_id AS character_id
        FROM missionary_operations operation
       WHERE operation.status IN('TRAVELING','ACTIVE') AND (
         EXISTS (SELECT 1 FROM espionage_captivities captivity
                  WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=operation.missionary_character_id AND captivity.status='HELD')
         OR EXISTS (SELECT 1 FROM countries country WHERE country.id=operation.country_id AND country.status='YOK_EDİLDİ')
       )
    ), cancelled AS (
      UPDATE missionary_operations operation SET status='CANCELLED',updated_at=NOW()
       WHERE operation.id IN(SELECT id FROM affected)
       RETURNING operation.missionary_character_id
    )
    UPDATE country_characters character
       SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
           assignment_ready_turn=NULL,unavailable_until_turn=NULL
     WHERE character.id IN(SELECT missionary_character_id FROM cancelled)
       AND character.character_status='ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM espionage_captivities captivity
                        WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD');

    DELETE FROM settlement_assimilation_diplomats assignment
     WHERE EXISTS (SELECT 1 FROM country_characters character
                    WHERE character.id=assignment.character_id AND (
                      EXISTS (SELECT 1 FROM countries country WHERE country.id=character.country_id AND country.status='YOK_EDİLDİ')
                      OR EXISTS (SELECT 1 FROM espionage_captivities captivity
                                  WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD')
                    ));

    UPDATE academy_training_sessions session SET status='CANCELLED'
     WHERE session.status IN('PENDING_ROLL','AWAITING_NAME')
       AND EXISTS (SELECT 1 FROM countries country WHERE country.id=session.country_id AND country.status='YOK_EDİLDİ');

    UPDATE armies army SET commander_character_id=NULL,updated_at=NOW()
     WHERE EXISTS (SELECT 1 FROM country_characters character
                    WHERE character.id=army.commander_character_id AND (
                      EXISTS (SELECT 1 FROM countries country WHERE country.id=character.country_id AND country.status='YOK_EDİLDİ')
                      OR EXISTS (SELECT 1 FROM espionage_captivities captivity
                                  WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD')
                    ));
    UPDATE fleets fleet SET commander_character_id=NULL,updated_at=NOW()
     WHERE EXISTS (SELECT 1 FROM country_characters character
                    WHERE character.id=fleet.commander_character_id AND (
                      EXISTS (SELECT 1 FROM countries country WHERE country.id=character.country_id AND country.status='YOK_EDİLDİ')
                      OR EXISTS (SELECT 1 FROM espionage_captivities captivity
                                  WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD')
                    ));
    UPDATE battle_sides side SET chief_commander_character_id=NULL
     WHERE EXISTS (SELECT 1 FROM country_characters character
                    WHERE character.id=side.chief_commander_character_id AND (
                      EXISTS (SELECT 1 FROM countries country WHERE country.id=character.country_id AND country.status='YOK_EDİLDİ')
                      OR EXISTS (SELECT 1 FROM espionage_captivities captivity
                                  WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD')
                    ));
    UPDATE naval_blockades blockade SET admiral_character_id=NULL,admiral_specialization_level=0
     WHERE blockade.status='ACTIVE' AND EXISTS (SELECT 1 FROM country_characters character
       WHERE character.id=blockade.admiral_character_id AND (
         EXISTS (SELECT 1 FROM countries country WHERE country.id=character.country_id AND country.status='YOK_EDİLDİ')
         OR EXISTS (SELECT 1 FROM espionage_captivities captivity
                     WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD')
       ));
    UPDATE naval_raids raid SET admiral_character_id=NULL,admiral_specialization_level=0
     WHERE raid.status='WAITING_ROLL' AND EXISTS (SELECT 1 FROM country_characters character
       WHERE character.id=raid.admiral_character_id AND (
         EXISTS (SELECT 1 FROM countries country WHERE country.id=character.country_id AND country.status='YOK_EDİLDİ')
         OR EXISTS (SELECT 1 FROM espionage_captivities captivity
                     WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD')
       ));

    UPDATE country_characters guard
       SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
           assignment_ready_turn=NULL,unavailable_until_turn=NULL
     WHERE guard.character_status='ACTIVE' AND guard.protected_character_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM country_characters protected
        WHERE protected.id=guard.protected_character_id AND (
          EXISTS (SELECT 1 FROM countries country WHERE country.id=protected.country_id AND country.status='YOK_EDİLDİ')
          OR EXISTS (SELECT 1 FROM espionage_captivities captivity
                      WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=protected.id AND captivity.status='HELD')
        )
     );

    UPDATE country_vassalages relation
       SET status='ENDED',ended_turn=(SELECT guild.current_turn FROM guilds guild WHERE guild.discord_id=relation.guild_id),
           ended_by='SYSTEM_MIGRATION',ended_at=NOW()
     WHERE relation.status='ACTIVE' AND EXISTS (
       SELECT 1 FROM countries country
        WHERE country.status='YOK_EDİLDİ'
          AND country.id IN(relation.overlord_country_id,relation.vassal_country_id)
     );

    UPDATE country_characters character
       SET character_status='DISMISSED',dismissed_at=COALESCE(character.dismissed_at,NOW()),
           dismissed_by=COALESCE(character.dismissed_by,'SYSTEM_MIGRATION'),assignment='NONE',
           assigned_settlement_id=NULL,protected_character_id=NULL,assignment_ready_turn=NULL,
           unavailable_until_turn=NULL,is_marshal=FALSE
     WHERE character.character_status='ACTIVE'
       AND EXISTS (SELECT 1 FROM countries country WHERE country.id=character.country_id AND country.status='YOK_EDİLDİ');

    UPDATE country_characters character SET is_marshal=FALSE
     WHERE character.is_marshal=TRUE AND EXISTS (
       SELECT 1 FROM espionage_captivities captivity
        WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD'
     );
  `
} as const;
