export const movementRecallMigration={
  version:72,
  name:"army_muster_return_route",
  sql:`ALTER TABLE army_muster_orders ADD COLUMN IF NOT EXISTS is_returning BOOLEAN NOT NULL DEFAULT FALSE;`
} as const;
