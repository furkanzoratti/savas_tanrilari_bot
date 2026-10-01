export const battleNavalCargoMigration = {
  version: 105,
  name: "battle_manual_naval_cargo_army",
  sql: `
    ALTER TABLE battle_side_participants
      ADD COLUMN IF NOT EXISTS embarked_army_id UUID REFERENCES armies(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS embarked_army_composition JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS embarked_army_loss INTEGER NOT NULL DEFAULT 0 CHECK (embarked_army_loss >= 0);

    CREATE INDEX IF NOT EXISTS battle_side_participants_embarked_army_idx
      ON battle_side_participants(battle_id,embarked_army_id)
      WHERE embarked_army_id IS NOT NULL;
  `
} as const;
