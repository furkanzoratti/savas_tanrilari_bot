import { describe, expect, it } from "vitest";
import { applyCapitalIncomeBonus, applyCapitalPopulationBonus, CAPITAL_BONUS_PERCENT } from "./capital-city.js";

describe("başkent bonusları", () => {
  it("başkent gelir kalemlerini ve nüfus artışını yüzde bir artırır", () => {
    expect(CAPITAL_BONUS_PERCENT).toBe(1);
    expect(applyCapitalIncomeBonus({ building: 1_000, tax: 2_000, landTrade: 3_000, seaTrade: 4_000 }, true))
      .toEqual({ building: 1_010, tax: 2_020, landTrade: 3_030, seaTrade: 4_040 });
    expect(applyCapitalPopulationBonus(1_000, true)).toBe(1_010);
  });

  it("başkent olmayan yerleşkenin değerlerini değiştirmez", () => {
    const income = { building: 100, tax: 200, landTrade: 300, seaTrade: 400 };
    expect(applyCapitalIncomeBonus(income, false)).toBe(income);
    expect(applyCapitalPopulationBonus(500, false)).toBe(500);
  });
});
