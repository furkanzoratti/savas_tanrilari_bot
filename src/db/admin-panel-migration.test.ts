import { describe, expect, it } from "vitest";
import { adminPanelMigration } from "./admin-panel-migration.js";

describe("GM admin panel migration", () => {
  it("stores idempotent audited operations", () => {
    expect(adminPanelMigration.version).toBe(95);
    expect(adminPanelMigration.sql).toContain("admin_panel_operations");
    expect(adminPanelMigration.sql).toContain("idempotency_key TEXT NOT NULL UNIQUE");
    expect(adminPanelMigration.sql).toContain("PROCESSING','APPLIED");
  });
});
