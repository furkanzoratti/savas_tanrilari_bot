import { describe, expect, it } from "vitest";
import { clampWarScore, validateWarGoalTarget } from "./war-objectives.js";

describe("structured war objectives", () => {
  it("requires a settlement for conquest and restoration", () => {
    expect(validateWarGoalTarget({ type: "CONQUEST", targetCountryId: "c", targetSettlementId: null }))
      .toContain("yerleşke");
    expect(validateWarGoalTarget({ type: "RESTORATION", targetCountryId: "c", targetSettlementId: "s" }))
      .toBeNull();
  });

  it("clamps war score to the public range", () => {
    expect(clampWarScore(140)).toBe(100);
    expect(clampWarScore(-140)).toBe(-100);
  });
});

