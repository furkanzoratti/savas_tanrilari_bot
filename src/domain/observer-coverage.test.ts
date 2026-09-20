import { describe, expect, it } from "vitest";
import { isObservedHex, observerCoverage } from "./observer-coverage.js";

describe("settlement observer coverage", () => {
  it("covers Uburzis O10 and exactly the six neighboring R56 cells", () => {
    expect(new Set(observerCoverage("O10"))).toEqual(new Set(["O10", "P10", "P09", "O09", "N09", "N10", "O11"]));
    expect(isObservedHex("O10", "P09")).toBe(true);
    expect(isObservedHex("O10", "Q10")).toBe(false);
  });
});
