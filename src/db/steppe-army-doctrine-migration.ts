export const steppeArmyDoctrineMigration = {
  version: 171,
  name: "steppe_army_doctrine_and_special_units",
  sql: `
    ALTER TABLE country_special_unit_unlocks
      DROP CONSTRAINT IF EXISTS country_special_unit_unlocks_unit_type_check;
    ALTER TABLE country_special_unit_unlocks
      ADD CONSTRAINT country_special_unit_unlocks_unit_type_check
      CHECK (unit_type IN (
        'legionary','hoplite','horse_archer','steppe_cavalry','kurgan_shieldbearer','oba_archer',
        'camel_cavalry','briton_longbow','persian_immortal','carthaginian_war_elephant',
        'iberian_caetrati','germanic_shock_warrior','anatolian_thureophoroi','triarii_veteran',
        'punic_veteran','gaesatae','peltast','silver_shield','machimoi_phalangitai',
        'mauryan_war_elephant','desert_raider','egyptian_war_chariot',
        'germanic_companion_cavalry','balearic_slinger','sarmatian_longswordsmen',
        'briton_noble_spearmen'
      ));

    INSERT INTO country_special_unit_unlocks(country_id,unit_type,granted_by)
    SELECT confederation.country_id,unit.unit_type,'SYSTEM'
      FROM steppe_confederations confederation
      CROSS JOIN (VALUES
        ('horse_archer'),('steppe_cavalry'),('kurgan_shieldbearer'),('oba_archer')
      ) AS unit(unit_type)
     WHERE confederation.status='ACTIVE'
    ON CONFLICT(country_id,unit_type) DO NOTHING;
  `
} as const;
