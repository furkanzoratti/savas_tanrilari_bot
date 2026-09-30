import {describe,expect,it} from "vitest";
import {dominantReligion,RELIGIONS,SECONDARY_RELIGIONS,religionEffectScale,religionModifiers,religionUnitDiscount,secondaryReligionEffectScale} from "./religions.js";
import {calculatePopulationGain,calculateShipUpkeep,calculateUnitUpkeep} from "./economy.js";
import {calculateCategorizedIncome} from "./income.js";

describe("din sistemi",()=>{
  it("yerel etkiyi bağlılık eşiğine göre uygular",()=>{
    expect(religionEffectScale(80)).toBe(1);
    expect(religionEffectScale(75)).toBe(.5);
    expect(religionEffectScale(50)).toBe(.5);
    expect(religionEffectScale(49)).toBe(0);
  });
  it("ikinci mezhep etkisini kalan nüfus payına göre uygular",()=>{
    expect(secondaryReligionEffectScale(25)).toBe(1);
    expect(secondaryReligionEffectScale(20)).toBe(.5);
    expect(secondaryReligionEffectScale(10)).toBe(.5);
    expect(secondaryReligionEffectScale(9)).toBe(0);
    expect(Object.keys(SECONDARY_RELIGIONS)).toHaveLength(Object.keys(RELIGIONS).length);
  });
  it("ülke etkisini özgür nüfusun en az yüzde 75'i aynı dine bağlıysa açar",()=>{
    expect(dominantReligion([
      {religion_key:"HELLENIC_FAITH",religion_adherence_percent:75,population:100_000}
    ])).toMatchObject({key:"HELLENIC_FAITH"});
    expect(dominantReligion([
      {religion_key:"HELLENIC_FAITH",religion_adherence_percent:74,population:100_000}
    ])).toBeNull();
  });
  it("yerel ve baskın ülke etkilerini birleştirir",()=>{
    const modifiers=religionModifiers("GERMANIC_FAITH",75,"GERMANIC_FAITH");
    expect(religionUnitDiscount(modifiers.unitPurchaseDiscounts,"heavy_infantry")).toBeCloseTo(.045);
    expect(religionUnitDiscount(modifiers.unitUpkeepDiscounts,"heavy_infantry")).toBeCloseTo(.03);
    expect(Object.keys(RELIGIONS).length).toBeGreaterThanOrEqual(29);
  });
  it("gelir, nüfus ve bakım formüllerine gerçek mekanik etki uygular",()=>{
    const religion=religionModifiers("PUNIC_FAITH",75,"PUNIC_FAITH");
    const income=calculateCategorizedIncome({
      settlementIncome:0,taxIncome:0,landTradeIncome:0,seaTradeIncome:1_000,
      manualFlatIncome:0,manualIncomePercent:0,buildings:[],ruinStage:0,religion
    });
    expect(income.gross.seaTrade).toBe(1_040);
    expect(calculateShipUpkeep("trireme",1,"ACTIVE","PEACE",false,religion.shipUpkeepDiscount)).toBe(146);
    const germanic=religionModifiers("GERMANIC_FAITH",75,"GERMANIC_FAITH");
    expect(calculateUnitUpkeep("heavy_infantry",1_000,"GARRISON","PEACE",[],false,religionUnitDiscount(germanic.unitUpkeepDiscounts,"heavy_infantry"))).toBe(437);
    expect(calculatePopulationGain({population:100_000,buildings:[],ruinStage:0,mobilization:"PEACE",religionPopulationGrowthPercent:.06})).toBe(2_120);
  });
});
