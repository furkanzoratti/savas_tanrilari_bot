import { describe,expect,it } from "vitest";
import { missionariesMigration } from "./missionaries-migration.js";

describe("missionaries migration",()=>{
  it("adds the role and persistent per-mission conversion operations",()=>{
    expect(missionariesMigration.version).toBe(107);
    expect(missionariesMigration.sql).toContain("'MISSIONARY'");
    expect(missionariesMigration.sql).not.toContain("missionary_religion_key");
    expect(missionariesMigration.sql).toContain("CREATE TABLE IF NOT EXISTS missionary_operations");
    expect(missionariesMigration.sql).toContain("missionary_one_live_operation_per_settlement");
    expect(missionariesMigration.sql).toContain("CREATE TABLE IF NOT EXISTS missionary_rolls");
    expect(missionariesMigration.sql).toContain("'MISSIONARY_TRAVELING'");
    expect(missionariesMigration.sql).toContain("'MISSIONARY_CONVERSION'");
  });
});
