export const navalRaidIncomeMigration = {
  version: 86,
  name: "naval_raid_income_based_penalties",
  sql: `
    ALTER TABLE naval_raids
      ADD COLUMN IF NOT EXISTS income_basis BIGINT,
      ADD COLUMN IF NOT EXISTS income_deduction_remaining BIGINT,
      ADD COLUMN IF NOT EXISTS income_deduction_applied_turn INTEGER;

    ALTER TABLE naval_raids DROP CONSTRAINT IF EXISTS naval_raids_income_basis_check;
    ALTER TABLE naval_raids ADD CONSTRAINT naval_raids_income_basis_check
      CHECK (income_basis IS NULL OR income_basis >= 0);

    ALTER TABLE naval_raids DROP CONSTRAINT IF EXISTS naval_raids_income_deduction_remaining_check;
    ALTER TABLE naval_raids ADD CONSTRAINT naval_raids_income_deduction_remaining_check
      CHECK (income_deduction_remaining IS NULL OR income_deduction_remaining >= 0);

    CREATE INDEX IF NOT EXISTS naval_raids_pending_income_deduction
      ON naval_raids(target_settlement_id,resolved_at)
      WHERE status='RESOLVED' AND income_deduction_remaining>0;
  `
} as const;
