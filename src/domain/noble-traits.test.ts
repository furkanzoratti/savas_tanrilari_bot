import {describe,expect,it} from "vitest";
import {NOBLE_TRAITS,nobleTraitByKey,randomNobleTraitKey} from "./noble-traits.js";

describe("soylu traitleri",()=>{
  it("16 benzersiz traiti doğru kategorilerde tutar",()=>{
    expect(NOBLE_TRAITS).toHaveLength(16);
    expect(new Set(NOBLE_TRAITS.map((trait)=>trait.key)).size).toBe(16);
    expect(NOBLE_TRAITS.filter((trait)=>trait.category==="POSITIVE")).toHaveLength(5);
    expect(NOBLE_TRAITS.filter((trait)=>trait.category==="MIXED")).toHaveLength(7);
    expect(NOBLE_TRAITS.filter((trait)=>trait.category==="NEGATIVE")).toHaveLength(4);
  });

  it("karma ve olumsuz etkileri işaretleriyle korur",()=>{
    expect(nobleTraitByKey("FATIH")?.modifiers.landUpkeepDiscount).toBe(-.05);
    expect(nobleTraitByKey("ZALIM")?.modifiers.rebellionResistance).toBe(-10);
    expect(nobleTraitByKey("SAVURGAN")?.modifiers.buildingCostDiscount).toBe(-.08);
    expect(nobleTraitByKey("KORKAK")?.modifiers.settlementDefenseRoll).toBe(-1);
  });

  it("doğumlarda katalog içinden deterministik seçim yapılabilmesini sağlar",()=>{
    expect(randomNobleTraitKey(()=>0)).toBe("ADIL");
    expect(randomNobleTraitKey((maximum)=>maximum-1)).toBe("KORKAK");
  });
});

