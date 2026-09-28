import { describe, expect, it } from "vitest";
import { adminPanelLoginMigration } from "./admin-panel-login-migration.js";

describe("GM admin panel one-time login migration", () => {
  it("stores hashed, expiring and single-use login records", () => {
    expect(adminPanelLoginMigration.version).toBe(96);
    expect(adminPanelLoginMigration.sql).toContain("admin_panel_login_tokens");
    expect(adminPanelLoginMigration.sql).toContain("token_hash TEXT PRIMARY KEY");
    expect(adminPanelLoginMigration.sql).toContain("used_at TIMESTAMPTZ");
    expect(adminPanelLoginMigration.sql).toContain("expires_at TIMESTAMPTZ NOT NULL");
  });
});
