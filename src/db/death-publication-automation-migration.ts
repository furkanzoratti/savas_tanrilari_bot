export const deathPublicationAutomationMigration = {
  version: 215,
  name: "death_publication_automation",
  sql: `
    ALTER TABLE country_characters
      ADD COLUMN IF NOT EXISTS death_reason TEXT;

    CREATE TABLE IF NOT EXISTS death_publications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
      settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      subject_type TEXT NOT NULL CHECK(subject_type IN ('ACADEMY_CHARACTER','DYNASTY_MEMBER','ROMAN_FAMILY_MEMBER')),
      subject_id UUID NOT NULL,
      subject_name TEXT NOT NULL,
      subject_role TEXT,
      subject_lineage TEXT,
      subject_gender TEXT CHECK(subject_gender IS NULL OR subject_gender IN ('MALE','FEMALE')),
      subject_age INTEGER,
      was_monarch BOOLEAN NOT NULL DEFAULT FALSE,
      death_reason TEXT,
      game_turn INTEGER NOT NULL CHECK(game_turn>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      public_posted_at TIMESTAMPTZ,
      publish_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      UNIQUE(subject_type,subject_id)
    );

    CREATE INDEX IF NOT EXISTS death_publications_pending_idx
      ON death_publications(guild_id,game_turn,created_at)
      WHERE public_posted_at IS NULL;

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
                 NEW.death_settlement_id,
                 OLD.assigned_settlement_id,
                 NEW.trained_settlement_id,
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
            subject_role,death_reason,game_turn
          ) VALUES(
            target_guild_id,target_country_id,target_settlement_id,'ACADEMY_CHARACTER',NEW.id,NEW.name,
            target_role,NEW.death_reason,target_turn
          ) ON CONFLICT(subject_type,subject_id) DO NOTHING;
        END IF;
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS academy_character_death_publication_trigger ON country_characters;
    CREATE TRIGGER academy_character_death_publication_trigger
      AFTER UPDATE OF character_status ON country_characters
      FOR EACH ROW EXECUTE FUNCTION queue_academy_character_death_publication();

    CREATE OR REPLACE FUNCTION queue_dynasty_member_death_publication()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE
      target_guild_id TEXT;
      target_country_id UUID;
      target_settlement_id UUID;
      target_turn INTEGER;
      target_lineage TEXT;
    BEGIN
      IF OLD.status IS DISTINCT FROM 'DEAD' AND NEW.status='DEAD' THEN
        SELECT dynasty.guild_id,dynasty.country_id,dynasty.name,
               COALESCE(NEW.died_turn,guild.current_turn),
               COALESCE(
                 country.capital_settlement_id,
                 (SELECT settlement.id FROM settlements settlement
                   WHERE settlement.country_id=country.id
                   ORDER BY settlement.population DESC,settlement.name,settlement.id LIMIT 1)
               )
          INTO target_guild_id,target_country_id,target_lineage,target_turn,target_settlement_id
          FROM dynasties dynasty
          JOIN countries country ON country.id=dynasty.country_id
          JOIN guilds guild ON guild.discord_id=dynasty.guild_id
         WHERE dynasty.id=NEW.dynasty_id;

        IF target_guild_id IS NOT NULL THEN
          INSERT INTO death_publications(
            guild_id,country_id,settlement_id,subject_type,subject_id,subject_name,
            subject_role,subject_lineage,subject_gender,subject_age,was_monarch,death_reason,game_turn
          ) VALUES(
            target_guild_id,target_country_id,target_settlement_id,'DYNASTY_MEMBER',NEW.id,NEW.name,
            NEW.title,target_lineage,NEW.gender,NEW.age,OLD.is_monarch,NEW.death_reason,target_turn
          ) ON CONFLICT(subject_type,subject_id) DO NOTHING;
        END IF;
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS dynasty_member_death_publication_trigger ON dynasty_members;
    CREATE TRIGGER dynasty_member_death_publication_trigger
      AFTER UPDATE OF status ON dynasty_members
      FOR EACH ROW EXECUTE FUNCTION queue_dynasty_member_death_publication();

    CREATE OR REPLACE FUNCTION queue_roman_family_member_death_publication()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE
      target_guild_id TEXT;
      target_country_id UUID;
      target_settlement_id UUID;
      target_turn INTEGER;
      target_lineage TEXT;
    BEGIN
      IF OLD.status IS DISTINCT FROM 'DEAD' AND NEW.status='DEAD' THEN
        SELECT republic.guild_id,republic.country_id,family.name,
               COALESCE(NEW.died_turn,guild.current_turn),
               COALESCE(
                 country.capital_settlement_id,
                 (SELECT settlement.id FROM settlements settlement
                   WHERE settlement.country_id=country.id
                   ORDER BY settlement.population DESC,settlement.name,settlement.id LIMIT 1)
               )
          INTO target_guild_id,target_country_id,target_lineage,target_turn,target_settlement_id
          FROM roman_families family
          JOIN roman_republics republic ON republic.id=family.republic_id
          JOIN countries country ON country.id=republic.country_id
          JOIN guilds guild ON guild.discord_id=republic.guild_id
         WHERE family.id=NEW.family_id;

        IF target_guild_id IS NOT NULL THEN
          INSERT INTO death_publications(
            guild_id,country_id,settlement_id,subject_type,subject_id,subject_name,
            subject_role,subject_lineage,subject_gender,subject_age,was_monarch,death_reason,game_turn
          ) VALUES(
            target_guild_id,target_country_id,target_settlement_id,'ROMAN_FAMILY_MEMBER',NEW.id,NEW.name,
            NEW.relation,target_lineage,NEW.gender,NEW.age,FALSE,NEW.death_reason,target_turn
          ) ON CONFLICT(subject_type,subject_id) DO NOTHING;
        END IF;
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS roman_family_member_death_publication_trigger ON roman_family_members;
    CREATE TRIGGER roman_family_member_death_publication_trigger
      AFTER UPDATE OF status ON roman_family_members
      FOR EACH ROW EXECUTE FUNCTION queue_roman_family_member_death_publication();
  `
} as const;
