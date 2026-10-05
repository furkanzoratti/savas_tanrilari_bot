import {describe,expect,it} from "vitest";
import {christianityMigration} from "./christianity-migration.js";

describe("Hristiyanlık veritabanı göçü",()=>{
  it("Hristiyanlık, Katoliklik ve tur bazlı pasif yayılım kaydını ekler",()=>{
    expect(christianityMigration.version).toBe(136);
    expect(christianityMigration.sql).toContain("'CHRISTIANITY'");
    expect(christianityMigration.sql).toContain("'CHRISTIAN_CATHOLICISM'");
    expect(christianityMigration.sql).toContain("CREATE TABLE IF NOT EXISTS christian_passive_spread_runs");
  });
});
