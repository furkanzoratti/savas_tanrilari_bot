import { describe, expect, it } from "vitest";
import { commandBuilders } from "../discord/commands.js";
import { migrations } from "../db/migrations.js";
import { calculateCategorizedIncome } from "./income.js";
import { applyFormableShipUpkeepDiscount, FORMABLE_COUNTRIES, formableBuildingDiscount, formableKeysForTier, formableTier, formableUnitDiscount, missingFormableTerritories } from "./formable-countries.js";
import { unitCostMultiplier } from "./resources.js";

describe("kurulabilir ülkeler", () => {
  it("bütün kurulabilir kimlikleri ve yönetici komutunu sunar", () => {
    expect(formableKeysForTier(1)).toHaveLength(39);
    expect(formableKeysForTier(2)).toHaveLength(16);
    expect(formableKeysForTier(3)).toHaveLength(0);
    const command = commandBuilders.find((item) => item.name === "ulke-formla");
    expect(command?.options?.find((option) => option.name === "tier")?.required).toBe(true);
    expect(command?.options?.find((option) => option.name === "formlanan-ulke")?.autocomplete).toBe(true);
  });

  it("bütün Tier 2 devletleri iki büyük, bir orta ve bir hafif etki taşır", () => {
    for (const key of formableKeysForTier(2)) {
      const definition = FORMABLE_COUNTRIES[key];
      expect(definition.buffs, key).toHaveLength(4);
      expect(definition.effectScales, key).toEqual(["MAJOR", "MAJOR", "MEDIUM", "MINOR"]);
      expect(definition.requiredActiveFormables, key).toBeTruthy();
      expect(formableTier(key)).toBe(2);
    }
  });

  it("At hammaddesini ve ülke süvari indirimini Atlı Okçuya birlikte uygular", () => {
    expect(unitCostMultiplier("horse_archer", ["HORSES"])).toBe(0.90);
    expect(formableUnitDiscount("SARMATIA", "horse_archer" )).toBe(0.10);
    expect(FORMABLE_COUNTRIES.SARMATIA.modifiers.observerManpower).toBe(100);
  });

  it("yeni özel birliklere kurulabilir ülke sınıf indirimlerini uygular", () => {
    for (const unit of ["triarii_veteran", "punic_veteran", "gaesatae", "peltast", "silver_shield", "machimoi_phalangitai"]) {
      expect(formableUnitDiscount("GALLIC_CONFEDERATION", unit), unit).toBe(0.10);
    }
    for (const unit of ["mauryan_war_elephant", "desert_raider", "egyptian_war_chariot"]) {
      expect(formableUnitDiscount("SARMATIA", unit), unit).toBe(0.10);
    }
    expect(formableUnitDiscount("ITALY", "peltast")).toBe(0.05);
    expect(formableUnitDiscount("ITALY", "egyptian_war_chariot")).toBe(0.05);
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
    expect(income.gross.seaTrade).toBe(900);
    expect(FORMABLE_COUNTRIES.BRITANNIA.requiredTerritories.map((territory) => territory.label)).toEqual([
      "Camulodunon","Eborakon","Eildon","Iska","Moridunon"
    ]);
    expect(missingFormableTerritories("BRITANNIA",["Camulodunon","Eborakon","Eildon","Iska","Moridunon"])).toEqual([]);
    expect(missingFormableTerritories("BRITANNIA",["Camulodunon","Eblana"])).toEqual(["Eborakon","Eildon","Iska","Moridunon"]);
  });

  it("Büyük Kartaca'nın liman ve paralı asker etkilerini uygular, kuruluş gemilerini ayrı ödül olarak verir", () => {
    const definition = FORMABLE_COUNTRIES.CARTHAGE;
    expect(definition.name).toBe("Büyük Kartaca");
    expect(definition.buffs).toHaveLength(3);
    expect(definition.modifiers).toMatchObject({
      buildingIncomePercent:{ port:0.20 },mercenaryHireDiscount:0.10,mercenaryUpkeepDiscount:0.10
    });
    expect(definition.modifiers.shipyardPointBonus).toBeUndefined();
    expect(definition.foundingReward.shipsPerActiveShipyard).toEqual({shipType:"kerkouros",quantity:2});
    const income = calculateCategorizedIncome({
      settlementIncome:0,taxIncome:0,landTradeIncome:0,seaTradeIncome:0,
      manualFlatIncome:0,manualIncomePercent:0,ruinStage:0,
      buildings:[{ buildingType:"port",level:1 }],formableKey:"CARTHAGE"
    });
    expect(income.gross.seaTrade).toBe(900);
  });

  it("Pön İmparatorluğu Büyük Kartaca bölgesinin dengeli Tier 2 devamıdır", () => {
    const definition = FORMABLE_COUNTRIES.PUNIC_EMPIRE;
    expect(definition.name).toBe("Pön İmparatorluğu");
    expect(definition.requiredActiveFormables).toEqual(["CARTHAGE", "MAURETANIA", "LIBYA"]);
    expect(definition.modifiers).toMatchObject({
      shipDiscount:0.20,shipUpkeepDiscount:0.20,mercenaryHireDiscount:0.20,
      mercenaryUpkeepDiscount:0.20,buildingIncomePercent:{port:0.25},shipTransportMultiplier:1.15
    });
  });

  it("Akdeniz Ligi hedef topraklarını ve deniz-ticaret bonuslarını uygular", () => {
    const definition = FORMABLE_COUNTRIES.MEDITERRANEAN_LEAGUE;
    expect(definition.name).toBe("Akdeniz Ligi");
    expect(definition.requiredTerritories.map((territory) => territory.label)).toEqual(["Kıbrıs", "Rodos", "Hierapytna"]);
    expect(missingFormableTerritories("MEDITERRANEAN_LEAGUE", ["Salamis", "Rodos", "Hierapytna"])).toEqual([]);
    expect(missingFormableTerritories("MEDITERRANEAN_LEAGUE", ["Rodos"])).toEqual(["Kıbrıs", "Hierapytna"]);
    expect(definition.modifiers).toMatchObject({
      seaTradeIncomePercent: 0.10,
      shipDiscount: 0.10,
      shipUpkeepDiscount: 0.10,
      shipTransportMultiplier: 1.10
    });
    expect(applyFormableShipUpkeepDiscount(1_000, "MEDITERRANEAN_LEAGUE")).toBe(900);

    const income = calculateCategorizedIncome({
      settlementIncome: 0, taxIncome: 0, landTradeIncome: 0, seaTradeIncome: 1_000,
      manualFlatIncome: 0, manualIncomePercent: 0, ruinStage: 0,
      buildings: [], formableKey: "MEDITERRANEAN_LEAGUE"
    });
    expect(income.gross.seaTrade).toBe(1_100);
  });

  it("Büyük Britanya yalnızca kendi dört Tier 2 etkisini taşır ve Tier 1 ile birikmez", () => {
    const definition = FORMABLE_COUNTRIES.GREAT_BRITAIN;
    expect(definition.buffs).toHaveLength(4);
    expect(definition.modifiers).toMatchObject({
      shipDiscount: 0.30, shipUpkeepDiscount: 0.30, archerSlingerDiscount: 0.10,
      buildingIncomePercent: { port: 0.20 }, shipTransportMultiplier: 1.20,
      britonLongbowDamageBonusPerThousand: 1, stabilityRiskReduction: 10
    });
    expect(definition.modifiers.navalClashBonus).toBeUndefined();
    expect(definition.requiredActiveFormables).toEqual(["BRITANNIA"]);
    expect(missingFormableTerritories("GREAT_BRITAIN",["Camulodunon","Eborakon","Eildon","Iska","Moridunon","Eblana"])).toEqual([]);
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
