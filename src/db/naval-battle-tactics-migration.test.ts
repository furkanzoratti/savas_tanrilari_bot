import { describe, expect, it } from "vitest";
import { navalBattleTacticsMigration } from "./naval-battle-tactics-migration.js";

describe("naval battle tactics migration", () => {
  it("adds hidden orders and capped maneuver points", () => {
    expect(navalBattleTacticsMigration.version).toBe(93);
    expect(navalBattleTacticsMigration.sql).toContain("naval_maneuver_points");
    expect(navalBattleTacticsMigration.sql).toContain("naval_order_locked");
    expect(navalBattleTacticsMigration.sql).toContain("CONTROLLED_RETREAT");
  });
});
