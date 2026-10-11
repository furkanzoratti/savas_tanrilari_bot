export const steppeTributeLedgerMigration={
  version:186,
  name:"steppe_tribute_treasury_ledger",
  sql:`
    ALTER TABLE steppe_tribute_offers
      ADD COLUMN IF NOT EXISTS acquisition_income BIGINT,
      ADD COLUMN IF NOT EXISTS treasury_before BIGINT,
      ADD COLUMN IF NOT EXISTS treasury_after BIGINT;

    ALTER TABLE steppe_tribute_offers
      DROP CONSTRAINT IF EXISTS steppe_tribute_offers_treasury_before_check,
      DROP CONSTRAINT IF EXISTS steppe_tribute_offers_treasury_after_check;
    ALTER TABLE steppe_tribute_offers
      ADD CONSTRAINT steppe_tribute_offers_treasury_before_check
        CHECK (treasury_before IS NULL OR treasury_before>=0),
      ADD CONSTRAINT steppe_tribute_offers_treasury_after_check
        CHECK (treasury_after IS NULL OR treasury_after>=0);

    UPDATE steppe_tribute_offers offer
       SET acquisition_income=COALESCE((
         SELECT transaction.amount
           FROM transactions transaction
          WHERE transaction.country_id=offer.tributary_country_id
            AND transaction.kind='ACQUISITION_TURN'
            AND transaction.turn<=offer.turn
          ORDER BY transaction.turn DESC,transaction.created_at DESC,transaction.id DESC
          LIMIT 1
       ),0)
     WHERE offer.acquisition_income IS NULL;

    ALTER TABLE steppe_tribute_offers
      ALTER COLUMN acquisition_income SET DEFAULT 0,
      ALTER COLUMN acquisition_income SET NOT NULL;

    WITH paid_snapshots AS (
      SELECT offer.id,COALESCE(offer.paid_amount,0)::bigint AS paid_amount,
             GREATEST(0,current_balance.total-COALESCE((
               SELECT SUM(later.amount)
                 FROM transactions later
                WHERE later.country_id=offer.tributary_country_id
                  AND (later.created_at,later.id)>(payment.created_at,payment.id)
             ),0))::bigint AS reconstructed_after
        FROM steppe_tribute_offers offer
        JOIN LATERAL (
          SELECT transaction.id,transaction.created_at
            FROM transactions transaction
           WHERE transaction.country_id=offer.tributary_country_id
             AND transaction.kind='STEPPE_TRIBUTE_OUT'
             AND transaction.details->>'offerId'=offer.id::text
           ORDER BY transaction.created_at,transaction.id LIMIT 1
        ) payment ON TRUE
        JOIN LATERAL (
          SELECT CASE WHEN EXISTS(SELECT 1 FROM settlements WHERE country_id=offer.tributary_country_id)
            THEN COALESCE((SELECT SUM(local_treasury) FROM settlements WHERE country_id=offer.tributary_country_id),0)
            ELSE COALESCE((SELECT treasury FROM countries WHERE id=offer.tributary_country_id),0)
          END::bigint AS total
        ) current_balance ON TRUE
       WHERE offer.response IN ('FULL','HALF')
         AND offer.treasury_before IS NULL
    )
    UPDATE steppe_tribute_offers offer
       SET treasury_after=snapshot.reconstructed_after,
           treasury_before=snapshot.reconstructed_after+snapshot.paid_amount
      FROM paid_snapshots snapshot
     WHERE offer.id=snapshot.id;

    WITH zero_payment_snapshots AS (
      SELECT offer.id,
             GREATEST(0,current_balance.total-COALESCE((
               SELECT SUM(later.amount)
                 FROM transactions later
                WHERE later.country_id=offer.tributary_country_id
                  AND later.created_at>offer.responded_at
             ),0))::bigint AS reconstructed_balance
        FROM steppe_tribute_offers offer
        JOIN LATERAL (
          SELECT CASE WHEN EXISTS(SELECT 1 FROM settlements WHERE country_id=offer.tributary_country_id)
            THEN COALESCE((SELECT SUM(local_treasury) FROM settlements WHERE country_id=offer.tributary_country_id),0)
            ELSE COALESCE((SELECT treasury FROM countries WHERE id=offer.tributary_country_id),0)
          END::bigint AS total
        ) current_balance ON TRUE
       WHERE offer.response IN ('FULL','HALF','NONE')
         AND COALESCE(offer.paid_amount,0)=0
         AND offer.responded_at IS NOT NULL
         AND offer.treasury_before IS NULL
    )
    UPDATE steppe_tribute_offers offer
       SET treasury_before=snapshot.reconstructed_balance,
           treasury_after=snapshot.reconstructed_balance
      FROM zero_payment_snapshots snapshot
     WHERE offer.id=snapshot.id;
  `
} as const;
