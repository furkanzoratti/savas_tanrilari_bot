export const navalDamageAllocationReconciliationMigration = {
  version: 122,
  name: "naval_damage_allocation_reconciliation",
  sql: `
    WITH required_allocations AS (
      SELECT fleet_id,settlement_id,ship_type,COUNT(*)::integer AS quantity
        FROM naval_ship_damage
       WHERE fleet_id IS NOT NULL
         AND status IN ('DAMAGED','DISABLED')
       GROUP BY fleet_id,settlement_id,ship_type
    )
    INSERT INTO fleet_ships(fleet_id,settlement_id,ship_type,quantity)
    SELECT fleet_id,settlement_id,ship_type,quantity
      FROM required_allocations
    ON CONFLICT(fleet_id,settlement_id,ship_type)
    DO UPDATE SET quantity=GREATEST(fleet_ships.quantity,EXCLUDED.quantity);

    WITH fleet_required AS (
      SELECT settlement_id,ship_type,SUM(quantity)::integer AS quantity
        FROM fleet_ships
       GROUP BY settlement_id,ship_type
    ),
    repair_required AS (
      SELECT settlement_id,ship_type,COUNT(*)::integer AS quantity
        FROM naval_ship_damage
       WHERE status IN ('REPAIRING','READY')
       GROUP BY settlement_id,ship_type
    ),
    required_stock AS (
      SELECT settlement_id,ship_type,SUM(quantity)::integer AS quantity
        FROM (
          SELECT settlement_id,ship_type,quantity FROM fleet_required
          UNION ALL
          SELECT settlement_id,ship_type,quantity FROM repair_required
        ) requirements
       GROUP BY settlement_id,ship_type
    ),
    current_stock AS (
      SELECT settlement_id,ship_type,SUM(quantity)::integer AS quantity
        FROM naval_units
       GROUP BY settlement_id,ship_type
    ),
    missing_stock AS (
      SELECT required.settlement_id,required.ship_type,
             GREATEST(0,required.quantity-COALESCE(current.quantity,0))::integer AS quantity
        FROM required_stock required
        LEFT JOIN current_stock current
          ON current.settlement_id=required.settlement_id
         AND current.ship_type=required.ship_type
    )
    INSERT INTO naval_units(settlement_id,ship_type,quantity,status)
    SELECT settlement_id,ship_type,quantity,'RESERVE'
      FROM missing_stock
     WHERE quantity>0
    ON CONFLICT(settlement_id,ship_type,status)
    DO UPDATE SET quantity=naval_units.quantity+EXCLUDED.quantity;
  `
} as const;
