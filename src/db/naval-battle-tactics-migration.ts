export const navalBattleTacticsMigration = {
  version: 93,
  name: "naval_battle_hidden_orders_and_maneuver",
  sql: `
    ALTER TABLE battle_sides
      ADD COLUMN IF NOT EXISTS naval_maneuver_points INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS naval_order TEXT,
      ADD COLUMN IF NOT EXISTS naval_order_locked BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE battle_sides
      DROP CONSTRAINT IF EXISTS battle_sides_naval_maneuver_points_check,
      DROP CONSTRAINT IF EXISTS battle_sides_naval_order_check;
    ALTER TABLE battle_sides
      ADD CONSTRAINT battle_sides_naval_maneuver_points_check
        CHECK (naval_maneuver_points BETWEEN 0 AND 5),
      ADD CONSTRAINT battle_sides_naval_order_check
        CHECK (naval_order IS NULL OR naval_order IN (
          'BALANCED','RAM','DEFENSIVE','FLANK','RETREAT','CONTROLLED_RETREAT'
        ));

    ALTER TABLE battle_rounds
      ADD COLUMN IF NOT EXISTS naval_order_a TEXT,
      ADD COLUMN IF NOT EXISTS naval_order_b TEXT,
      ADD COLUMN IF NOT EXISTS naval_maneuver_points_a INTEGER,
      ADD COLUMN IF NOT EXISTS naval_maneuver_points_b INTEGER;

    UPDATE battle_sides side_record
       SET pressure=0,
           naval_order=CASE WHEN EXISTS (
             SELECT 1 FROM battles battle
             JOIN battle_rolls roll ON roll.battle_id=battle.id AND roll.round_number=battle.round_number
             WHERE battle.id=side_record.battle_id AND battle.terrain='NAVAL'
           ) THEN 'BALANCED' ELSE naval_order END,
           naval_order_locked=CASE WHEN EXISTS (
             SELECT 1 FROM battles battle
             JOIN battle_rolls roll ON roll.battle_id=battle.id AND roll.round_number=battle.round_number
             WHERE battle.id=side_record.battle_id AND battle.terrain='NAVAL'
           ) THEN TRUE ELSE naval_order_locked END
      FROM battles battle
     WHERE battle.id=side_record.battle_id AND battle.terrain='NAVAL';
  `
} as const;
