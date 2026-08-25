import { describe, expect, it } from "vitest";
import { BUILDING_CATEGORIES, BUILDINGS, buildingBaseCost } from "./catalog.js";

describe("bina kategorileri ve fiyatları", () => {
  it("her binayı kategoriye bağlar ve kategori fiyatını uygular", () => {
    expect(BUILDING_CATEGORIES[BUILDINGS.trade_guild!.category].label).toBe("Yüzdesel Ekonomi");
    expect(buildingBaseCost("trade_guild", 1)).toBe(3_000);
    expect(buildingBaseCost("farm", 2)).toBe(4_000);
    expect(buildingBaseCost("engineering", 3)).toBe(7_000);
  });
});
