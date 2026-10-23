import { describe, expect, it } from "vitest";
import { GOVERNOR_FOCUSES, governorAdministration, governorModifiers } from "./governorship.js";

describe("governorship", () => {
  it("caps revenue focus at fourteen percent", () => {
    expect(governorModifiers("REVENUE", governorAdministration(9, 3)).incomeMultiplier).toBe(1.14);
  });

  it("scales public order with administration", () => {
    expect(governorModifiers("PUBLIC_ORDER", 5).rebellionDelta).toBe(-7);
  });

  it("keeps assimilation separate from governorship focuses", () => {
    expect(Object.keys(GOVERNOR_FOCUSES)).toEqual(["REVENUE", "PUBLIC_ORDER", "RECONSTRUCTION"]);
  });
});
