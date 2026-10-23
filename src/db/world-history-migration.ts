export const worldHistoryMigration={
  version:226,
  name:"automatic_world_history",
  sql:`
    ALTER TABLE guilds ADD COLUMN IF NOT EXISTS history_channel_id TEXT;

    CREATE TABLE IF NOT EXISTS world_history_events(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK(game_turn>=0),
      event_type TEXT NOT NULL,
      source_key TEXT NOT NULL,
      summary TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      chronicle_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,source_key)
    );
    CREATE INDEX IF NOT EXISTS world_history_events_pending_idx
      ON world_history_events(guild_id,game_turn,created_at) WHERE chronicle_id IS NULL;

    CREATE TABLE IF NOT EXISTS world_history_chronicles(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK(game_turn>=0),
      entries JSONB NOT NULL DEFAULT '[]'::jsonb,
      channel_id TEXT,
      message_id TEXT,
      posted_at TIMESTAMPTZ,
      publishing_started_at TIMESTAMPTZ,
      publish_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,game_turn)
    );
    ALTER TABLE world_history_events
      ADD CONSTRAINT world_history_events_chronicle_fk
      FOREIGN KEY(chronicle_id) REFERENCES world_history_chronicles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS world_history_chronicles_pending_idx
      ON world_history_chronicles(guild_id,game_turn) WHERE posted_at IS NULL;

    CREATE OR REPLACE FUNCTION record_world_history_event(
      target_guild_id TEXT,target_turn INTEGER,target_type TEXT,target_source_key TEXT,
      target_summary TEXT,target_details JSONB DEFAULT '{}'::jsonb
    ) RETURNS VOID LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO world_history_events(guild_id,game_turn,event_type,source_key,summary,details)
      VALUES(target_guild_id,GREATEST(0,target_turn),target_type,target_source_key,target_summary,COALESCE(target_details,'{}'::jsonb))
      ON CONFLICT(guild_id,source_key) DO NOTHING;
    END $$;

    CREATE OR REPLACE FUNCTION history_from_occupation()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE settlement_name TEXT; occupier_name TEXT;
    BEGIN
      SELECT name INTO settlement_name FROM settlements WHERE id=NEW.settlement_id;
      SELECT name INTO occupier_name FROM countries WHERE id=NEW.occupier_country_id;
      PERFORM record_world_history_event(NEW.guild_id,NEW.started_turn,'OCCUPATION','occupation:'||NEW.id,
        settlement_name||', '||occupier_name||' kuvvetleri tarafından işgal edildi.',
        jsonb_build_object('settlementId',NEW.settlement_id,'countryId',NEW.occupier_country_id));
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS world_history_occupation ON settlement_occupations;
    CREATE TRIGGER world_history_occupation AFTER INSERT ON settlement_occupations
      FOR EACH ROW EXECUTE FUNCTION history_from_occupation();

    CREATE OR REPLACE FUNCTION history_from_state_war()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE attacker_name TEXT; defender_name TEXT; winner_name TEXT;
    BEGIN
      SELECT name INTO attacker_name FROM countries WHERE id=NEW.attacker_country_id;
      SELECT name INTO defender_name FROM countries WHERE id=NEW.defender_country_id;
      IF TG_OP='INSERT' THEN
        PERFORM record_world_history_event(NEW.guild_id,NEW.started_turn,'WAR_DECLARED','war-start:'||NEW.id,
          attacker_name||', '||defender_name||' devletine savaş ilan etti.',jsonb_build_object('warId',NEW.id));
      ELSIF OLD.status='ACTIVE' AND NEW.status='ENDED' THEN
        SELECT name INTO winner_name FROM countries WHERE id=NEW.winner_country_id;
        PERFORM record_world_history_event(NEW.guild_id,COALESCE(NEW.ended_turn,NEW.started_turn),'WAR_ENDED','war-end:'||NEW.id,
          CASE WHEN winner_name IS NULL
            THEN attacker_name||' ile '||defender_name||' arasındaki savaş sona erdi.'
            ELSE attacker_name||' ile '||defender_name||' arasındaki savaşı '||winner_name||' kazandı.' END,
          jsonb_build_object('warId',NEW.id,'winnerCountryId',NEW.winner_country_id));
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS world_history_state_war_insert ON state_wars;
    DROP TRIGGER IF EXISTS world_history_state_war_end ON state_wars;
    CREATE TRIGGER world_history_state_war_insert AFTER INSERT ON state_wars
      FOR EACH ROW EXECUTE FUNCTION history_from_state_war();
    CREATE TRIGGER world_history_state_war_end AFTER UPDATE OF status ON state_wars
      FOR EACH ROW EXECUTE FUNCTION history_from_state_war();

    CREATE OR REPLACE FUNCTION history_from_ownership_transfer()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE settlement_name TEXT; country_name TEXT;
    BEGIN
      IF NEW.change_type='LEGACY_INITIAL' THEN RETURN NEW; END IF;
      SELECT name INTO settlement_name FROM settlements WHERE id=NEW.settlement_id;
      SELECT name INTO country_name FROM countries WHERE id=NEW.new_country_id;
      PERFORM record_world_history_event(NEW.guild_id,NEW.acquired_turn,'SETTLEMENT_TRANSFER','transfer:'||NEW.id,
        settlement_name||', '||country_name||' yönetimine geçti.',jsonb_build_object('changeType',NEW.change_type));
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS world_history_ownership_transfer ON settlement_ownership_history;
    CREATE TRIGGER world_history_ownership_transfer AFTER INSERT ON settlement_ownership_history
      FOR EACH ROW EXECUTE FUNCTION history_from_ownership_transfer();

    CREATE OR REPLACE FUNCTION history_from_death_publication()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE country_name TEXT;
    BEGIN
      IF NOT (NEW.was_monarch OR COALESCE(NEW.subject_role,'') ILIKE ANY(ARRAY['%veliaht%','%varis%','%mareşal%','%amiral%','%konsül%'])) THEN
        RETURN NEW;
      END IF;
      SELECT name INTO country_name FROM countries WHERE id=NEW.country_id;
      PERFORM record_world_history_event(NEW.guild_id,NEW.game_turn,'IMPORTANT_DEATH','death:'||NEW.subject_type||':'||NEW.subject_id,
        CASE WHEN NEW.was_monarch AND country_name IS NOT NULL
          THEN country_name||' hükümdarı '||NEW.subject_name||' hayatını kaybetti.'
          ELSE NEW.subject_name||' hayatını kaybetti.' END,
        jsonb_build_object('subjectType',NEW.subject_type,'wasMonarch',NEW.was_monarch));
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS world_history_important_death ON death_publications;
    CREATE TRIGGER world_history_important_death AFTER INSERT ON death_publications
      FOR EACH ROW EXECUTE FUNCTION history_from_death_publication();

    CREATE OR REPLACE FUNCTION history_from_dynasty_event()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE country_name TEXT; member_name TEXT; spouse_name TEXT; source_key TEXT;
    BEGIN
      SELECT country.name INTO country_name FROM dynasties dynasty JOIN countries country ON country.id=dynasty.country_id
       WHERE dynasty.id=NEW.dynasty_id;
      IF NEW.event_type IN ('SUCCESSION','MONARCH_DESIGNATED') THEN
        IF EXISTS(SELECT 1 FROM dynasties WHERE id=NEW.dynasty_id AND steppe_title_id IS NOT NULL) THEN RETURN NEW; END IF;
        SELECT name INTO member_name FROM dynasty_members WHERE id=NEW.member_id;
        member_name:=COALESCE(member_name,NEW.details->>'name');
        IF member_name IS NULL THEN RETURN NEW; END IF;
        PERFORM record_world_history_event((SELECT guild_id FROM dynasties WHERE id=NEW.dynasty_id),NEW.game_turn,
          'SUCCESSION','succession:'||NEW.id,member_name||', '||country_name||' tahtına çıktı.',
          jsonb_build_object('dynastyId',NEW.dynasty_id,'memberId',NEW.member_id));
      ELSIF NEW.event_type='MARRIAGE' THEN
        member_name:=NEW.details->>'memberName'; spouse_name:=NEW.details->>'spouseName';
        IF member_name IS NULL OR spouse_name IS NULL THEN RETURN NEW; END IF;
        source_key:='marriage:'||NEW.game_turn||':'||md5(LEAST(member_name,spouse_name)||':'||GREATEST(member_name,spouse_name));
        PERFORM record_world_history_event((SELECT guild_id FROM dynasties WHERE id=NEW.dynasty_id),NEW.game_turn,
          'DYNASTY_MARRIAGE',source_key,member_name||' ile '||spouse_name||' evlendi.',
          jsonb_build_object('memberName',member_name,'spouseName',spouse_name));
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS world_history_dynasty_event ON dynasty_events;
    CREATE TRIGGER world_history_dynasty_event AFTER INSERT ON dynasty_events
      FOR EACH ROW EXECUTE FUNCTION history_from_dynasty_event();

    CREATE OR REPLACE FUNCTION history_from_rebellion()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE settlement_name TEXT; country_name TEXT;
    BEGIN
      IF NEW.status<>'ACTIVE' THEN RETURN NEW; END IF;
      SELECT name INTO settlement_name FROM settlements WHERE id=NEW.settlement_id;
      SELECT name INTO country_name FROM countries WHERE id=NEW.against_country_id;
      PERFORM record_world_history_event(NEW.guild_id,COALESCE(NEW.outbreak_turn,NEW.started_turn),'REBELLION','rebellion:'||NEW.id,
        settlement_name||' yerleşkesinde '||country_name||' yönetimine karşı isyan başladı.',
        jsonb_build_object('settlementId',NEW.settlement_id,'factionType',NEW.faction_type));
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS world_history_rebellion ON rebel_factions;
    CREATE TRIGGER world_history_rebellion AFTER INSERT ON rebel_factions
      FOR EACH ROW EXECUTE FUNCTION history_from_rebellion();

    CREATE OR REPLACE FUNCTION history_from_country_status()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE current_turn INTEGER;
    BEGIN
      SELECT guild.current_turn INTO current_turn FROM guilds guild WHERE guild.discord_id=NEW.guild_id;
      IF TG_OP='INSERT' THEN
        PERFORM record_world_history_event(NEW.guild_id,current_turn,'COUNTRY_FOUNDED','country-founded:'||NEW.id,
          NEW.name||' devleti kuruldu.',jsonb_build_object('countryId',NEW.id));
        RETURN NEW;
      END IF;
      IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
      PERFORM record_world_history_event(NEW.guild_id,current_turn,'COUNTRY_STATUS','country-status:'||NEW.id||':'||NEW.status||':'||current_turn,
        CASE WHEN NEW.status='YOK_EDİLDİ' THEN NEW.name||' devleti yıkıldı.' ELSE NEW.name||' devleti yeniden kuruldu.' END,
        jsonb_build_object('countryId',NEW.id,'status',NEW.status));
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS world_history_country_status ON countries;
    DROP TRIGGER IF EXISTS world_history_country_founded ON countries;
    CREATE TRIGGER world_history_country_founded AFTER INSERT ON countries
      FOR EACH ROW EXECUTE FUNCTION history_from_country_status();
    CREATE TRIGGER world_history_country_status AFTER UPDATE OF status ON countries
      FOR EACH ROW EXECUTE FUNCTION history_from_country_status();

    CREATE OR REPLACE FUNCTION history_from_great_project()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE settlement_name TEXT;
    BEGIN
      IF OLD.status='BUILDING' AND NEW.status='ACTIVE' THEN
        SELECT name INTO settlement_name FROM settlements WHERE id=NEW.settlement_id;
        PERFORM record_world_history_event(NEW.guild_id,COALESCE(NEW.completed_turn,NEW.completion_turn),'GREAT_PROJECT','great-project:'||NEW.id,
          settlement_name||' yerleşkesindeki büyük proje tamamlandı.',
          jsonb_build_object('projectKey',NEW.project_key,'settlementName',settlement_name));
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS world_history_great_project ON settlement_great_projects;
    CREATE TRIGGER world_history_great_project AFTER UPDATE OF status ON settlement_great_projects
      FOR EACH ROW EXECUTE FUNCTION history_from_great_project();
  `
} as const;
