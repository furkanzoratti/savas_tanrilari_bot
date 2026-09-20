import { describe, expect, it } from "vitest";
import { parseManualHexRoute } from "./manual-hex-route.js";

describe("manual hex route input", () => {
  it("normalizes coordinates separated by comma, arrow or spaces", () => {
    expect(parseManualHexRoute("a01, b01 → c02", "C02")).toEqual(["A01", "B01", "C02"]);
  });

  it("leaves an omitted route for automatic planning", () => {
    expect(parseManualHexRoute("  ", "C02")).toBeNull();
  });

  it("rejects incomplete, malformed and wrong-target routes", () => {
    expect(() => parseManualHexRoute("A01", "B01")).toThrow();
    expect(() => parseManualHexRoute("A01, ???, B01", "B01")).toThrow();
    expect(() => parseManualHexRoute("A01, B01", "C01")).toThrow();
  });
});
