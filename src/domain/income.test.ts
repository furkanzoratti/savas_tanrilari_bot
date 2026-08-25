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

    expect(result.gross).toEqual({ building: 1_680, tax: 2_000, landTrade: 1_750, seaTrade: 1_050 });
    expect(result.buildingBonuses).toEqual({ building: 1_680, tax: 0, landTrade: 0, seaTrade: 0 });
    expect(incomeTotal(result.payable)).toBe(6_480);
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
    expect(result.payable).toEqual({ building: 0, tax: 500, landTrade: 1_000, seaTrade: 500 });
  });
});
