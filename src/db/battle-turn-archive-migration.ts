export const battleTurnArchiveMigration={
  version:235,
  name:"battle_turn_archive",
  sql:`
    ALTER TABLE battles
      ADD COLUMN IF NOT EXISTS started_turn INTEGER,
      ADD COLUMN IF NOT EXISTS ended_turn INTEGER;

    WITH inferred AS (
      SELECT battle.id,
             COALESCE(
               (SELECT (log.details->>'to')::integer
                  FROM audit_logs log
                 WHERE log.guild_id=battle.guild_id AND log.action='TURN_ADVANCE'
                   AND log.created_at<=battle.created_at AND log.details->>'to'~'^[0-9]+$'
                 ORDER BY log.created_at DESC LIMIT 1),
               (SELECT (log.details->>'from')::integer
                  FROM audit_logs log
                 WHERE log.guild_id=battle.guild_id AND log.action='TURN_ADVANCE'
                   AND log.details->>'from'~'^[0-9]+$'
                 ORDER BY log.created_at LIMIT 1),
               (SELECT MIN(event.game_turn) FROM state_war_score_events event WHERE event.battle_id=battle.id),
               (SELECT MIN(bombardment.game_turn) FROM battle_bombardments bombardment WHERE bombardment.battle_id=battle.id),
               guild.current_turn
             ) AS started_turn,
             CASE WHEN battle.status IN ('FINISHED','CANCELLED') THEN COALESCE(
               (SELECT MAX(event.game_turn) FROM state_war_score_events event WHERE event.battle_id=battle.id),
               (SELECT MAX(victory.victory_turn) FROM commander_battle_victories victory WHERE victory.battle_id=battle.id),
               (SELECT MAX(bombardment.game_turn) FROM battle_bombardments bombardment WHERE bombardment.battle_id=battle.id),
               (SELECT (log.details->>'to')::integer
                  FROM audit_logs log
                 WHERE log.guild_id=battle.guild_id AND log.action='TURN_ADVANCE'
                   AND log.created_at<=battle.updated_at AND log.details->>'to'~'^[0-9]+$'
                 ORDER BY log.created_at DESC LIMIT 1),
               guild.current_turn
             ) ELSE NULL END AS ended_turn
        FROM battles battle
        JOIN guilds guild ON guild.discord_id=battle.guild_id
    )
    UPDATE battles battle
       SET started_turn=COALESCE(battle.started_turn,inferred.started_turn),
           ended_turn=COALESCE(battle.ended_turn,inferred.ended_turn)
      FROM inferred WHERE inferred.id=battle.id;

    UPDATE battles SET started_turn=GREATEST(0,COALESCE(started_turn,0));
    UPDATE battles
       SET ended_turn=GREATEST(started_turn,COALESCE(ended_turn,started_turn))
     WHERE status IN ('FINISHED','CANCELLED');
    UPDATE battles SET ended_turn=NULL WHERE status NOT IN ('FINISHED','CANCELLED');

    ALTER TABLE battles ALTER COLUMN started_turn SET NOT NULL;
    ALTER TABLE battles
      ADD CONSTRAINT battles_started_turn_check CHECK(started_turn>=0),
      ADD CONSTRAINT battles_ended_turn_check CHECK(ended_turn IS NULL OR ended_turn>=started_turn);
    CREATE INDEX IF NOT EXISTS battles_turn_archive_idx
      ON battles(guild_id,ended_turn DESC,created_at DESC)
      WHERE status IN ('FINISHED','CANCELLED');

    CREATE OR REPLACE FUNCTION stamp_battle_turns()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE live_turn INTEGER;
    BEGIN
      SELECT current_turn INTO live_turn FROM guilds WHERE discord_id=NEW.guild_id;
      IF TG_OP='INSERT' THEN
        NEW.started_turn:=COALESCE(NEW.started_turn,live_turn,0);
      END IF;
      IF NEW.status IN ('FINISHED','CANCELLED')
         AND (TG_OP='INSERT' OR OLD.status NOT IN ('FINISHED','CANCELLED')) THEN
        NEW.ended_turn:=COALESCE(NEW.ended_turn,live_turn,NEW.started_turn,0);
      ELSIF NEW.status NOT IN ('FINISHED','CANCELLED') THEN
        NEW.ended_turn:=NULL;
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS battles_turn_stamp ON battles;
    CREATE TRIGGER battles_turn_stamp
      BEFORE INSERT OR UPDATE OF status ON battles
      FOR EACH ROW EXECUTE FUNCTION stamp_battle_turns();
  `
}as const;
