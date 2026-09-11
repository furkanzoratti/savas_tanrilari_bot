import { describe, expect, it } from "vitest";
import { calculatePopulationGain, calculateUnitUpkeep } from "./economy.js";
import { calculateCategorizedIncome, incomeTotal } from "./income.js";
import {
  buildingCostMultiplier, buildingDurationReduction, shipCostMultiplier,
  tradeAgreementLimit, unitCostMultiplier
} from "./resources.js";

describe("hammadde etkileri", () => {
  it("üretim maliyeti indirimlerini yerleşke kaynaklarına göre biriktirir", () => {
    expect(buildingCostMultiplier("curia", ["TIMBER", "MARBLE"])).toBe(0.8);
    expect(buildingDurationReduction("curia", ["MARBLE"])).toBe(1);
    expect(buildingCostMultiplier("inns_baths", ["TIMBER", "MARBLE", "GLASS"])).toBe(0.7);
    expect(buildingCostMultiplier("customs_house", ["MARBLE"])).toBe(0.9);
    expect(buildingCostMultiplier("census_tax_office", ["MARBLE"])).toBe(0.9);
    expect(buildingDurationReduction("inns_baths", ["MARBLE"])).toBe(1);
    expect(buildingDurationReduction("customs_house", ["MARBLE"])).toBe(1);
    expect(buildingDurationReduction("census_tax_office", ["MARBLE"])).toBe(1);
    expect(unitCostMultiplier("heavy_cavalry", ["IRON", "HORSES"])).toBe(0.8);
    expect(shipCostMultiplier(["TIMBER"])).toBe(0.9);
  });

  it("Şarap, Cam ve İpek etkilerini yeni ekonomi binalarına uygular", () => {
    const inns = calculateCategorizedIncome({
      settlementIncome: 0, taxIncome: 0, landTradeIncome: 0, seaTradeIncome: 0,
      manualFlatIncome: 0, manualIncomePercent: 0,
      buildings: [{ buildingType: "inns_baths", level: 2 }], ruinStage: 0,
      resources: ["WINE", "GLASS"]
    });
    expect(inns.gross.building).toBe(2_025);

    const commerce = calculateCategorizedIncome({
      settlementIncome: 0, taxIncome: 0, landTradeIncome: 1_000, seaTradeIncome: 0,
      manualFlatIncome: 0, manualIncomePercent: 0,
      buildings: [{ buildingType: "caravanserai", level: 1 }], ruinStage: 0,
      resources: ["SILK"]
    });
    expect(commerce.gross).toEqual({ building: 550, tax: 0, landTrade: 1_165, seaTrade: 0 });

    const artisans = calculateCategorizedIncome({
      settlementIncome: 0, taxIncome: 0, landTradeIncome: 0, seaTradeIncome: 0,
      manualFlatIncome: 0, manualIncomePercent: 0,
      buildings: [{ buildingType: "artisans_quarter", level: 1 }], ruinStage: 0,
      resources: ["SILK", "IRON"]
    });
    expect(artisans.gross.building).toBe(1_100);
  });

  it("Tahıl bakım ve nüfus etkisini uygular", () => {
    expect(calculateUnitUpkeep("heavy_infantry", 1_000, "FIELD_FRIENDLY", "PEACE", ["GRAIN"])).toBe(405);
    expect(calculatePopulationGain({
      population: 100_000, buildings: [], ruinStage: 0, mobilization: "PEACE", resources: ["GRAIN"]
    })).toBe(2_200);
  });

  it("Altın ve Baharat toplam geliri artırır", () => {
    const result = calculateCategorizedIncome({
      settlementIncome: 1_000, taxIncome: 0, landTradeIncome: 0, seaTradeIncome: 0,
      manualFlatIncome: 0, manualIncomePercent: 0, buildings: [], ruinStage: 0,
      resources: ["GOLD", "SPICES"]
    });
    expect(incomeTotal(result.gross)).toBe(1_320);
  });

  it("Mor Boya ticaret sınırını bir artırır", () => {
    expect(tradeAgreementLimit([])).toBe(2);
    expect(tradeAgreementLimit(["PURPLE_DYE"])).toBe(3);
  });
});
