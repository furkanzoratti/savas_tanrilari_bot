export const navalBlockadeWarScoreMigration={
  version:230,
  name:"naval_blockade_war_score",
  sql:`
    ALTER TABLE state_war_score_events
      DROP CONSTRAINT IF EXISTS state_war_score_events_event_type_check;
    ALTER TABLE state_war_score_events
      ADD CONSTRAINT state_war_score_events_event_type_check CHECK(event_type IN (
        'BATTLE','OCCUPATION','TARGET_OCCUPATION','CAPITAL_OCCUPATION','BLOCKADE','GM_ADJUSTMENT'
      ));

    INSERT INTO state_war_score_events(
      war_id,side,event_type,points,game_turn,settlement_id,source_key,details
    )
    SELECT matched.war_id,matched.side,'BLOCKADE',2,blockade.started_turn,
           blockade.target_settlement_id,
           'blockade:'||matched.war_id::text||':'||blockade.target_settlement_id::text,
           jsonb_build_object(
             'blockadeId',blockade.id,
             'blockaderCountryId',blockade.blockader_country_id,
             'targetCountryId',blockade.target_country_id
           )
      FROM naval_blockades blockade
      JOIN LATERAL (
        SELECT war.id AS war_id,blockader.side
          FROM state_wars war
          JOIN state_war_participants blockader
            ON blockader.war_id=war.id AND blockader.country_id=blockade.blockader_country_id
          JOIN state_war_participants target
            ON target.war_id=war.id AND target.country_id=blockade.target_country_id
           AND target.side<>blockader.side
         WHERE war.status='ACTIVE'
         ORDER BY war.created_at DESC
         LIMIT 1
      ) matched ON TRUE
     WHERE blockade.status='ACTIVE'
    ON CONFLICT(source_key) DO NOTHING;

    UPDATE state_wars SET war_score_model_version=0 WHERE status='ACTIVE';
    ALTER TABLE state_wars ALTER COLUMN war_score_model_version SET DEFAULT 5;
  `
} as const;
