import { describe, expect, it } from "vitest";
import { garrisonComposition, garrisonLevel } from "./garrison.js";

describe("standart yerleşke garnizonu", () => {
  it.each([
    [50_000, 200, 200, 100],
    [74_999, 200, 200, 100],
    [75_000, 300, 300, 150],
    [100_000, 400, 400, 200],
    [125_000, 500, 500, 250],
    [150_000, 600, 600, 300],
    [175_000, 700, 700, 350],
    [199_999, 700, 700, 350]
  ])("%i nüfusta doğru kadroyu kurar", (population, lightInfantry, spears, archers) => {
    expect(garrisonComposition(population)).toEqual({ lightInfantry, spears, archers });
  });

  it("50.000 altındaki şehirlerde toplam nüfusun tam yüzde birini dağıtır", () => {
    const composition = garrisonComposition(12_345);
    expect(composition).toEqual({ lightInfantry: 49, spears: 49, archers: 25 });
    expect(composition.lightInfantry + composition.spears + composition.archers).toBe(123);
  });

  it("eşik seviyesini yalnızca 25.000 nüfusluk üst geçişlerde artırır", () => {
    expect(garrisonLevel(49_999)).toBe(0);
    expect(garrisonLevel(50_000)).toBe(1);
    expect(garrisonLevel(74_999)).toBe(1);
    expect(garrisonLevel(75_000)).toBe(2);
    expect(garrisonLevel(200_000)).toBe(7);
  });
});
