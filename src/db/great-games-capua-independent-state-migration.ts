export const greatGamesCapuaIndependentStateMigration={
  version:130,
  name:"capua_independent_concurrent_game_state",
  sql:`
    UPDATE great_games_seasons season
       SET status='OPEN',current_game=NULL,current_round=0,updated_at=NOW()
     WHERE season.current_game='GLADIATOR'
       AND EXISTS (
         SELECT 1 FROM great_games_gladiator_tournaments tournament
          WHERE tournament.season_id=season.id
            AND tournament.status IN ('BETTING','FIGHTING')
       );
  `
} as const;
