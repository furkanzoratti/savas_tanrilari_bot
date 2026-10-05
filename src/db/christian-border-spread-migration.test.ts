import {describe,expect,it} from "vitest";
import {christianBorderSpreadMigration} from "./christian-border-spread-migration.js";

describe("elle belirlenen Hristiyan sınır yayılımı göçü",()=>{
  it("aktif ve tamamlanmış yerleşke süreçlerini saklar",()=>{
    expect(christianBorderSpreadMigration.version).toBe(137);
    expect(christianBorderSpreadMigration.sql).toContain("CREATE TABLE IF NOT EXISTS christian_border_spreads");
    expect(christianBorderSpreadMigration.sql).toContain("'ACTIVE','COMPLETED'");
    expect(christianBorderSpreadMigration.sql).toContain("settlement_id UUID");
  });
});
