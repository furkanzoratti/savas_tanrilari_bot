export const rebelOccupationOutcomeMigration={
  version:147,
  name:"rebel_siege_victory_occupation_backfill",
  sql:`
    WITH victorious_occupations AS (
      SELECT DISTINCT ON (faction.id)
             faction.id AS faction_id,battle.id AS battle_id,battle.defender_settlement_id,
             guild.current_turn
        FROM battles battle
        JOIN battle_sides winner ON winner.battle_id=battle.id AND winner.side_key=battle.winner_side
        JOIN rebel_factions faction ON faction.id=winner.rebel_faction_id
        JOIN guilds guild ON guild.discord_id=battle.guild_id
       WHERE battle.terrain='SIEGE' AND battle.status='FINISHED'
         AND battle.winner_side IS NOT NULL AND battle.defender_settlement_id=faction.settlement_id
         AND faction.status IN ('ORGANIZING','ACTIVE','OCCUPYING')
       ORDER BY faction.id,battle.updated_at DESC,battle.id
    )
    UPDATE rebel_factions faction
       SET status='OCCUPYING',
           occupied_turn=COALESCE(faction.occupied_turn,victory.current_turn),
           cause_snapshot=COALESCE(faction.cause_snapshot,'{}'::jsonb)||jsonb_build_object(
             'occupationBattleId',victory.battle_id::text,
             'occupiedSettlementId',victory.defender_settlement_id::text,
             'occupationBackfilled',TRUE
           ),
           updated_at=NOW()
      FROM victorious_occupations victory
     WHERE faction.id=victory.faction_id;

    UPDATE settlements settlement
       SET rebellion_active=TRUE,unrest_active=TRUE,prosperity=0
     WHERE EXISTS (
       SELECT 1 FROM rebel_factions faction
        WHERE faction.settlement_id=settlement.id AND faction.status='OCCUPYING'
     );
  `
} as const;
