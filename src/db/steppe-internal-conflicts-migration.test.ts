import {describe,expect,it} from "vitest";
import {steppeInternalConflictsMigration} from "./steppe-internal-conflicts-migration.js";

describe("steppe internal conflicts migration",()=>{
  it("creates conflicts and title army links",()=>{
    expect(steppeInternalConflictsMigration.version).toBe(177);
    expect(steppeInternalConflictsMigration.sql).toContain("CREATE TABLE IF NOT EXISTS steppe_internal_conflicts");
    expect(steppeInternalConflictsMigration.sql).toContain("ADD COLUMN IF NOT EXISTS steppe_title_id");
    expect(steppeInternalConflictsMigration.sql).toContain("steppe_one_active_conflict_per_pair_idx");
  });
});
