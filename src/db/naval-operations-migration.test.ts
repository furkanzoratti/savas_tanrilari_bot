import { describe,expect,it } from "vitest";
import { navalOperationsMigration } from "./naval-operations-migration.js";

describe("naval operations migration",()=>{
  it("creates persistent blockade and one-roll raid records",()=>{
    expect(navalOperationsMigration.version).toBe(85);
    expect(navalOperationsMigration.sql).toContain("CREATE TABLE IF NOT EXISTS naval_blockades");
    expect(navalOperationsMigration.sql).toContain("naval_blockades_one_active_target");
    expect(navalOperationsMigration.sql).toContain("CREATE TABLE IF NOT EXISTS naval_raids");
    expect(navalOperationsMigration.sql).toContain("naval_raids_one_waiting_fleet");
    expect(navalOperationsMigration.sql).toContain("starvation_adjusted BOOLEAN NOT NULL DEFAULT FALSE");
  });
});
