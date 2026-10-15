import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { scandinavianTreasuryRepairMigration } from "./scandinavian-treasury-repair-migration.js";

describe("İskandinav başlangıç hazinesi telafisi", () => {
  it("sıfır son gelirde projeksiyon kullanır ve v206 ile ödeme alanı tekrar ödemez", () => {
    expect(scandinavianTreasuryRepairMigration.version).toBe(208);
    expect(scandinavianTreasuryRepairMigration.sql).toContain("settlement.last_acquisition_income>0");
    expect(scandinavianTreasuryRepairMigration.sql).toContain("FLOOR(settlement.population*settlement.tax_rate_percent/100.0)");
    expect(scandinavianTreasuryRepairMigration.sql).toContain("settlement.base_land_trade_income+settlement.manual_flat_income");
    expect(scandinavianTreasuryRepairMigration.sql).toContain("ledger.details->>'source'='scandinavian-starting-assets-v206'");
    expect(scandinavianTreasuryRepairMigration.sql).toContain("local_treasury=settlement.local_treasury+repair.income_grant");
    expect(scandinavianTreasuryRepairMigration.sql).toContain("scandinavian-starting-treasury-repair-v208");
    expect(migrations.at(-1)).toBe(scandinavianTreasuryRepairMigration);
  });
});
