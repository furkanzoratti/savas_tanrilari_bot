export const academyCharacterAgingMigration={
  version:225,
  name:"academy_character_aging_and_mortality",
  sql:`
    ALTER TABLE country_characters
      ADD COLUMN IF NOT EXISTS age INTEGER,
      ADD COLUMN IF NOT EXISTS last_age_death_check_turn INTEGER;

    UPDATE country_characters character
       SET age=GREATEST(20,20+guild.current_turn-character.trained_turn)
      FROM countries country
      JOIN guilds guild ON guild.discord_id=country.guild_id
     WHERE country.id=character.country_id
       AND character.age IS NULL;

    ALTER TABLE country_characters ALTER COLUMN age SET DEFAULT 20;
    ALTER TABLE country_characters ALTER COLUMN age SET NOT NULL;
    ALTER TABLE country_characters DROP CONSTRAINT IF EXISTS country_characters_age_check;
    ALTER TABLE country_characters
      ADD CONSTRAINT country_characters_age_check CHECK(age>=20);

    CREATE INDEX IF NOT EXISTS country_characters_elderly_check_idx
      ON country_characters(country_id,age,last_age_death_check_turn)
      WHERE character_status='ACTIVE' AND age>60;

    CREATE OR REPLACE FUNCTION queue_academy_character_death_publication()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE
      target_guild_id TEXT;
      target_country_id UUID;
      target_settlement_id UUID;
      target_turn INTEGER;
      target_role TEXT;
    BEGIN
      IF OLD.character_status IS DISTINCT FROM 'DEAD' AND NEW.character_status='DEAD' THEN
        SELECT country.guild_id,country.id,guild.current_turn,
               COALESCE(
                 NEW.trained_settlement_id,
                 NEW.death_settlement_id,
                 OLD.assigned_settlement_id,
                 country.capital_settlement_id,
                 (SELECT settlement.id FROM settlements settlement
                   WHERE settlement.country_id=country.id
                   ORDER BY settlement.population DESC,settlement.name,settlement.id LIMIT 1)
               )
          INTO target_guild_id,target_country_id,target_turn,target_settlement_id
          FROM countries country
          JOIN guilds guild ON guild.discord_id=country.guild_id
         WHERE country.id=NEW.country_id;

        target_role:=CASE
          WHEN COALESCE(NEW.is_marshal,FALSE) THEN 'Mareşal'
          WHEN NEW.role='COMMANDER' THEN 'Komutan'
          WHEN NEW.role='SPY' THEN 'Casus'
          WHEN NEW.role='MERCHANT' THEN 'Tüccar'
          WHEN NEW.role='DIPLOMAT' THEN 'Diplomat'
          WHEN NEW.role='MISSIONARY' THEN 'Misyoner'
          ELSE NEW.role
        END;

        IF target_guild_id IS NOT NULL THEN
          INSERT INTO death_publications(
            guild_id,country_id,settlement_id,subject_type,subject_id,subject_name,
            subject_role,subject_age,death_reason,game_turn
          ) VALUES(
            target_guild_id,target_country_id,target_settlement_id,'ACADEMY_CHARACTER',NEW.id,NEW.name,
            target_role,NEW.age,NEW.death_reason,target_turn
          ) ON CONFLICT(subject_type,subject_id) DO NOTHING;
        END IF;
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS academy_character_death_publication_trigger ON country_characters;
    CREATE TRIGGER academy_character_death_publication_trigger
      AFTER UPDATE OF character_status ON country_characters
      FOR EACH ROW EXECUTE FUNCTION queue_academy_character_death_publication();
  `
} as const;
