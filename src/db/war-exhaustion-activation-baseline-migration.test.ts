import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {warExhaustionActivationBaselineMigration} from "./war-exhaustion-activation-baseline-migration.js";

describe("war exhaustion activation baseline migration",()=>{
  it("recognizes only elapsed participation turns for wars already in progress",()=>{
    expect(warExhaustionActivationBaselineMigration.version).toBe(144);
    expect(migrations.find((migration)=>migration.version===144)).toBe(warExhaustionActivationBaselineMigration);
    expect(warExhaustionActivationBaselineMigration.sql).toContain("COALESCE(metrics.joined_turn,war.started_turn)");
    expect(warExhaustionActivationBaselineMigration.sql).toContain("active_war_turns.elapsed_turns*2");
    expect(warExhaustionActivationBaselineMigration.sql).not.toContain("total_losses");
    expect(warExhaustionActivationBaselineMigration.sql).not.toContain("land_raids");
  });
});
