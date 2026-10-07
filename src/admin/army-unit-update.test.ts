import { describe, expect, it } from "vitest";
import { resolveArmyUnitTargetQuantity } from "./army-unit-update.js";

describe("panel ordu birlik güncellemesi", () => {
  it("mevcut satır düzenlenirken girilen miktarı yeni toplam kabul eder", () => {
    expect(resolveArmyUnitTargetQuantity(5_000, 6_000, "SET")).toBe(6_000);
  });

  it("yeni asker ekleme işleminde girilen miktarı mevcut birliğin üzerine ekler", () => {
    expect(resolveArmyUnitTargetQuantity(5_000, 1_000, "ADD")).toBe(6_000);
  });

  it("ekleme sonrası üst sınır aşılırsa işlemi reddeder", () => {
    expect(() => resolveArmyUnitTargetQuantity(9_500_000, 600_000, "ADD"))
      .toThrow("Ordu birlik mevcudu 0-10.000.000 arasında olmalıdır.");
  });
});
