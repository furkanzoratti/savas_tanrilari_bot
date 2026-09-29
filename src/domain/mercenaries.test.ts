import { describe, expect, it } from "vitest";
import { MERCENARY_COMPANIES, MERCENARY_CONTRACT_LIMITS, importedMercenarySchedule, mercenaryContractSchedule, mercenaryPersonnel, mercenaryPriceTerms, mercenarySlotCost, mercenarySlotsUsed, mercenaryTerminationUpkeep, mercenaryTier } from "./mercenaries.js";

describe("paralı asker sözleşmeleri", () => {
  it("ikinci turda yapılan sözleşmenin ilk bakımını üçüncü tura koyar", () => {
    expect(mercenaryContractSchedule(2)).toEqual({ arrivalTurn: 3, firstUpkeepTurn: 3 });
  });

  it("manuel devralınan şirketten ilk bakımı sonraki turda alır", () => {
    expect(importedMercenarySchedule(8)).toEqual({ hiredTurn: 7, arrivalTurn: 8, lastUpkeepTurn: 8, firstUpkeepTurn: 9 });
  });

  it("her seferberlik düzeyinde iki paralı asker slotu verir", () => {
    expect(MERCENARY_CONTRACT_LIMITS).toEqual({ PEACE: 2, PARTIAL: 2, GENERAL: 2 });
  });

  it("Alım Turunda kiralanıp iki tur sonra feshedilen şirkete iki bölümlük bakım uygular", () => {
    expect(mercenaryTerminationUpkeep({ turnUpkeep: 1_300, hiredTurn: 6, currentTurn: 8, acquisitionInterval: 3, lastUpkeepTurn: null, unpaid: false }))
      .toEqual({ amount: 867, chargedTurns: 2 });
  });

  it("bakımı daha önce alınmış şirkete fesihte ikinci kez bakım yazmaz", () => {
    expect(mercenaryTerminationUpkeep({ turnUpkeep: 1_300, hiredTurn: 5, currentTurn: 8, acquisitionInterval: 3, lastUpkeepTurn: 6, unpaid: false }))
      .toEqual({ amount: 0, chargedTurns: 0 });
  });
  it("Tier 1 ve Tier 2 şirketleri standart bileşimleriyle saklar", () => {
    expect(Object.keys(MERCENARY_COMPANIES)).toHaveLength(34);
    expect(MERCENARY_COMPANIES.hellas_breach_company.siege).toEqual({ ram: 1, ladder_group: 1, siege_tower: 1 });
    expect(mercenaryPersonnel(MERCENARY_COMPANIES.aegean_free_fleet)).toBe(500);
    expect(MERCENARY_COMPANIES.heirs_of_ten_thousand.land).toEqual({ light_infantry: 3000, spear: 2500, archer: 1500, heavy_infantry: 1500, light_cavalry: 1000 });
    expect(MERCENARY_COMPANIES.tyrian_grand_siege_company.siege).toEqual({ ballista: 4, catapult: 2, mantlet: 10, siege_tower: 2 });
    expect(MERCENARY_COMPANIES.phoenician_grand_war_fleet.ships).toEqual({ trireme: 8, quinquereme: 6 });
  });

  it("iki Tier 1 veya tek Tier 2 şirketin iki slotu doldurmasını sağlar", () => {
    expect(mercenaryTier(MERCENARY_COMPANIES.arkadian_mountain_watch)).toBe(1);
    expect(mercenaryTier(MERCENARY_COMPANIES.heirs_of_ten_thousand)).toBe(2);
    expect(mercenarySlotCost(MERCENARY_COMPANIES.arkadian_mountain_watch)).toBe(1);
    expect(mercenarySlotCost(MERCENARY_COMPANIES.heirs_of_ten_thousand)).toBe(2);
    expect(mercenarySlotsUsed(["arkadian_mountain_watch", "rhodian_lead_storm"])).toBe(2);
    expect(mercenarySlotsUsed(["heirs_of_ten_thousand"])).toBe(2);
  });

  it("Tier 2 kiralama ve üç turluk bakım fiyatlarını dengeli tutar", () => {
    expect(MERCENARY_COMPANIES.heirs_of_ten_thousand).toMatchObject({ hireCost: 15_050, turnUpkeep: 3_225 });
    expect(MERCENARY_COMPANIES.hellenic_grand_sarissa_army).toMatchObject({ hireCost: 16_625, turnUpkeep: 3_563 });
    expect(MERCENARY_COMPANIES.galatian_grand_war_host).toMatchObject({ hireCost: 17_500, turnUpkeep: 3_750 });
    expect(MERCENARY_COMPANIES.sarmatian_iron_horde).toMatchObject({ hireCost: 19_425, turnUpkeep: 4_163 });
    expect(MERCENARY_COMPANIES.iberian_grand_shield_army).toMatchObject({ hireCost: 18_200, turnUpkeep: 3_900 });
    expect(MERCENARY_COMPANIES.eastern_silver_expedition).toMatchObject({ hireCost: 19_250, turnUpkeep: 4_125 });
  });

  it("Altın erişimi ile ülke paralı asker indirimlerini kiralamada toplar, bakımda ülke etkisini uygular", () => {
    expect(mercenaryPriceTerms({
      company:{ name:"Test",category:"CHEAP",hireCost:10_000,turnUpkeep:2_000 },
      hasGoldAccess:true,countryHireDiscount:0.10,countryUpkeepDiscount:0.10
    })).toEqual({ hireCost:8_000,turnUpkeep:1_800,hireDiscountPercent:20,upkeepDiscountPercent:10 });
  });
});
