import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { scandinavianStartingAssetsMigration } from "./scandinavian-starting-assets-migration.js";

describe("İskandinav başlangıç varlıkları göçü", () => {
  it("dört krallığın kıyılarına on Hjortspring ve bütün yerleşkelerine bir gelir verir", () => {
    expect(scandinavianStartingAssetsMigration.version).toBe(206);
    for (const country of ["Svege Krallığı", "Kimbri Krallığı", "Hedin Krallığı", "Gaut Krallığı"]) {
      expect(scandinavianStartingAssetsMigration.sql).toContain(`lower('${country}')`);
    }
    expect(scandinavianStartingAssetsMigration.sql).toContain("SELECT settlement_id,'hjortspring',10,'RESERVE'");
    expect(scandinavianStartingAssetsMigration.sql).toContain("WHERE is_coastal=TRUE");
    expect(scandinavianStartingAssetsMigration.sql).toContain("local_treasury=settlement.local_treasury+seed.income_grant");
    expect(scandinavianStartingAssetsMigration.sql).toContain("settlement.last_acquisition_income>0");
    expect(scandinavianStartingAssetsMigration.sql).toContain("FLOOR(settlement.population*settlement.tax_rate_percent/100.0)");
    expect(scandinavianStartingAssetsMigration.sql).toContain("settlement.base_land_trade_income+settlement.manual_flat_income");
    expect(scandinavianStartingAssetsMigration.sql).toContain("'ADMIN_ADJUSTMENT'");
    expect(scandinavianStartingAssetsMigration.sql).toContain("SET treasury=COALESCE");
    expect(migrations).toContain(scandinavianStartingAssetsMigration);
  });
});
