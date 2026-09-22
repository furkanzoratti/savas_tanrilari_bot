export const characterSpecializationChoiceMigration = {
  version: 80,
  name: "character_specialization_choices",
  sql: `
    ALTER TABLE country_characters
      ADD COLUMN IF NOT EXISTS specialization_choice_credit INTEGER NOT NULL DEFAULT 0
      CHECK (specialization_choice_credit >= 0);

    CREATE TABLE IF NOT EXISTS character_specialization_progress (
      character_id UUID NOT NULL REFERENCES country_characters(id) ON DELETE CASCADE,
      specialization TEXT NOT NULL,
      successes INTEGER NOT NULL DEFAULT 0 CHECK (successes >= 0),
      PRIMARY KEY(character_id,specialization)
    );

    INSERT INTO character_specialization_progress(character_id,specialization,successes)
    SELECT character_id,specialization,successes
      FROM spy_specialization_progress
    ON CONFLICT(character_id,specialization) DO UPDATE
      SET successes=GREATEST(character_specialization_progress.successes,EXCLUDED.successes);

    INSERT INTO character_specialization_progress(character_id,specialization,successes)
    SELECT id,specialization,specialization_progress
      FROM country_characters
     WHERE specialization IS NOT NULL AND role<>'COMMANDER'
    ON CONFLICT(character_id,specialization) DO UPDATE
      SET successes=GREATEST(character_specialization_progress.successes,EXCLUDED.successes);

    UPDATE country_characters
       SET specialization_choice_credit=specialization_progress
     WHERE role IN ('MERCHANT','DIPLOMAT','SPY')
       AND specialization IS NULL
       AND specialization_progress>0
       AND specialization_choice_credit=0;
  `
} as const;
