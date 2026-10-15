import { describe, expect, it } from "vitest";
import {
  ESPIONAGE_PREPARATIONS, ESPIONAGE_TARGETS, PLAYER_ESPIONAGE_TARGETS,
  espionageOperationSeverity, espionageSeverity, isAssassinationTarget, isCharacterPersonalTarget, isKidnappingTarget,
  isNoblePersonalTarget, sabotageDuration
} from "./espionage.js";

describe("casusluk kuralları", () => {
  it("başarı farkını hafif, orta ve ağır sonuçlara ayırır", () => {
    expect(espionageSeverity(0)).toBe("NONE");
    expect(espionageSeverity(1)).toBe("LIGHT");
    expect(espionageSeverity(5)).toBe("MEDIUM");
    expect(espionageSeverity(9)).toBe("HEAVY");
  });

  it("soylu kaçırmada en az 12 başarı farkı ister", () => {
    expect(espionageOperationSeverity("NOBLE_KIDNAP",11,true)).toBe("NONE");
    expect(espionageOperationSeverity("NOBLE_KIDNAP",12,true)).toBe("HEAVY");
    expect(espionageOperationSeverity("KIDNAP",11,true)).toBe("NONE");
    expect(espionageOperationSeverity("CHARACTER_KIDNAP",1,false)).toBe("LIGHT");
    expect(espionageOperationSeverity("NOBLE_ASSASSINATE",1,true)).toBe("LIGHT");
  });

  it("bina kategorilerini ve hazırlık bedellerini sabit tutar", () => {
    expect(ESPIONAGE_TARGETS.NAVAL.buildingTypes).toEqual(["port", "shipyard"]);
    expect(ESPIONAGE_TARGETS.CONSTRUCTION.buildingTypes).toHaveLength(0);
    expect(ESPIONAGE_PREPARATIONS.AGGRESSIVE).toMatchObject({ cost: 2_000, attackBonus: 3, detectionPenalty: 2 });
    expect(sabotageDuration("LIGHT")).toBe(2);
    expect(sabotageDuration("MEDIUM")).toBe(3);
    expect(sabotageDuration("HEAVY")).toBe(0);
  });

  it("oyuncuya yalnız yeni görev listesini açar",()=>{
    expect(PLAYER_ESPIONAGE_TARGETS).toEqual([
      "RECRUITMENT_SABOTAGE","CONSTRUCTION","PRODUCTION_SABOTAGE",
      "INCOME_SABOTAGE","TREASURY_INFILTRATION","INCITE_PUBLIC","AGGRAVATE_EVENT",
      "DESERTION","POISON_GARRISON","DESTROY_SIEGE_SUPPLIES",
      "CHARACTER_ASSASSINATE","CHARACTER_KIDNAP","NOBLE_ASSASSINATE","NOBLE_KIDNAP"
    ]);
    expect(ESPIONAGE_TARGETS.CHARACTER_KIDNAP.label).toBe("Karakter Kaçırma");
    expect(ESPIONAGE_TARGETS.NOBLE_KIDNAP.label).toBe("Soylu Kaçırma");
    expect(ESPIONAGE_TARGETS.CHARACTER_ASSASSINATE.label).toBe("Karakter Suikastı");
    expect(ESPIONAGE_TARGETS.NOBLE_ASSASSINATE.label).toBe("Soylu Suikastı");
    expect(PLAYER_ESPIONAGE_TARGETS).not.toContain("KIDNAP");
    expect(PLAYER_ESPIONAGE_TARGETS).not.toContain("ASSASSINATE");
    expect(PLAYER_ESPIONAGE_TARGETS).not.toContain("SABOTAGE_FLEET");
    expect(PLAYER_ESPIONAGE_TARGETS).not.toContain("TRADE_COLLAPSE");
  });

  it("karakter ve soylu kaçırma/suikast görevlerini kesin hedef sınıfına ayırır", () => {
    expect(isKidnappingTarget("CHARACTER_KIDNAP")).toBe(true);
    expect(isKidnappingTarget("NOBLE_KIDNAP")).toBe(true);
    expect(isAssassinationTarget("CHARACTER_ASSASSINATE")).toBe(true);
    expect(isAssassinationTarget("NOBLE_ASSASSINATE")).toBe(true);
    expect(isCharacterPersonalTarget("CHARACTER_ASSASSINATE")).toBe(true);
    expect(isCharacterPersonalTarget("NOBLE_ASSASSINATE")).toBe(false);
    expect(isNoblePersonalTarget("NOBLE_KIDNAP")).toBe(true);
    expect(isNoblePersonalTarget("CHARACTER_KIDNAP")).toBe(false);
  });
});
