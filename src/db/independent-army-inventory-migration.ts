export const independentArmyInventoryMigration={
  version:76,
  name:"independent_field_army_inventory",
  sql:`
    ALTER TABLE army_units ADD COLUMN IF NOT EXISTS origin_settlement_name TEXT;
    UPDATE army_units unit SET origin_settlement_name=settlement.name
      FROM settlements settlement
     WHERE settlement.id=unit.settlement_id AND unit.origin_settlement_name IS NULL;
    ALTER TABLE army_units ALTER COLUMN origin_settlement_name SET NOT NULL;

    ALTER TABLE recruitment_orders ADD COLUMN IF NOT EXISTS population_reserved BOOLEAN;
    UPDATE recruitment_orders SET population_reserved=FALSE WHERE population_reserved IS NULL;
    ALTER TABLE recruitment_orders ALTER COLUMN population_reserved SET DEFAULT TRUE;
    ALTER TABLE recruitment_orders ALTER COLUMN population_reserved SET NOT NULL;

    CREATE TEMP TABLE army_inventory_before ON COMMIT DROP AS
      SELECT settlement_id,unit_type,COALESCE(SUM(quantity),0)::bigint AS quantity
        FROM unit_stacks WHERE force_type='ARMY' GROUP BY settlement_id,unit_type;

    DO $$
    DECLARE allocation RECORD; stock RECORD; remaining INTEGER; deducted INTEGER;
    BEGIN
      FOR allocation IN
        SELECT settlement_id,unit_type,SUM(quantity)::integer AS quantity FROM (
          SELECT settlement_id,unit_type,quantity FROM army_units
          UNION ALL
          SELECT source_settlement_id AS settlement_id,unit_type,quantity FROM army_muster_orders
           WHERE status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY')
        ) detached GROUP BY settlement_id,unit_type ORDER BY settlement_id,unit_type
      LOOP
        remaining:=allocation.quantity;
        FOR stock IN
          SELECT id,quantity FROM unit_stacks
           WHERE settlement_id=allocation.settlement_id AND unit_type=allocation.unit_type AND force_type='ARMY'
           ORDER BY CASE status WHEN 'FIELD_HOSTILE' THEN 0 WHEN 'FIELD_FRIENDLY' THEN 1 ELSE 2 END,id
           FOR UPDATE
        LOOP
          EXIT WHEN remaining<=0;
          deducted:=LEAST(stock.quantity,remaining);
          IF stock.quantity=deducted THEN
            DELETE FROM unit_stacks WHERE id=stock.id;
          ELSE
            UPDATE unit_stacks SET quantity=quantity-deducted WHERE id=stock.id;
          END IF;
          remaining:=remaining-deducted;
        END LOOP;
        IF remaining>0 THEN
          RAISE EXCEPTION 'Ordu envanteri dönüşümü başarısız: yerleşke %, birlik %, eksik %',
            allocation.settlement_id,allocation.unit_type,remaining;
        END IF;
      END LOOP;
    END $$;

    DO $$
    DECLARE mismatch_count INTEGER;
    BEGIN
      SELECT COUNT(*)::integer INTO mismatch_count
        FROM army_inventory_before before_row
        LEFT JOIN (
          SELECT settlement_id,unit_type,SUM(quantity)::bigint AS quantity
            FROM unit_stacks WHERE force_type='ARMY' GROUP BY settlement_id,unit_type
        ) local_row USING(settlement_id,unit_type)
        LEFT JOIN (
          SELECT settlement_id,unit_type,SUM(quantity)::bigint AS quantity FROM (
            SELECT settlement_id,unit_type,quantity FROM army_units
            UNION ALL
            SELECT source_settlement_id AS settlement_id,unit_type,quantity FROM army_muster_orders
             WHERE status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY')
          ) detached GROUP BY settlement_id,unit_type
        ) field_row USING(settlement_id,unit_type)
       WHERE before_row.quantity<>COALESCE(local_row.quantity,0)+COALESCE(field_row.quantity,0);
      IF mismatch_count>0 THEN
        RAISE EXCEPTION 'Ordu envanteri dönüşümü toplam kontrolünde % uyumsuz kayıt bulundu',mismatch_count;
      END IF;
    END $$;
  `
} as const;
