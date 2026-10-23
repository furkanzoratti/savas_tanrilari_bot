import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { governorshipFocusCleanupMigration } from "./governorship-focus-cleanup-migration.js";

describe("governorship integration focus cleanup migration", () => {
  it("ends active integration governorships and releases their diplomats", () => {
    expect(migrations.find((migration) => migration.version === 228)).toBe(governorshipFocusCleanupMigration);
    expect(governorshipFocusCleanupMigration.sql).toContain("status='ACTIVE' AND focus='INTEGRATION'");
    expect(governorshipFocusCleanupMigration.sql).toContain("assignment='NONE'");
    expect(governorshipFocusCleanupMigration.sql).toContain("focus IN ('REVENUE','PUBLIC_ORDER','RECONSTRUCTION')");
  });
});
