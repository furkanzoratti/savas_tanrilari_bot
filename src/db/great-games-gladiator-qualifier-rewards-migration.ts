export const greatGamesGladiatorQualifierRewardsMigration={
  version:129,
  name:"capua_qualifier_champion_rewards",
  sql:`
    DO $$
    DECLARE
      reward RECORD;
      wallet_id UUID;
      next_balance BIGINT;
      reward_key TEXT;
    BEGIN
      FOR reward IN
        SELECT tournament.id AS tournament_id,tournament.season_id,tournament.run_number,
               tournament.champion_id,ownership.country_id,gladiator.name AS champion_name
          FROM great_games_gladiator_tournaments tournament
          JOIN great_games_gladiators gladiator ON gladiator.id=tournament.champion_id
          JOIN great_games_gladiator_ownerships ownership
            ON ownership.season_id=tournament.season_id
           AND ownership.gladiator_id=tournament.champion_id
         WHERE tournament.tournament_type='QUALIFIER' AND tournament.status='COMPLETED'
         ORDER BY tournament.run_number
      LOOP
        reward_key:='GLADIATOR:qualifier-champion:' || reward.tournament_id::text;
        IF NOT EXISTS (
          SELECT 1 FROM great_games_money money
           WHERE money.season_id=reward.season_id AND money.source_key=reward_key
        ) THEN
          wallet_id:=NULL;
          next_balance:=NULL;
          SELECT wallet.id,wallet.balance
            INTO wallet_id,next_balance
            FROM great_games_wallets wallet
           WHERE wallet.season_id=reward.season_id AND wallet.country_id=reward.country_id
             AND wallet.closed_at IS NULL
           FOR UPDATE;
          IF wallet_id IS NOT NULL THEN
            next_balance:=next_balance+10000;
            UPDATE great_games_wallets SET balance=next_balance WHERE id=wallet_id;
            INSERT INTO great_games_money(
              season_id,country_id,game_type,amount,kind,source_key,description
            ) VALUES(
              reward.season_id,reward.country_id,'GLADIATOR',10000,'PAYOUT',reward_key,
              reward.champion_name || ' • ' || reward.run_number || '. Capua eleme turnuvası şampiyonluk ödülü'
            );
            INSERT INTO great_games_wallet_movements(
              wallet_id,amount,balance_after,kind,source_key,description
            ) VALUES(
              wallet_id,10000,next_balance,'PAYOUT',reward_key,
              reward.champion_name || ' • ' || reward.run_number || '. Capua eleme turnuvası şampiyonluk ödülü'
            );
          END IF;
        END IF;
      END LOOP;
    END $$;
  `
} as const;
