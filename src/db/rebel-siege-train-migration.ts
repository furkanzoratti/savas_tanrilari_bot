export const rebelSiegeTrainMigration={
  version:146,
  name:"rebel_siege_train_and_active_battle_backfill",
  sql:`
    ALTER TABLE rebel_factions
      ADD COLUMN IF NOT EXISTS siege_assets JSONB NOT NULL DEFAULT '{}'::jsonb;

    WITH profiles AS (
      SELECT faction.id,faction.faction_type,faction.personnel,
             COALESCE(MAX(building.level) FILTER (WHERE building.building_type='engineering'
               AND building.status IN ('ACTIVE','BUILDING')),0)::integer AS engineering_level
        FROM rebel_factions faction
        LEFT JOIN buildings building ON building.settlement_id=faction.settlement_id
       WHERE faction.status IN ('ORGANIZING','ACTIVE','OCCUPYING')
       GROUP BY faction.id,faction.faction_type,faction.personnel
    ), calculated AS (
      SELECT id,jsonb_strip_nulls(jsonb_build_object(
        'ladder_group',NULLIF(LEAST(8,CEIL(personnel/2000.0)::integer),0),
        'ram',CASE WHEN personnel>=4000 THEN 1 END,
        'mantlet',NULLIF(LEAST(5,FLOOR(personnel/4000.0)::integer),0),
        'ballista',NULLIF((CASE WHEN engineering_level>=1 THEN 1 ELSE 0 END)
          +(CASE WHEN faction_type='SEPARATIST' THEN 1 ELSE 0 END),0),
        'catapult',CASE WHEN engineering_level>=2 THEN 1 END,
        'siege_tower',CASE WHEN engineering_level>=3 THEN 1 END
      )) AS siege_assets
      FROM profiles
    )
    UPDATE rebel_factions faction
       SET siege_assets=calculated.siege_assets,
           cause_snapshot=COALESCE(faction.cause_snapshot,'{}'::jsonb)
             || jsonb_build_object('siegeTrainBackfilled',TRUE),
           updated_at=NOW()
      FROM calculated
     WHERE faction.id=calculated.id AND faction.siege_assets='{}'::jsonb;

    WITH rebel_attackers AS (
      SELECT side.battle_id,side.side_key,faction.siege_assets
        FROM battle_sides side
        JOIN battles battle ON battle.id=side.battle_id
        JOIN rebel_factions faction ON faction.id=side.rebel_faction_id
       WHERE battle.terrain='SIEGE' AND battle.status NOT IN ('FINISHED','CANCELLED')
         AND side.side_key='A'
    )
    UPDATE battle_sides side
       SET support_assets=attacker.siege_assets||COALESCE(side.support_assets,'{}'::jsonb),
           support_targets=jsonb_build_object(
             'ladder_group','ASSAULT','ram','GATE','mantlet','ASSAULT',
             'ballista','WALL','catapult','WALL','siege_tower','ASSAULT'
           )||COALESCE(side.support_targets,'{}'::jsonb)
      FROM rebel_attackers attacker
     WHERE side.battle_id=attacker.battle_id AND side.side_key=attacker.side_key;

    WITH rebel_defenders AS (
      SELECT side.battle_id,side.side_key,
             COALESCE(SUM(stock.quantity) FILTER (WHERE stock.asset_type='wall_ballista'),0)::integer AS wall_ballistae
        FROM battle_sides side
        JOIN battles battle ON battle.id=side.battle_id
        JOIN rebel_factions faction ON faction.id=side.rebel_faction_id
        LEFT JOIN siege_assets stock ON stock.settlement_id=faction.settlement_id
       WHERE battle.terrain='SIEGE' AND battle.status NOT IN ('FINISHED','CANCELLED')
         AND side.side_key='B'
       GROUP BY side.battle_id,side.side_key
    )
    UPDATE battle_sides side
       SET support_assets=(CASE WHEN defender.wall_ballistae>0
             THEN jsonb_build_object('wall_ballista',defender.wall_ballistae) ELSE '{}'::jsonb END)
             ||COALESCE(side.support_assets,'{}'::jsonb),
           support_targets=(CASE WHEN defender.wall_ballistae>0
             THEN jsonb_build_object('wall_ballista','ARMY') ELSE '{}'::jsonb END)
             ||COALESCE(side.support_targets,'{}'::jsonb)
      FROM rebel_defenders defender
     WHERE side.battle_id=defender.battle_id AND side.side_key=defender.side_key;
  `
} as const;
