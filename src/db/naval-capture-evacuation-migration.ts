export const navalCaptureEvacuationMigration={
  version:176,
  name:"naval_capture_evacuation_repair",
  sql:`
    -- Eski devirlerden kalan, artık başka bir devlete ait limana bağlı filo
    -- tahsislerini filonun devletindeki en güçlü faal limana taşı.
    WITH stale AS (
      SELECT allocation.fleet_id,allocation.settlement_id AS origin_settlement_id,
             allocation.ship_type,allocation.quantity,destination.id AS destination_settlement_id
        FROM fleet_ships allocation
        JOIN fleets fleet ON fleet.id=allocation.fleet_id
        JOIN settlements origin ON origin.id=allocation.settlement_id
        JOIN LATERAL (
          SELECT settlement.id
            FROM settlements settlement
            JOIN buildings port ON port.settlement_id=settlement.id
             AND port.building_type='port' AND port.status='ACTIVE' AND port.level>0
            LEFT JOIN buildings shipyard ON shipyard.settlement_id=settlement.id
             AND shipyard.building_type='shipyard' AND shipyard.status='ACTIVE' AND shipyard.level>0
           WHERE settlement.country_id=fleet.country_id AND settlement.is_coastal=TRUE
           ORDER BY COALESCE(shipyard.level,0) DESC,port.level DESC,settlement.name,settlement.id
           LIMIT 1
        ) destination ON TRUE
       WHERE origin.country_id<>fleet.country_id
    )
    INSERT INTO fleet_ships(fleet_id,settlement_id,ship_type,quantity)
    SELECT fleet_id,destination_settlement_id,ship_type,SUM(quantity)::integer
      FROM stale GROUP BY fleet_id,destination_settlement_id,ship_type
    ON CONFLICT(fleet_id,settlement_id,ship_type)
    DO UPDATE SET quantity=fleet_ships.quantity+EXCLUDED.quantity;

    DELETE FROM fleet_ships allocation
     USING fleets fleet,settlements origin
     WHERE fleet.id=allocation.fleet_id AND origin.id=allocation.settlement_id
       AND origin.country_id<>fleet.country_id;

    WITH relocations AS (
      SELECT damage.id,
             (SELECT settlement.id
                FROM settlements settlement
                JOIN buildings port ON port.settlement_id=settlement.id
                 AND port.building_type='port' AND port.status='ACTIVE' AND port.level>0
                LEFT JOIN buildings shipyard ON shipyard.settlement_id=settlement.id
                 AND shipyard.building_type='shipyard' AND shipyard.status='ACTIVE' AND shipyard.level>0
               WHERE settlement.country_id=damage.country_id AND settlement.is_coastal=TRUE
               ORDER BY COALESCE(shipyard.level,0) DESC,port.level DESC,settlement.name,settlement.id
               LIMIT 1) AS destination_settlement_id
        FROM naval_ship_damage damage
        JOIN settlements origin ON origin.id=damage.settlement_id
       WHERE origin.country_id<>damage.country_id
    )
    UPDATE naval_ship_damage damage
       SET settlement_id=relocations.destination_settlement_id,updated_at=NOW()
      FROM relocations
     WHERE damage.id=relocations.id AND relocations.destination_settlement_id IS NOT NULL;

    -- Liman, tamir başladıktan sonra el değiştirmişse tamiri bitmiş sayma.
    -- Gemiyi mevcut canıyla kaynak filosuna döndür; yukarıdaki hasar taşıması
    -- yalnızca geminin kayıtlı limanı da sahibinden çıktıysa devreye girer.
    WITH cancelled_repair_ships AS (
      SELECT repair.id AS repair_group_id,repair.source_fleet_id,
             damage.settlement_id,damage.ship_type,COUNT(*)::integer AS quantity
        FROM fleet_repair_groups repair
        JOIN naval_ship_damage damage ON damage.repair_group_id=repair.id
       WHERE repair.status IN ('REPAIRING','READY') AND repair.source_fleet_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM settlement_ownership_history history
            WHERE history.settlement_id=repair.repair_settlement_id
              AND history.new_country_id=(SELECT country_id FROM settlements WHERE id=repair.repair_settlement_id)
              AND history.acquired_turn>=repair.started_turn
         )
       GROUP BY repair.id,repair.source_fleet_id,damage.settlement_id,damage.ship_type
    )
    INSERT INTO fleet_ships(fleet_id,settlement_id,ship_type,quantity)
    SELECT source_fleet_id,settlement_id,ship_type,quantity FROM cancelled_repair_ships
    ON CONFLICT(fleet_id,settlement_id,ship_type)
    DO UPDATE SET quantity=fleet_ships.quantity+EXCLUDED.quantity;

    DELETE FROM naval_ship_damage damage
     USING fleet_repair_groups repair
     WHERE damage.repair_group_id=repair.id AND damage.current_hp>=damage.max_hp
       AND repair.status IN ('REPAIRING','READY')
       AND EXISTS (
         SELECT 1 FROM settlement_ownership_history history
          WHERE history.settlement_id=repair.repair_settlement_id
            AND history.new_country_id=(SELECT country_id FROM settlements WHERE id=repair.repair_settlement_id)
            AND history.acquired_turn>=repair.started_turn
       );

    UPDATE naval_ship_damage damage
       SET fleet_id=repair.source_fleet_id,repair_group_id=NULL,
           status=CASE
             WHEN damage.current_hp>CASE damage.ship_type WHEN 'kerkouros' THEN 10 WHEN 'trireme' THEN 20 ELSE 30 END
             THEN 'DAMAGED' ELSE 'DISABLED' END,
           updated_at=NOW()
      FROM fleet_repair_groups repair
     WHERE damage.repair_group_id=repair.id AND repair.status IN ('REPAIRING','READY')
       AND EXISTS (
         SELECT 1 FROM settlement_ownership_history history
          WHERE history.settlement_id=repair.repair_settlement_id
            AND history.new_country_id=(SELECT country_id FROM settlements WHERE id=repair.repair_settlement_id)
            AND history.acquired_turn>=repair.started_turn
       );

    UPDATE fleet_repair_groups repair
       SET status='TRANSFERRED',transferred_at=NOW()
     WHERE repair.status IN ('REPAIRING','READY')
       AND EXISTS (
         SELECT 1 FROM settlement_ownership_history history
          WHERE history.settlement_id=repair.repair_settlement_id
            AND history.new_country_id=(SELECT country_id FROM settlements WHERE id=repair.repair_settlement_id)
            AND history.acquired_turn>=repair.started_turn
       );

    -- Tahsisler toplam stokun alt kümesidir. Eski kod stok satırını silmişse,
    -- taşınan tahsisleri görünür ve kullanılabilir tutacak eksik stoğu tamamla.
    WITH required AS (
      SELECT settlement_id,ship_type,SUM(quantity)::integer AS quantity
        FROM fleet_ships GROUP BY settlement_id,ship_type
    ), current_stock AS (
      SELECT settlement_id,ship_type,SUM(quantity)::integer AS quantity
        FROM naval_units GROUP BY settlement_id,ship_type
    ), missing AS (
      SELECT required.settlement_id,required.ship_type,
             GREATEST(0,required.quantity-COALESCE(current_stock.quantity,0))::integer AS quantity
        FROM required LEFT JOIN current_stock
          ON current_stock.settlement_id=required.settlement_id
         AND current_stock.ship_type=required.ship_type
    )
    INSERT INTO naval_units(settlement_id,ship_type,quantity,status)
    SELECT settlement_id,ship_type,quantity,'RESERVE' FROM missing WHERE quantity>0
    ON CONFLICT(settlement_id,ship_type,status)
    DO UPDATE SET quantity=naval_units.quantity+EXCLUDED.quantity;
  `
} as const;
