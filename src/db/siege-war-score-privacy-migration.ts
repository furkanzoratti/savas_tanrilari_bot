export const siegeWarScorePrivacyMigration={
  version:229,
  name:"siege_battle_score_minimum_defenders",
  sql:`
    DELETE FROM state_war_score_events score
      USING battles battle,battle_sides defender
     WHERE score.battle_id=battle.id
       AND score.event_type='BATTLE'
       AND battle.terrain='SIEGE'
       AND defender.battle_id=battle.id
       AND defender.side_key='B'
       AND defender.initial_total<5000;

    ALTER TABLE state_wars ALTER COLUMN war_score_model_version SET DEFAULT 3;
    UPDATE state_wars
       SET war_score_model_version=LEAST(war_score_model_version,2)
     WHERE status='ACTIVE';
  `
} as const;
