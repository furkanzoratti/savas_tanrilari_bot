export const mountedArcherSeparationMigration = {
  version: 191,
  name: "normal_and_steppe_mounted_archer_separation",
  sql: `
    ALTER TABLE country_special_unit_unlocks
      DROP CONSTRAINT IF EXISTS country_special_unit_unlocks_unit_type_check;
    ALTER TABLE country_special_unit_unlocks
      ADD CONSTRAINT country_special_unit_unlocks_unit_type_check
      CHECK (unit_type IN (
        'legionary','hoplite','horse_archer','steppe_horse_archer','steppe_cavalry',
        'kurgan_shieldbearer','oba_archer','camel_cavalry','briton_longbow','persian_immortal',
        'carthaginian_war_elephant','iberian_caetrati','germanic_shock_warrior',
        'anatolian_thureophoroi','triarii_veteran','punic_veteran','gaesatae','peltast',
        'silver_shield','machimoi_phalangitai','mauryan_war_elephant','desert_raider',
        'egyptian_war_chariot','germanic_companion_cavalry','balearic_slinger',
        'sarmatian_longswordsmen','briton_noble_spearmen'
      ));

    INSERT INTO country_special_unit_unlocks(country_id,unit_type,granted_by)
    SELECT country.id,'steppe_horse_archer','SYSTEM'
      FROM countries country
     WHERE country.is_steppe_state=TRUE AND country.status='ACTIVE'
    ON CONFLICT(country_id,unit_type) DO NOTHING;

    DELETE FROM country_special_unit_unlocks unlock
     USING countries country
     WHERE unlock.country_id=country.id
       AND country.is_steppe_state=TRUE
       AND unlock.unit_type='horse_archer';

    UPDATE unit_stacks stack
       SET unit_type='steppe_horse_archer'
      FROM settlements settlement,countries country
     WHERE stack.settlement_id=settlement.id
       AND settlement.country_id=country.id
       AND country.is_steppe_state=TRUE
       AND stack.unit_type='horse_archer';

    UPDATE recruitment_orders recruitment
       SET unit_type='steppe_horse_archer'
      FROM countries country
     WHERE recruitment.country_id=country.id
       AND country.is_steppe_state=TRUE
       AND recruitment.unit_type='horse_archer';

    UPDATE army_units army_unit
       SET unit_type='steppe_horse_archer'
      FROM armies army,countries country
     WHERE army_unit.army_id=army.id
       AND army.country_id=country.id
       AND country.is_steppe_state=TRUE
       AND army_unit.unit_type='horse_archer';

    UPDATE army_muster_orders muster
       SET unit_type='steppe_horse_archer'
      FROM countries country
     WHERE muster.country_id=country.id
       AND country.is_steppe_state=TRUE
       AND muster.unit_type='horse_archer';
  `
} as const;
