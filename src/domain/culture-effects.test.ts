import { describe, expect, it } from "vitest";
import {
  applyCultureIncomeEffect,
  cultureMilitaryPopulation,
  FOREIGN_CULTURE_INCOME_MULTIPLIER,
  FOREIGN_CULTURE_MILITARY_MULTIPLIER,
  isForeignCulture
} from "./culture-effects.js";

describe("otomatik kültür etkileri", () => {
  it("yabancı kültürün toplam gelir kalemlerini 0,80 ile çarpar", () => {
    expect(FOREIGN_CULTURE_INCOME_MULTIPLIER).toBe(0.80);
    expect(applyCultureIncomeEffect(
      { building: 1_001, tax: 503, landTrade: 2_000, seaTrade: 999 },
      "ANATOLIAN",
      "HELLENIC"
    )).toEqual({ building: 800, tax: 402, landTrade: 1_600, seaTrade: 799 });
  });

  it("ana kültür ve atanmamış kültür gelirini değiştirmez", () => {
    const income = { building: 1_000, tax: 500, landTrade: 2_000, seaTrade: 750 };
    expect(applyCultureIncomeEffect(income, "HELLENIC", "HELLENIC")).toEqual(income);
    expect(isForeignCulture("UNASSIGNED", "HELLENIC")).toBe(false);
  });

  it("askerî 0,80 katsayısını yalnız anahtar açıkken hesaplar", () => {
    expect(FOREIGN_CULTURE_MILITARY_MULTIPLIER).toBe(0.80);
    expect(cultureMilitaryPopulation(10_001, "ANATOLIAN", "HELLENIC", false)).toBe(10_001);
    expect(cultureMilitaryPopulation(10_001, "ANATOLIAN", "HELLENIC", true)).toBe(8_000);
    expect(cultureMilitaryPopulation(10_001, "HELLENIC", "HELLENIC", true)).toBe(10_001);
  });
});
