export const cultureMilitaryPenaltyActivationMigration = {
  version: 240,
  name: "activate_foreign_culture_military_penalty",
  sql: `
    ALTER TABLE guilds
      ALTER COLUMN culture_military_penalty_enabled SET DEFAULT TRUE;

    UPDATE guilds
       SET culture_military_penalty_enabled=TRUE,
           updated_at=NOW()
     WHERE culture_military_penalty_enabled=FALSE;
  `
} as const;
