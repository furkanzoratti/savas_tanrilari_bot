import { describe, expect, it } from "vitest";
import { calculateCategorizedIncome, populationTaxIncome } from "./income.js";
import { militaryLimit, settlementMobilizationLimit } from "./mobilization.js";

describe("ikinci sürüm yerleşke ekonomisi", () => {
  it("halk vergisini nüfusun yüzde üçü olarak hesaplar", () => {
    expect(populationTaxIncome(100_000)).toBe(3_000);
    expect(populationTaxIncome(50_000)).toBe(1_500);
  });

  it("bina yüzdesini şehrin tüm gelir tabanına uygular ve bina kalemine yazar", () => {
    const result = calculateCategorizedIncome({
      settlementIncome: 0,
      taxIncome: 3_000,
      landTradeIncome: 7_000,
      seaTradeIncome: 0,
      manualFlatIncome: 0,
      manualIncomePercent: 0,
      buildings: [{ buildingType: "trade_guild", level: 1 }],
      ruinStage: 0
    });
    expect(result.gross).toEqual({ building: 1_000, tax: 3_000, landTrade: 7_000, seaTrade: 0 });
  });

  it("deniz ticareti başlangıçta sıfırdır ve Liman geliriyle açılır", () => {
    const withoutPort = calculateCategorizedIncome({
      settlementIncome: 0, taxIncome: 3_000, landTradeIncome: 7_000, seaTradeIncome: 0,
      manualFlatIncome: 0, manualIncomePercent: 0, buildings: [], ruinStage: 0
    });
    const withPort = calculateCategorizedIncome({
      settlementIncome: 0, taxIncome: 3_000, landTradeIncome: 7_000, seaTradeIncome: 0,
      manualFlatIncome: 0, manualIncomePercent: 0, buildings: [{ buildingType: "port", level: 1 }], ruinStage: 0
    });
    expect(withoutPort.gross.seaTrade).toBe(0);
    expect(withPort.gross.seaTrade).toBe(250);
  });
});

describe("devlet ve şehir seferberlik payları", () => {
  it("şehir paylarını aynı devlet yüzdesiyle nüfusa oranlar", () => {
    expect(settlementMobilizationLimit(100_000, "GENERAL")).toBe(17_500);
    expect(settlementMobilizationLimit(50_000, "GENERAL")).toBe(8_750);
    expect(militaryLimit(150_000, "GENERAL")).toBe(26_250);
  });
});
