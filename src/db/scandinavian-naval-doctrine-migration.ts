export const scandinavianNavalDoctrineMigration = {
  version: 205,
  name: "scandinavian_naval_doctrine",
  sql: `
    UPDATE countries
       SET is_scandinavian_state=TRUE
     WHERE lower(name) IN (
       lower('Svege Krallığı'),lower('Kimbri Krallığı'),
       lower('Hedin Krallığı'),lower('Gaut Krallığı')
     );

    ALTER TABLE fleet_ships
      DROP CONSTRAINT IF EXISTS fleet_ships_ship_type_check;
    ALTER TABLE fleet_ships
      ADD CONSTRAINT fleet_ships_ship_type_check
      CHECK (ship_type IN ('kerkouros','hjortspring','trireme','quinquereme'));

    ALTER TABLE naval_ship_damage
      DROP CONSTRAINT IF EXISTS naval_ship_damage_ship_type_check;
    ALTER TABLE naval_ship_damage
      ADD CONSTRAINT naval_ship_damage_ship_type_check
      CHECK (ship_type IN ('kerkouros','hjortspring','trireme','quinquereme'));

    ALTER TABLE battle_ship_hulls
      DROP CONSTRAINT IF EXISTS battle_ship_hulls_ship_type_check;
    ALTER TABLE battle_ship_hulls
      ADD CONSTRAINT battle_ship_hulls_ship_type_check
      CHECK (ship_type IN ('kerkouros','hjortspring','trireme','quinquereme'));
  `
} as const;
