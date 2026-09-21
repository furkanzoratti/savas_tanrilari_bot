export const classicArmyMusterMigration={
  version:78,
  name:"complete_legacy_army_musters",
  sql:`
    CREATE TEMP TABLE classic_muster_restore ON COMMIT DROP AS
      SELECT muster.id,muster.guild_id,muster.country_id,muster.army_id,
             muster.source_settlement_id,muster.unit_type,muster.quantity,
             muster.issued_by,muster.is_returning,settlement.name AS settlement_name
        FROM army_muster_orders muster
        JOIN settlements settlement ON settlement.id=muster.source_settlement_id
       WHERE muster.status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY');

    INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
    SELECT source_settlement_id,unit_type,SUM(quantity)::integer,'GARRISON','ARMY'
      FROM classic_muster_restore
     GROUP BY source_settlement_id,unit_type
    ON CONFLICT(settlement_id,unit_type,status,force_type)
    DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity;

    INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity)
    SELECT army_id,source_settlement_id,settlement_name,unit_type,SUM(quantity)::integer
      FROM classic_muster_restore
     WHERE is_returning=FALSE
     GROUP BY army_id,source_settlement_id,settlement_name,unit_type
    ON CONFLICT(army_id,settlement_id,unit_type)
    DO UPDATE SET quantity=army_units.quantity+EXCLUDED.quantity;

    UPDATE army_muster_orders muster
       SET status=CASE WHEN restored.is_returning THEN 'CANCELLED' ELSE 'COMPLETED' END,
           blocked_reason='Klasik ordu tahsis düzenine dönüş sırasında çözüldü.',
           updated_at=NOW()
      FROM classic_muster_restore restored
     WHERE muster.id=restored.id;

    INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
    SELECT guild_id,issued_by,'army.muster.classic_restore','army',army_id,
           jsonb_build_object(
             'orderId',id,
             'settlementId',source_settlement_id,
             'unitType',unit_type,
             'quantity',quantity,
             'returning',is_returning
           )
      FROM classic_muster_restore;

    CREATE TEMP TABLE classic_discharge_restore ON COMMIT DROP AS
      SELECT (log.details->>'originSettlementId')::uuid AS origin_settlement_id,
             (log.details->>'destinationSettlementId')::uuid AS destination_settlement_id,
             log.details->>'unitType' AS unit_type,
             SUM((log.details->>'quantity')::integer)::integer AS quantity
        FROM audit_logs log
        CROSS JOIN (
          SELECT
            (SELECT applied_at FROM schema_migrations WHERE version=76) AS started_at,
            (SELECT applied_at FROM schema_migrations WHERE version=77) AS ended_at
        ) bounds
       WHERE log.action='army.units.remove'
         AND log.created_at>=bounds.started_at
         AND log.created_at<bounds.ended_at
         AND log.details ? 'originSettlementId'
         AND log.details ? 'destinationSettlementId'
         AND log.details ? 'unitType'
         AND log.details ? 'quantity'
         AND log.details->>'originSettlementId'<>log.details->>'destinationSettlementId'
       GROUP BY (log.details->>'originSettlementId')::uuid,
                (log.details->>'destinationSettlementId')::uuid,
                log.details->>'unitType';

    DO $$
    DECLARE correction RECORD; destination_quantity INTEGER;
    BEGIN
      FOR correction IN SELECT * FROM classic_discharge_restore
      LOOP
        SELECT quantity INTO destination_quantity
          FROM unit_stacks
         WHERE settlement_id=correction.destination_settlement_id
           AND unit_type=correction.unit_type
           AND status='GARRISON' AND force_type='ARMY'
         FOR UPDATE;
        IF destination_quantity IS NULL OR destination_quantity<correction.quantity THEN
          RAISE EXCEPTION 'Yanlış yerleşkeye iade düzeltmesi başarısız: hedef %, birlik %, gereken %, bulunan %',
            correction.destination_settlement_id,correction.unit_type,correction.quantity,
            COALESCE(destination_quantity,0);
        END IF;

        UPDATE unit_stacks SET quantity=quantity-correction.quantity
         WHERE settlement_id=correction.destination_settlement_id
           AND unit_type=correction.unit_type
           AND status='GARRISON' AND force_type='ARMY';
        DELETE FROM unit_stacks
         WHERE settlement_id=correction.destination_settlement_id
           AND unit_type=correction.unit_type
           AND status='GARRISON' AND force_type='ARMY' AND quantity=0;

        INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
        VALUES(correction.origin_settlement_id,correction.unit_type,correction.quantity,'GARRISON','ARMY')
        ON CONFLICT(settlement_id,unit_type,status,force_type)
        DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity;
      END LOOP;
    END $$;

    INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
    SELECT country.guild_id,'SYSTEM','army.units.classic_restore','settlement',
           correction.origin_settlement_id,
           jsonb_build_object(
             'originSettlementId',correction.origin_settlement_id,
             'destinationSettlementId',correction.destination_settlement_id,
             'unitType',correction.unit_type,
             'quantity',correction.quantity
           )
      FROM classic_discharge_restore correction
      JOIN settlements origin ON origin.id=correction.origin_settlement_id
      JOIN countries country ON country.id=origin.country_id;

    DO $$
    DECLARE mismatch_count INTEGER;
    BEGIN
      SELECT COUNT(*)::integer INTO mismatch_count
        FROM (
          SELECT unit.settlement_id,unit.unit_type,SUM(unit.quantity)::bigint AS allocated,
                 COALESCE(stock.quantity,0)::bigint AS stocked
            FROM army_units unit
            LEFT JOIN (
              SELECT settlement_id,unit_type,SUM(quantity)::bigint AS quantity
                FROM unit_stacks
               WHERE force_type='ARMY'
               GROUP BY settlement_id,unit_type
            ) stock USING(settlement_id,unit_type)
           GROUP BY unit.settlement_id,unit.unit_type,stock.quantity
          HAVING SUM(unit.quantity)>COALESCE(stock.quantity,0)
        ) invalid;
      IF mismatch_count>0 THEN
        RAISE EXCEPTION 'Eski intikal emirleri dönüşümünde % uyumsuz stok bulundu',mismatch_count;
      END IF;
    END $$;
  `
} as const;
