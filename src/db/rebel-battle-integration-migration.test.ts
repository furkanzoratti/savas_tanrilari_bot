import { describe, expect, it } from "vitest";
import { rebelBattleIntegrationMigration } from "./rebel-battle-integration-migration.js";

describe("rebel battle integration migration", () => {
  it("adds persistent leaders and a battle-side faction link", () => {
    expect(rebelBattleIntegrationMigration.version).toBe(145);
    expect(rebelBattleIntegrationMigration.sql).toContain("leader_skill_bonus");
    expect(rebelBattleIntegrationMigration.sql).toContain("rebel_faction_id");
    expect(rebelBattleIntegrationMigration.sql).toContain("is_system_faction");
  });
});
