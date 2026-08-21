import { describe, expect, it } from "vitest";
import { calculateCategorizedIncome, incomeTotal } from "./income.js";

describe("gelir kalemleri", () => {
  it("temel gelirleri, antlaşmaları ve bina etkilerini doğru kaleme yazar", () => {
    const result = calculateCategorizedIncome({
      settlementIncome: 1_000,
      taxIncome: 2_000,
      landTradeIncome: 500,
      seaTradeIncome: 300,
      agreementLandIncome: 250,
      agreementSeaIncome: 250,
      manualFlatIncome: 100,
      manualIncomePercent: 0,
      buildings: [
        { buildingType: "farm", level: 1 },
        { buildingType: "lupanar", level: 1 },
        { buildingType: "trade_guild", level: 1 },
        { buildingType: "port", level: 1 }
      ],
      ruinStage: 0
    });

    expect(result.gross).toEqual({ settlement: 1_350, tax: 2_300, landTrade: 825, seaTrade: 800 });
    expect(result.buildingBonuses).toEqual({ settlement: 250, tax: 300, landTrade: 75, seaTrade: 250 });
    expect(incomeTotal(result.payable)).toBe(5_275);
  });

  it("harap toparlanmasının yüzde 50 aşamasını bütün gelir kalemlerine uygular", () => {
    const result = calculateCategorizedIncome({
      settlementIncome: 1_000,
      taxIncome: 1_000,
      landTradeIncome: 1_000,
      seaTradeIncome: 1_000,
      manualFlatIncome: 0,
      manualIncomePercent: 0,
      buildings: [],
      ruinStage: 2
    });
    expect(result.payable).toEqual({ settlement: 500, tax: 500, landTrade: 500, seaTrade: 500 });
  });
});
