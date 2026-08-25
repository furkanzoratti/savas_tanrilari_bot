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
  it("nüfus artsa bile yerleşke bina slotunu altıyla sınırlar", () => {
    expect(buildingSlotLimit(20_000)).toBe(2);
    expect(buildingSlotLimit(40_000)).toBe(4);
    expect(buildingSlotLimit(200_000)).toBe(6);
  });

  it("Köle Kampı gelirini yerleşkenin köle nüfusu üzerinden hesaplar", () => {
    const result = calculateCategorizedIncome({
      ...base,
      slavePopulation: 2_000,
      buildings: [{ buildingType: "slave_camp", level: 2 }]
    });
    expect(result.gross.building).toBe(600);
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
    expect(result.gross.building).toBe(400);
    expect(incomeTotal(result.gross)).toBe(1_400);
  });

  it("Agora tüccar atamasını şehir gelirine yüzde on olarak işler", () => {
    const result = calculateCategorizedIncome({
      ...base,
      taxIncome: 1_000,
      landTradeIncome: 1_000,
      buildings: [{ buildingType: "agora", level: 2 }],
      assignedMerchant: true
    });
    expect(result.gross.building).toBe(1_300);
    expect(incomeTotal(result.gross)).toBe(3_300);
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
    expect(result.gross.seaTrade).toBe(1_725);
    expect(result.gross.building).toBe(0);
  });

  it("bina ve hammadde kaynaklı toplam yüzdesel geliri yüzde 75 ile sınırlar", () => {
    const result = calculateCategorizedIncome({
      ...base,
      taxIncome: 1_000,
      landTradeIncome: 1_000,
      seaTradeIncome: 1_000,
      buildings: [
        { buildingType: "trade_guild", level: 3 },
        { buildingType: "lupanar", level: 3 },
        { buildingType: "agora", level: 3 }
      ],
      resources: ["GOLD", "SPICES"],
      assignedMerchant: true
    });
    expect(result.gross.building).toBe(7_500);
    expect(incomeTotal(result.gross)).toBe(10_500);
  });

  it("Sv3 atölye bonusunu yalnızca güçlendirilmiş topçu adedine uygular", () => {
    const assets = { catapult: 2, ballista: 2 };
    const targets = { catapult: "WALL", ballista: "WALL" } as const;
    const standard = rollSiegeSupport(assets, targets, () => 0);
    const partlyEnhanced = rollSiegeSupport(assets, targets, () => 0, { catapult: 1 });
    expect(partlyEnhanced.wallDamage - standard.wallDamage).toBe(40);
  });
});
