export const adminPanelControlsMigration = {
  version: 97,
  name: "gm_admin_panel_controls_and_settlement_tax_rate",
  sql: `
    ALTER TABLE settlements
      ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(6,3) NOT NULL DEFAULT 3
      CHECK (tax_rate_percent BETWEEN 0 AND 100);
  `
} as const;
