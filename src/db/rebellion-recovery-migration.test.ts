import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {rebellionRecoveryMigration} from "./rebellion-recovery-migration.js";

describe("rebellion recovery migration",()=>{
  it("registers the recovery and same-faction cooldown schema",()=>{
    expect(rebellionRecoveryMigration.version).toBe(239);
    expect(migrations.find((migration)=>migration.version===239)).toBe(rebellionRecoveryMigration);
    expect(rebellionRecoveryMigration.sql).toContain("suppressed_rebellion_faction_type");
    expect(rebellionRecoveryMigration.sql).toContain("current_turn+6");
    expect(rebellionRecoveryMigration.sql).toContain("current_turn+8");
  });
});
