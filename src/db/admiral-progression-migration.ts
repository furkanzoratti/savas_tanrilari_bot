export const admiralProgressionMigration = {
  version: 84,
  name: "admiral_doctrines_specializations_and_naval_victories",
  sql: `
    ALTER TABLE country_characters
      ADD COLUMN IF NOT EXISTS admiral_doctrine TEXT,
      ADD COLUMN IF NOT EXISTS admiral_specialization TEXT,
      ADD COLUMN IF NOT EXISTS admiral_victories INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS admiral_specialization_level INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_admiral_doctrine_check;
    ALTER TABLE country_characters ADD CONSTRAINT country_characters_admiral_doctrine_check
      CHECK (admiral_doctrine IS NULL OR admiral_doctrine IN (
        'CLOSED_BATTLE_LINE','FLEXIBLE_FLEET','ORDERLY_WITHDRAWAL','BOARDING_ORDER','COMBINED_FLEET'
      ));

    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_admiral_specialization_check;
    ALTER TABLE country_characters ADD CONSTRAINT country_characters_admiral_specialization_check
      CHECK (admiral_specialization IS NULL OR admiral_specialization IN (
        'SEA_RAIDER','LINE_ADMIRAL','FLEET_GUARDIAN','BLOCKADE_EXPERT'
      ));

    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_admiral_victories_check;
    ALTER TABLE country_characters ADD CONSTRAINT country_characters_admiral_victories_check
      CHECK (admiral_victories BETWEEN 0 AND 9);

    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_admiral_specialization_level_check;
    ALTER TABLE country_characters ADD CONSTRAINT country_characters_admiral_specialization_level_check
      CHECK (admiral_specialization_level BETWEEN 0 AND 3);

    WITH naval_victories AS (
      SELECT victory.commander_character_id AS character_id,LEAST(9,COUNT(*))::integer AS victories
        FROM commander_battle_victories victory
        JOIN battles battle ON battle.id=victory.battle_id
       WHERE battle.terrain='NAVAL'
       GROUP BY victory.commander_character_id
    )
    UPDATE country_characters character
       SET admiral_victories=naval.victories,
           admiral_specialization_level=CASE
             WHEN character.admiral_specialization IS NULL THEN 0
             WHEN naval.victories>=9 THEN 3
             WHEN naval.victories>=6 THEN 2
             WHEN naval.victories>=3 THEN 1 ELSE 0 END
      FROM naval_victories naval
     WHERE character.id=naval.character_id AND character.is_admiral=TRUE;
  `
} as const;
