import { describe,expect,it } from "vitest";
import { navalRaidIncomeMigration } from "./naval-raid-income-migration.js";

describe("naval raid income migration",()=>{
  it("stores an income basis and a carryable one-time deduction",()=>{
    expect(navalRaidIncomeMigration.version).toBe(86);
    expect(navalRaidIncomeMigration.sql).toContain("income_basis BIGINT");
    expect(navalRaidIncomeMigration.sql).toContain("income_deduction_remaining BIGINT");
    expect(navalRaidIncomeMigration.sql).toContain("naval_raids_pending_income_deduction");
  });
});
