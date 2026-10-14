import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { navalReadyRepairReconciliationMigration } from "./naval-ready-repair-reconciliation-migration.js";

describe("hazır donanma tamiri uzlaştırması", () => {
  it("hazır tamir grubundaki eski hasar kayıtlarını tam can ve READY durumuna getirir", () => {
    expect(navalReadyRepairReconciliationMigration.version).toBe(198);
    expect(navalReadyRepairReconciliationMigration.sql).toContain("repair.completion_turn<=guild.current_turn");
    expect(navalReadyRepairReconciliationMigration.sql).toContain("current_hp=damage.max_hp");
    expect(navalReadyRepairReconciliationMigration.sql).toContain("repair.status='READY'");
    expect(migrations.find((migration) => migration.version === 198))
      .toBe(navalReadyRepairReconciliationMigration);
  });
});
