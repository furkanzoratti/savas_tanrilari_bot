export const playerAutoPurchaseShipModesMigration = {
  version: 211,
  name: "player_auto_purchase_ship_modes",
  sql: `
    ALTER TABLE player_auto_purchase_previews
      DROP CONSTRAINT IF EXISTS player_auto_purchase_previews_mode_check;

    UPDATE player_auto_purchase_previews
       SET mode = 'MIXED_SHIPS',
           plan = jsonb_set(plan, '{mode}', to_jsonb('MIXED_SHIPS'::text), true)
     WHERE mode = 'SHIPS';

    ALTER TABLE player_auto_purchase_previews
      ADD CONSTRAINT player_auto_purchase_previews_mode_check
      CHECK (mode IN ('HEAVY_SHIPS','MIXED_SHIPS','QUALITY','LIGHT','GENERAL'));
  `
} as const;
