export const academyCapacityAdmiralsMigration = {
  version: 82,
  name: "academy_capacity_admirals_and_dismissal",
  sql: `
    ALTER TABLE country_characters
      ADD COLUMN IF NOT EXISTS is_admiral BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS dismissed_by TEXT;

    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_status_check;
    ALTER TABLE country_characters
      ADD CONSTRAINT country_characters_status_check
      CHECK (character_status IN ('ACTIVE','DEAD','DISMISSED'));

    UPDATE country_characters character
       SET is_admiral=TRUE
      FROM fleets fleet
     WHERE fleet.commander_character_id=character.id
       AND character.role='COMMANDER';
  `
} as const;
