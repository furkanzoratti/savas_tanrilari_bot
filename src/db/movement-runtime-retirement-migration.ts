export const movementRuntimeRetirementMigration = {
  version: 192,
  name: "retire_coordinate_movement_runtime",
  sql: `
    UPDATE guild_movement_settings
       SET enabled=FALSE,
           updated_at=NOW()
     WHERE enabled=TRUE;
  `
} as const;
