import {describe,expect,it} from "vitest";
import {
  GREAT_PROJECTS,aggregateGreatProjectModifiers,applyGreatProjectIncome,greatProjectForSettlement,
  greatProjectShipPurchaseDiscount,greatProjectUnitPurchaseDiscount
} from "./great-projects.js";

describe("yerleşkeye bağlı büyük projeler",()=>{
  it("50 benzersiz proje ve yerleşke eşleşmesi içerir",()=>{
    expect(GREAT_PROJECTS).toHaveLength(50);
    expect(new Set(GREAT_PROJECTS.map((item)=>item.key)).size).toBe(50);
    expect(greatProjectForSettlement("Roma")?.name).toBe("Kolezyum");
    expect(greatProjectForSettlement("Xianbei Dağı Ordugahı")?.key).toBe("XIANBEI_GREAT_CAMP");
    expect(greatProjectForSettlement("Pantikapaion")?.key).toBe("PANTICAPAION_ACROPOLIS");
  });

  it("tüm maliyetlere 10.000 Altın indirimi uygular ve inşaat süresini sabit 6 tur tutar",()=>{
    for(const item of GREAT_PROJECTS){
      expect(item.cost).toBeGreaterThanOrEqual(45_000);
      expect(item.cost).toBeLessThanOrEqual(70_000);
      expect(item.duration).toBe(6);
    }
    expect(greatProjectForSettlement("Roma")?.cost).toBe(70_000);
    expect(greatProjectForSettlement("Baykal Kışlağı")?.cost).toBe(45_000);
  });

  it("ülke etkilerini toplar ve güvenli tavanları uygular",()=>{
    const modifiers=aggregateGreatProjectModifiers(["COLOSSEUM","CAMULODUNON_OPPIDUM","XIANBEI_GREAT_CAMP","OTUKEN_SANCTUARY"]);
    expect(modifiers.unitPurchaseDiscount).toBe(.20);
    expect(modifiers.militaryLimitPercent).toBe(.03);
    expect(modifiers.rebellionResistance).toBe(20);
    expect(greatProjectUnitPurchaseDiscount("heavy_infantry",modifiers)).toBe(.20);
  });

  it("Taxila kapasite, görev zarı ve ek uzmanlık etkisini birlikte verir",()=>{
    const modifiers=aggregateGreatProjectModifiers(["TAXILA_GREAT_ACADEMY"]);
    expect(modifiers.characterCapacity).toBe(15);
    expect(modifiers.taskRollBonus?.DIPLOMAT).toBe(1);
    expect(modifiers.taskRollBonus?.SPY).toBe(1);
    expect(modifiers.successfulTaskExtraProgress).toBe(1);
  });

  it("gelir ve özel gemi indirimini doğru uygular",()=>{
    const modifiers=aggregateGreatProjectModifiers(["CARTHAGE_COTHON","CORDUBA_BRIDGE"]);
    const income=applyGreatProjectIncome({building:100,tax:100,landTrade:100,seaTrade:100},modifiers);
    expect(income.landTrade).toBe(115);
    expect(income.seaTrade).toBe(115);
    expect(greatProjectShipPurchaseDiscount("trireme",modifiers)).toBe(.12);
  });
});
