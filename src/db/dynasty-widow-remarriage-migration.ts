export const dynastyWidowRemarriageMigration={
  version:201,
  name:"dynasty_widow_remarriage_cleanup",
  sql:`
    CREATE OR REPLACE FUNCTION clear_dynasty_marriage_for_death()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE death_turn INTEGER;
    BEGIN
      IF OLD.status='ALIVE' AND NEW.status='DEAD' THEN
        SELECT guild.current_turn INTO death_turn
          FROM dynasties dynasty
          JOIN guilds guild ON guild.discord_id=dynasty.guild_id
         WHERE dynasty.id=NEW.dynasty_id;

        IF OLD.spouse_id IS NOT NULL THEN
          UPDATE dynasty_members
             SET spouse_id=NULL,updated_at=NOW()
           WHERE id=OLD.spouse_id AND spouse_id=NEW.id;
        END IF;

        UPDATE dynasty_marriage_proposals
           SET status='CANCELLED',resolved_turn=COALESCE(death_turn,created_turn),
               resolved_by='system:death',resolved_at=NOW()
         WHERE status='PENDING'
           AND (proposer_member_id=NEW.id OR target_member_id=NEW.id);

        NEW.spouse_id:=NULL;
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS dynasty_marriage_death_cleanup_trigger ON dynasty_members;
    CREATE TRIGGER dynasty_marriage_death_cleanup_trigger
      BEFORE UPDATE OF status ON dynasty_members
      FOR EACH ROW EXECUTE FUNCTION clear_dynasty_marriage_for_death();

    CREATE OR REPLACE FUNCTION clear_roman_family_marriage_for_death()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE death_turn INTEGER;
    BEGIN
      IF OLD.status='ALIVE' AND NEW.status='DEAD' THEN
        SELECT guild.current_turn INTO death_turn
          FROM roman_families family
          JOIN roman_republics republic ON republic.id=family.republic_id
          JOIN guilds guild ON guild.discord_id=republic.guild_id
         WHERE family.id=NEW.family_id;

        IF OLD.spouse_id IS NOT NULL THEN
          UPDATE roman_family_members
             SET spouse_id=NULL,updated_at=NOW()
           WHERE id=OLD.spouse_id AND spouse_id=NEW.id;
        END IF;

        UPDATE roman_family_marriage_proposals
           SET status='CANCELLED',resolved_turn=COALESCE(death_turn,created_turn),
               resolved_by='system:death',resolved_at=NOW()
         WHERE status='PENDING'
           AND (proposer_member_id=NEW.id OR target_member_id=NEW.id);

        NEW.spouse_id:=NULL;
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS roman_family_marriage_death_cleanup_trigger ON roman_family_members;
    CREATE TRIGGER roman_family_marriage_death_cleanup_trigger
      BEFORE UPDATE OF status ON roman_family_members
      FOR EACH ROW EXECUTE FUNCTION clear_roman_family_marriage_for_death();

    UPDATE dynasty_members survivor
       SET spouse_id=NULL,updated_at=NOW()
      FROM dynasty_members deceased
     WHERE survivor.spouse_id=deceased.id
       AND survivor.status='ALIVE'
       AND deceased.status='DEAD';

    UPDATE roman_family_members survivor
       SET spouse_id=NULL,updated_at=NOW()
      FROM roman_family_members deceased
     WHERE survivor.spouse_id=deceased.id
       AND survivor.status='ALIVE'
       AND deceased.status='DEAD';
  `
} as const;
