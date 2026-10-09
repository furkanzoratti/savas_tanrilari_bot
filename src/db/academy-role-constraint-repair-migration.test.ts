import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { academyRoleConstraintRepairMigration } from "./academy-role-constraint-repair-migration.js";

describe("akademi görev kısıtı onarım göçü", () => {
  it("çalışan veritabanındaki eski Akademi kısıtlarını Diplomat ve yeni zarlarla yeniler", () => {
    expect(academyRoleConstraintRepairMigration.version).toBe(150);
    expect(migrations.find((migration) => migration.version === 150)).toBe(academyRoleConstraintRepairMigration);
    expect(academyRoleConstraintRepairMigration.sql).toContain("CHECK (roll_sides IN (20,30,40))");
    expect(academyRoleConstraintRepairMigration.sql).toContain("academy_training_sessions_selected_role_check");
    expect(academyRoleConstraintRepairMigration.sql).toContain("'SPY','MERCHANT','COMMANDER','DIPLOMAT'");
  });
});
