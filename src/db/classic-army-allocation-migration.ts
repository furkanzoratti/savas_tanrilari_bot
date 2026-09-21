export const classicArmyAllocationMigration={
  version:77,
  name:"restore_classic_army_allocations",
  sql:`
    INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
    SELECT settlement_id,unit_type,SUM(quantity)::integer,'GARRISON','ARMY'
      FROM army_units
     GROUP BY settlement_id,unit_type
    ON CONFLICT(settlement_id,unit_type,status,force_type)
    DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity;

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
        RAISE EXCEPTION 'Klasik ordu dönüşümü toplam kontrolünde % uyumsuz stok bulundu',mismatch_count;
      END IF;
    END $$;
  `
} as const;
