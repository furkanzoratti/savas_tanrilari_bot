import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {navalCaptureEvacuationMigration} from "./naval-capture-evacuation-migration.js";

describe("naval capture evacuation migration",()=>{
  it("repairs stale fleet allocations and missing ship stock",()=>{
    expect(navalCaptureEvacuationMigration.version).toBe(176);
    expect(migrations.find((migration)=>migration.version===176)).toBe(navalCaptureEvacuationMigration);
    expect(navalCaptureEvacuationMigration.sql).toContain("origin.country_id<>fleet.country_id");
    expect(navalCaptureEvacuationMigration.sql).toContain("INSERT INTO fleet_ships");
    expect(navalCaptureEvacuationMigration.sql).toContain("INSERT INTO naval_units");
    expect(navalCaptureEvacuationMigration.sql).toContain("repair_group_id=NULL");
    expect(navalCaptureEvacuationMigration.sql).toContain("history.acquired_turn>=repair.started_turn");
    expect(navalCaptureEvacuationMigration.sql).not.toContain("SET repair_settlement_id=destination.id");
  });
});
