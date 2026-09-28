import { describe, expect, it } from "vitest";
import { adminPanelControlsMigration } from "./admin-panel-controls-migration.js";

describe("admin panel control migration", () => {
  it("adds a settlement-specific tax rate with the existing three-percent default", () => {
    expect(adminPanelControlsMigration.version).toBe(97);
    expect(adminPanelControlsMigration.sql).toContain("tax_rate_percent");
    expect(adminPanelControlsMigration.sql).toContain("DEFAULT 3");
  });
});
