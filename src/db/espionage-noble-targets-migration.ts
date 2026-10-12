export const espionageNobleTargetsMigration={
  version:187,
  name:"espionage_noble_targets_and_family_guards",
  sql:`
    ALTER TABLE espionage_operations
      ADD COLUMN IF NOT EXISTS target_noble_type TEXT,
      ADD COLUMN IF NOT EXISTS target_noble_id UUID,
      ADD COLUMN IF NOT EXISTS target_noble_family_id UUID;
    ALTER TABLE espionage_operations DROP CONSTRAINT IF EXISTS espionage_operations_target_noble_type_check;
    ALTER TABLE espionage_operations ADD CONSTRAINT espionage_operations_target_noble_type_check
      CHECK(target_noble_type IS NULL OR target_noble_type IN ('DYNASTY','ROMAN_FAMILY'));
    CREATE INDEX IF NOT EXISTS espionage_target_noble_idx
      ON espionage_operations(target_noble_type,target_noble_id,status);

    ALTER TABLE country_characters
      ADD COLUMN IF NOT EXISTS protected_noble_type TEXT,
      ADD COLUMN IF NOT EXISTS protected_noble_id UUID,
      ADD COLUMN IF NOT EXISTS protected_family_type TEXT,
      ADD COLUMN IF NOT EXISTS protected_family_id UUID;
    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_protected_noble_type_check;
    ALTER TABLE country_characters ADD CONSTRAINT country_characters_protected_noble_type_check
      CHECK(protected_noble_type IS NULL OR protected_noble_type IN ('DYNASTY','ROMAN_FAMILY'));
    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_protected_family_type_check;
    ALTER TABLE country_characters ADD CONSTRAINT country_characters_protected_family_type_check
      CHECK(protected_family_type IS NULL OR protected_family_type IN ('DYNASTY','ROMAN_FAMILY'));
  `
} as const;
