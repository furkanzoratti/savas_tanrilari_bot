export const missionaryRollPercentRepairMigration = {
  version: 193,
  name: "missionary_roll_percent_repair",
  sql: `
    ALTER TABLE missionary_rolls
      DROP CONSTRAINT IF EXISTS missionary_rolls_converted_percent_check;
    ALTER TABLE missionary_rolls
      ADD CONSTRAINT missionary_rolls_converted_percent_check
      CHECK (converted_percent BETWEEN 0 AND 15);
  `
} as const;
