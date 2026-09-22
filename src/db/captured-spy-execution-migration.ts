export const capturedSpyExecutionMigration = {
  version: 81,
  name: "captured_spy_execution",
  sql: `
    ALTER TABLE espionage_operations
      ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS executed_by TEXT;
  `
} as const;
