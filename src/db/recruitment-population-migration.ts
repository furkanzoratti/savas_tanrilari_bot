export const recruitmentPopulationMigration = {
  version: 79,
  name: "stop_reserving_population_for_recruitment",
  sql: `
    WITH pending_recruitment_refunds AS (
      SELECT settlement_id,COALESCE(SUM(remaining_quantity),0)::bigint AS amount
        FROM recruitment_orders
       WHERE status='TRAINING' AND remaining_quantity>0
       GROUP BY settlement_id
    )
    UPDATE settlements settlement
       SET population=settlement.population+refund.amount
      FROM pending_recruitment_refunds refund
     WHERE settlement.id=refund.settlement_id;

    UPDATE recruitment_orders
       SET population_reserved=FALSE
     WHERE status='TRAINING';
    ALTER TABLE recruitment_orders
      ALTER COLUMN population_reserved SET DEFAULT FALSE;

    WITH pending_garrison_refunds AS (
      SELECT settlement_id,COALESCE(SUM(personnel_reserved),0)::bigint AS amount
        FROM garrison_replenishment_orders
       WHERE status='BUILDING' AND personnel_reserved>0
       GROUP BY settlement_id
    )
    UPDATE settlements settlement
       SET population=settlement.population+refund.amount
      FROM pending_garrison_refunds refund
     WHERE settlement.id=refund.settlement_id;
  `
} as const;
