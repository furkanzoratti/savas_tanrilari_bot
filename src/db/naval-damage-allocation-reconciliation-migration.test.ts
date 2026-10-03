import {describe,expect,it} from "vitest";
import {navalDamageAllocationReconciliationMigration} from "./naval-damage-allocation-reconciliation-migration.js";

describe("naval damage allocation reconciliation migration",()=>{
  it("restores active damage allocations and the minimum physical stock",()=>{
    expect(navalDamageAllocationReconciliationMigration.version).toBe(122);
    expect(navalDamageAllocationReconciliationMigration.name).toBe("naval_damage_allocation_reconciliation");
    expect(navalDamageAllocationReconciliationMigration.sql).toContain("status IN ('DAMAGED','DISABLED')");
    expect(navalDamageAllocationReconciliationMigration.sql).toContain("GREATEST(fleet_ships.quantity,EXCLUDED.quantity)");
    expect(navalDamageAllocationReconciliationMigration.sql).toContain("status IN ('REPAIRING','READY')");
    expect(navalDamageAllocationReconciliationMigration.sql).toContain("INSERT INTO naval_units");
    expect(navalDamageAllocationReconciliationMigration.sql).toContain("'RESERVE'");
  });
});
