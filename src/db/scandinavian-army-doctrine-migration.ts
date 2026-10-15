export const scandinavianArmyDoctrineMigration = {
  version: 204,
  name: "scandinavian_army_doctrine",
  sql: `
    ALTER TABLE countries
      ADD COLUMN IF NOT EXISTS is_scandinavian_state BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE countries
       SET is_scandinavian_state=(
         lower(name) IN (
           lower('Kimbriler'),lower('Kimbri Krallığı'),
           lower('Hedinler'),lower('Hedin Krallığı'),lower('Chaedinler'),
           lower('Gautlar'),lower('Gaut Krallığı'),
           lower('Suionlar'),lower('Suion Krallığı')
         )
         OR primary_culture_group IN ('CIMBRIC','CHAEDINIAN','GAUT_SUIONIC')
       );

    ALTER TABLE country_special_unit_unlocks
      DROP CONSTRAINT IF EXISTS country_special_unit_unlocks_unit_type_check;
    ALTER TABLE country_special_unit_unlocks
      ADD CONSTRAINT country_special_unit_unlocks_unit_type_check
      CHECK (unit_type IN (
        'legionary','hoplite','horse_archer','steppe_horse_archer','steppe_cavalry',
        'kurgan_shieldbearer','oba_archer','scandinavian_berserker','scandinavian_spearmen',
        'scandinavian_hunters','camel_cavalry','briton_longbow','persian_immortal',
        'carthaginian_war_elephant','iberian_caetrati','germanic_shock_warrior',
        'anatolian_thureophoroi','triarii_veteran','punic_veteran','gaesatae','peltast',
        'silver_shield','machimoi_phalangitai','mauryan_war_elephant','desert_raider',
        'egyptian_war_chariot','germanic_companion_cavalry','balearic_slinger',
        'sarmatian_longswordsmen','briton_noble_spearmen'
      ));
  `
} as const;
