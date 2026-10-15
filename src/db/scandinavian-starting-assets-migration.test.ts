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
    expect(scandinavianStartingAssetsMigration.sql).toContain("GREATEST(0,settlement.last_acquisition_income)");
    expect(scandinavianStartingAssetsMigration.sql).toContain("'ADMIN_ADJUSTMENT'");
    expect(scandinavianStartingAssetsMigration.sql).toContain("SET treasury=COALESCE");
    expect(migrations).toContain(scandinavianStartingAssetsMigration);
  });
});
