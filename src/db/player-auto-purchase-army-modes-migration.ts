export const playerAutoPurchaseArmyModesMigration = {
  version: 127,
  name: "player_auto_purchase_army_modes",
  sql: `
    ALTER TABLE player_auto_purchase_previews
      DROP CONSTRAINT IF EXISTS player_auto_purchase_previews_mode_check;

    ALTER TABLE player_auto_purchase_previews
      ADD CONSTRAINT player_auto_purchase_previews_mode_check
      CHECK (mode IN ('SHIPS','QUALITY','LIGHT','GENERAL'));
  `
} as const;
