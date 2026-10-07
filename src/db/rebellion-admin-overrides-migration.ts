export const rebellionAdminOverridesMigration={
  version:142,
  name:"rebellion_admin_planning_overrides",
  sql:`
    ALTER TABLE settlements
      ADD COLUMN IF NOT EXISTS rebellion_name_override TEXT,
      ADD COLUMN IF NOT EXISTS rebellion_personnel_override INTEGER
        CHECK (rebellion_personnel_override IS NULL OR rebellion_personnel_override BETWEEN 1000 AND 250000);
  `
} as const;
