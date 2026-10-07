import { describe,expect,it } from "vitest";
import { migrations } from "./migrations.js";
import { stabilityRebellionMigration } from "./stability-rebellion-migration.js";

describe("stability rebellion migration",()=>{
  it("is registered as migration 140",()=>{
    expect(stabilityRebellionMigration.version).toBe(140);
    expect(migrations.find((migration)=>migration.version===140)).toBe(stabilityRebellionMigration);
  });

  it("creates persistent history, turn snapshots and rebel armies",()=>{
    expect(stabilityRebellionMigration.sql).toContain("settlement_ownership_history");
    expect(stabilityRebellionMigration.sql).toContain("settlement_stability_turns");
    expect(stabilityRebellionMigration.sql).toContain("country_war_exhaustion_turns");
    expect(stabilityRebellionMigration.sql).toContain("rebel_factions");
  });
});
