export const manualKerkourosRestorationMigration = {
  version: 92,
  name: "manual_kerkouros_restoration_carthage_egypt",
  sql: `
    WITH restoration(country_name,settlement_name,quantity) AS (
      VALUES
        ('Büyük Kartaca','Kartaca',1),
        ('Büyük Kartaca','Lilybaeum',2),
        ('Büyük Kartaca','Lepcis',1),
        ('Büyük Kartaca','Karalis',1),
        ('Büyük Kartaca','Ibossim',3),
        ('Büyük Kartaca','Thapsus',1),
        ('Mısır','Paraitonion',1),
        ('Mısır','Kudüs',1)
    )
    INSERT INTO naval_units(settlement_id,ship_type,quantity,status)
    SELECT settlement.id,'kerkouros',restoration.quantity,'RESERVE'
    FROM restoration
    JOIN countries country
      ON lower(country.name)=lower(restoration.country_name)
     AND country.status='ACTIVE'
    JOIN settlements settlement
      ON settlement.country_id=country.id
     AND lower(settlement.name)=lower(restoration.settlement_name)
    ON CONFLICT(settlement_id,ship_type,status)
    DO UPDATE SET quantity=naval_units.quantity+EXCLUDED.quantity;
  `
} as const;
