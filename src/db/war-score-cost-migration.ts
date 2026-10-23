export const warScoreCostMigration={
  version:227,
  name:"dynamic_war_score_and_peace_costs",
  sql:`
    ALTER TABLE state_wars
      ADD COLUMN IF NOT EXISTS war_score_model_version SMALLINT NOT NULL DEFAULT 1;
    ALTER TABLE state_wars ALTER COLUMN war_score_model_version SET DEFAULT 2;

    ALTER TABLE settlement_occupations
      ADD COLUMN IF NOT EXISTS occupation_score_points INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE settlement_occupations DROP CONSTRAINT IF EXISTS settlement_occupations_score_check;
    ALTER TABLE settlement_occupations ADD CONSTRAINT settlement_occupations_score_check
      CHECK(occupation_score_points BETWEEN 0 AND 100);

    ALTER TABLE peace_offer_terms
      ADD COLUMN IF NOT EXISTS war_score_cost BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE peace_offer_terms ALTER COLUMN war_score_cost TYPE BIGINT USING war_score_cost::bigint;
    ALTER TABLE peace_offers
      ADD COLUMN IF NOT EXISTS total_war_score_cost BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE peace_offers ALTER COLUMN total_war_score_cost TYPE BIGINT USING total_war_score_cost::bigint;

    WITH battle_values AS (
      SELECT score.id,
        LEAST(15,
          CASE
            WHEN winner.initial_total+loser.initial_total<2000 THEN 1
            WHEN winner.initial_total+loser.initial_total<5000 THEN 2
            WHEN winner.initial_total+loser.initial_total<10000 THEN 3
            WHEN winner.initial_total+loser.initial_total<20000 THEN 4
            WHEN winner.initial_total+loser.initial_total<40000 THEN 6
            WHEN winner.initial_total+loser.initial_total<75000 THEN 8
            WHEN winner.initial_total+loser.initial_total<150000 THEN 10
            ELSE 12 END
          +CASE
            WHEN loser.total_losses::numeric/NULLIF(loser.initial_total,0)-winner.total_losses::numeric/NULLIF(winner.initial_total,0)>=0.60 THEN 3
            WHEN loser.total_losses::numeric/NULLIF(loser.initial_total,0)-winner.total_losses::numeric/NULLIF(winner.initial_total,0)>=0.35 THEN 2
            WHEN loser.total_losses::numeric/NULLIF(loser.initial_total,0)-winner.total_losses::numeric/NULLIF(winner.initial_total,0)>=0.15 THEN 1
            ELSE 0 END
          +CASE WHEN loser.current_total<=0 THEN 2 ELSE 0 END
        )::integer AS points
      FROM state_war_score_events score
      JOIN battles battle ON battle.id=score.battle_id
      JOIN battle_sides winner ON winner.battle_id=battle.id AND winner.side_key=battle.winner_side
      JOIN battle_sides loser ON loser.battle_id=battle.id AND loser.side_key<>battle.winner_side
      WHERE score.event_type='BATTLE' AND winner.initial_total>0 AND loser.initial_total>0
    )
    UPDATE state_war_score_events score SET points=battle_values.points
      FROM battle_values WHERE score.id=battle_values.id;

    CREATE INDEX IF NOT EXISTS state_wars_score_model_idx
      ON state_wars(guild_id,status,war_score_model_version) WHERE status='ACTIVE';
  `
} as const;
