import { describe, expect, it } from "vitest";
import { commandBuilders } from "../discord/commands.js";
import { migrations } from "../db/migrations.js";
import { calculateCategorizedIncome } from "./income.js";
import { applyFormableShipUpkeepDiscount, FORMABLE_COUNTRIES, formableBuildingDiscount, formableUnitDiscount } from "./formable-countries.js";
import { unitCostMultiplier } from "./resources.js";

describe("kurulabilir ülkeler", () => {
  it("bütün kurulabilir kimlikleri ve yönetici komutunu sunar", () => {
    expect(Object.keys(FORMABLE_COUNTRIES).length).toBeGreaterThanOrEqual(35);
    const command = commandBuilders.find((item) => item.name === "ulke-formla");
    expect(command?.options?.find((option) => option.name === "formlanan-ulke")?.autocomplete).toBe(true);
  });

  it("At hammaddesini ve ülke süvari indirimini Atlı Okçuya birlikte uygular", () => {
    expect(unitCostMultiplier("horse_archer", ["HORSES"])).toBe(0.90);
    expect(formableUnitDiscount("SARMATIA", "horse_archer" )).toBe(0.10);
    expect(FORMABLE_COUNTRIES.SARMATIA.modifiers.observerManpower).toBe(100);
  });

  it("ülkeye özgü bina ve gelir bonuslarını hesaplar", () => {
    expect(formableBuildingDiscount("IBERIA", "engineering")).toBe(0.10);
    const hellas = calculateCategorizedIncome({
      settlementIncome: 0, taxIncome: 0, landTradeIncome: 0, seaTradeIncome: 0,
      manualFlatIncome: 0, manualIncomePercent: 0, ruinStage: 0,
      buildings: [{ buildingType: "academy", level: 1 }, { buildingType: "agora", level: 1 }],
      formableKey: "HELLAS"
    });
    expect(hellas.buildingUpkeep).toBe(250);
    expect(hellas.gross.building).toBe(550);
  });

  it("Britanya'nın yeni denizcilik, menzilli birlik ve liman bonuslarını uygular", () => {
    expect(FORMABLE_COUNTRIES.BRITANNIA.buffs).toHaveLength(3);
    expect(FORMABLE_COUNTRIES.BRITANNIA.modifiers.shipDiscount).toBe(0.30);
    expect(formableUnitDiscount("BRITANNIA", "archer")).toBe(0.10);
    expect(formableUnitDiscount("BRITANNIA", "slinger")).toBe(0.10);
    expect(formableUnitDiscount("BRITANNIA", "briton_longbow")).toBe(0.10);
    expect(formableUnitDiscount("BRITANNIA", "heavy_infantry")).toBe(0);
    expect(applyFormableShipUpkeepDiscount(150, "BRITANNIA")).toBe(105);
    expect(applyFormableShipUpkeepDiscount(75, "BRITANNIA")).toBe(53);

    const income = calculateCategorizedIncome({
      settlementIncome: 0, taxIncome: 0, landTradeIncome: 0, seaTradeIncome: 0,
      manualFlatIncome: 0, manualIncomePercent: 0, ruinStage: 0,
      buildings: [{ buildingType: "port", level: 1 }],
      formableKey: "BRITANNIA"
    });
    expect(income.gross.seaTrade).toBe(600);
  });

  it("Büyük Britanya Britanya mirasını ve üç üst devlet bonusunu birlikte taşır", () => {
    const definition = FORMABLE_COUNTRIES.GREAT_BRITAIN;
    expect(definition.buffs).toHaveLength(6);
    expect(definition.modifiers).toMatchObject({
      shipDiscount: 0.30, shipUpkeepDiscount: 0.30, archerSlingerDiscount: 0.10,
      buildingIncomePercent: { port: 0.20 }, shipTransportMultiplier: 1.20,
      navalClashBonus: 1, britonLongbowDamageBonusPerThousand: 1, stabilityRiskReduction: 10
    });
    expect(formableUnitDiscount("GREAT_BRITAIN", "briton_longbow")).toBe(0.10);
    expect(applyFormableShipUpkeepDiscount(150, "GREAT_BRITAIN")).toBe(105);
  });

  it("formlama geçmişi için kalıcı migration içerir", () => {
    const migration = migrations.find((item) => item.version === 31);
    expect(migration?.name).toBe("formable_country_identities");
    expect(migration?.sql).toContain("active_formable_key");
    expect(migration?.sql).toContain("UNIQUE(country_id, formable_key)");
  });
});
