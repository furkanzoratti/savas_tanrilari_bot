import { describe, expect, it } from "vitest";
import { commandBuilders } from "../discord/commands.js";
import { migrations } from "../db/migrations.js";
import { calculateCategorizedIncome } from "./income.js";
import { FORMABLE_COUNTRIES, formableBuildingDiscount, formableUnitDiscount } from "./formable-countries.js";
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

  it("formlama geçmişi için kalıcı migration içerir", () => {
    const migration = migrations.find((item) => item.version === 31);
    expect(migration?.name).toBe("formable_country_identities");
    expect(migration?.sql).toContain("active_formable_key");
    expect(migration?.sql).toContain("UNIQUE(country_id, formable_key)");
  });
});
