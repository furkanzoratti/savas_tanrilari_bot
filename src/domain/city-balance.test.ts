import { describe, expect, it } from "vitest";
import { rollSiegeSupport } from "./battle.js";
import { buildingSlotLimit } from "./economy.js";
import { calculateCategorizedIncome, incomeTotal } from "./income.js";

const base = {
  settlementIncome: 0,
  taxIncome: 0,
  landTradeIncome: 0,
  seaTradeIncome: 0,
  manualFlatIncome: 0,
  manualIncomePercent: 0,
  buildings: [],
  ruinStage: 0 as const
};

describe("yerleşke geliştirme ve politika dengesi", () => {
  it("normal yerleşkeyi sekiz slotta sınırlar ve büyük liman şehrine dokuzuncu slotu açar", () => {
    expect(buildingSlotLimit(0)).toBe(5);
    expect(buildingSlotLimit(20_000)).toBe(7);
    expect(buildingSlotLimit(40_000)).toBe(8);
    expect(buildingSlotLimit(200_000)).toBe(8);
    expect(buildingSlotLimit(149_999,true)).toBe(8);
    expect(buildingSlotLimit(150_000,true)).toBe(9);
  });

  it("Köle Kampı gelirini yerleşkenin köle nüfusu üzerinden hesaplar", () => {
    const result = calculateCategorizedIncome({
      ...base,
      slavePopulation: 2_000,
      buildings: [{ buildingType: "slave_camp", level: 2 }]
    });
    expect(result.gross.building).toBe(800);
  });

  it("Vergi Sıkılaştırmasını yalnızca halk vergisine uygular", () => {
    const result = calculateCategorizedIncome({
      ...base,
      taxIncome: 1_000,
      landTradeIncome: 1_000,
      activePolicies: ["STRICT_TAXATION"]
    });
    expect(result.gross.tax).toBe(1_200);
    expect(result.gross.landTrade).toBe(1_000);
  });

  it("Pazar Panayırlarının sabit geliri ile lonca bonusunu birlikte uygular", () => {
    const result = calculateCategorizedIncome({
      ...base,
      landTradeIncome: 1_000,
      buildings: [{ buildingType: "trade_guild", level: 1 }],
      activePolicies: ["MARKET_FAIRS"]
    });
    expect(result.gross.building).toBe(1_240);
    expect(incomeTotal(result.gross)).toBe(2_240);
  });

  it("Agora tüccar atamasını şehir gelirine yüzde on olarak işler", () => {
    const result = calculateCategorizedIncome({
      ...base,
      taxIncome: 1_000,
      landTradeIncome: 1_000,
      buildings: [{ buildingType: "agora", level: 2 }],
      assignedMerchant: true
    });
    expect(result.gross.building).toBe(1_575);
    expect(incomeTotal(result.gross)).toBe(3_575);
  });

  it("Tüccarın her özellik puanını Agora gelirine iki yüzde puan ekler", () => {
    const result = calculateCategorizedIncome({
      ...base,
      taxIncome: 1_000,
      landTradeIncome: 1_000,
      buildings: [{ buildingType: "agora", level: 2 }],
      assignedMerchant: true,
      merchantSkillBonus: 1
    });
    expect(result.gross.building).toBe(1_640);
    expect(incomeTotal(result.gross)).toBe(3_640);
  });

  it("Tersane Sv3 bonusunu yalnızca deniz ticaretine uygular", () => {
    const result = calculateCategorizedIncome({
      ...base,
      landTradeIncome: 1_000,
      seaTradeIncome: 1_000,
      buildings: [
        { buildingType: "port", level: 1 },
        { buildingType: "shipyard", level: 3 }
      ]
    });
    expect(result.gross.landTrade).toBe(1_000);
    expect(result.gross.seaTrade).toBe(2_012);
    expect(result.gross.building).toBe(0);
  });

  it("bina ve hammadde kaynaklı toplam yüzdesel geliri yüzde 75 ile sınırlar", () => {
    const result = calculateCategorizedIncome({
      ...base,
      taxIncome: 1_000,
      landTradeIncome: 1_000,
      seaTradeIncome: 1_000,
      manualIncomePercent: 0.20,
      buildings: [
        { buildingType: "trade_guild", level: 3 },
        { buildingType: "agora", level: 3 }
      ],
      resources: ["GOLD", "SPICES"],
      assignedMerchant: true
    });
    expect(result.gross.building).toBe(11_525);
    expect(incomeTotal(result.gross)).toBe(14_525);
  });

  it("Kervansaray bonusunu yalnız kara ticaretine uygular", () => {
    const result = calculateCategorizedIncome({
      ...base,
      taxIncome: 1_000,
      landTradeIncome: 1_000,
      buildings: [{ buildingType: "caravanserai", level: 1 }]
    });
    expect(result.gross).toEqual({ building: 500, tax: 1_000, landTrade: 1_150, seaTrade: 0 });
  });

  it("Gümrükhane etkilerini yalnız etkin Liman varken uygular", () => {
    const withoutPort = calculateCategorizedIncome({
      ...base,
      buildings: [{ buildingType: "customs_house", level: 2 }]
    });
    const withPort = calculateCategorizedIncome({
      ...base,
      buildings: [{ buildingType: "port", level: 1 }, { buildingType: "customs_house", level: 2 }]
    });
    expect(withoutPort.gross).toEqual({ building: 0, tax: 0, landTrade: 0, seaTrade: 0 });
    expect(withPort.gross).toEqual({ building: 1_000, tax: 0, landTrade: 0, seaTrade: 1_050 });
  });

  it("Zanaatkârlar Mahallesini en fazla üç uygun hammaddeden besler", () => {
    const result = calculateCategorizedIncome({
      ...base,
      buildings: [{ buildingType: "artisans_quarter", level: 3 }],
      resources: ["IRON", "TIMBER", "LEATHER", "GLASS", "GRAIN"]
    });
    expect(result.gross.building).toBe(4_300);
  });

  it("Sayım ve Vergi Dairesi bonusunu yalnız halk vergisine uygular", () => {
    const result = calculateCategorizedIncome({
      ...base,
      taxIncome: 1_000,
      landTradeIncome: 1_000,
      buildings: [{ buildingType: "census_tax_office", level: 3 }]
    });
    expect(result.gross).toEqual({ building: 2_000, tax: 1_500, landTrade: 1_000, seaTrade: 0 });
  });

  it("Sv3 atölye bonusunu yalnızca güçlendirilmiş topçu adedine uygular", () => {
    const assets = { catapult: 2, ballista: 2 };
    const targets = { catapult: "WALL", ballista: "WALL" } as const;
    const standard = rollSiegeSupport(assets, targets, () => 0);
    const partlyEnhanced = rollSiegeSupport(assets, targets, () => 0, { catapult: 1 });
    expect(partlyEnhanced.wallDamage - standard.wallDamage).toBe(40);
  });
});
