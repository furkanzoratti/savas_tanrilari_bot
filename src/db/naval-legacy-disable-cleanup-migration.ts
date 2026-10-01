export const navalLegacyDisableCleanupMigration = {
  version: 106,
  name: "remove_legacy_timed_naval_disablement",
  sql: `
    UPDATE naval_units
       SET disabled_until_turn=NULL
     WHERE disabled_until_turn IS NOT NULL;
  `
} as const;
