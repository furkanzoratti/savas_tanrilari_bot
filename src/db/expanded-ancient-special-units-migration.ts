export const expandedAncientSpecialUnitsMigration = {
  version: 89,
  name: "expanded_ancient_special_units",
  sql: `
    ALTER TABLE country_special_unit_unlocks
      DROP CONSTRAINT IF EXISTS country_special_unit_unlocks_unit_type_check;
    ALTER TABLE country_special_unit_unlocks
      ADD CONSTRAINT country_special_unit_unlocks_unit_type_check
      CHECK (unit_type IN (
        'legionary','hoplite','horse_archer','camel_cavalry','briton_longbow',
        'persian_immortal','carthaginian_war_elephant','iberian_caetrati',
        'germanic_shock_warrior','anatolian_thureophoroi','triarii_veteran',
        'punic_veteran','gaesatae','peltast','silver_shield','machimoi_phalangitai',
        'mauryan_war_elephant','desert_raider','egyptian_war_chariot'
      ));
  `
} as const;
