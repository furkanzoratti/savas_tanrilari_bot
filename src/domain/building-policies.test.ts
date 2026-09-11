import { describe, expect, it } from "vitest";
import {
  BUILDABLE_BUILDINGS, BUILDING_CATEGORIES, BUILDINGS, CITY_POLICIES, buildingBaseCost,
  caravanseraiForeignConcessionBonus, rawMaterialProduction
} from "./catalog.js";

describe("bina kategorileri ve fiyatları", () => {
  it("her binayı kategoriye bağlar ve kategori fiyatını uygular", () => {
    expect(BUILDING_CATEGORIES[BUILDINGS.trade_guild!.category].label).toBe("Yüzdesel Ekonomi");
    expect(buildingBaseCost("trade_guild", 1)).toBe(3_000);
    expect(buildingBaseCost("farm", 2)).toBe(4_000);
    expect(buildingBaseCost("slave_camp", 3)).toBe(6_000);
    expect(buildingBaseCost("engineering", 3)).toBe(7_000);
  });

  it("kaldırılan Lupanarı oyuncu ve yönetici bina listelerinden çıkarır", () => {
    expect(BUILDABLE_BUILDINGS.some((building) => building.key === "lupanar")).toBe(false);
    expect(BUILDABLE_BUILDINGS.map((building) => building.key)).toEqual(expect.arrayContaining([
      "inns_baths", "caravanserai", "customs_house", "artisans_quarter", "census_tax_office", "raw_material"
    ]));
  });

  it("Tüccar Loncası İznini kaldırılan Lupanar yerine Kervansaraya bağlar", () => {
    expect(CITY_POLICIES.MERCHANT_LICENSE.description).toContain("Kervansaray");
    expect(CITY_POLICIES.MERCHANT_LICENSE.description).not.toContain("Lupanar");
  });

  it("nihai ekonomi ve altyapı etkilerini seviyelerine göre saklar", () => {
    expect(BUILDINGS.trade_guild.levels).toEqual({
      1: { incomePercent: 0.10, flatIncome: 750 },
      2: { incomePercent: 0.20, flatIncome: 1_400 },
      3: { incomePercent: 0.30, flatIncome: 2_800 }
    });
    expect(BUILDINGS.farm.levels).toEqual({
      1: { flatIncome: 750 }, 2: { flatIncome: 1_500 }, 3: { flatIncome: 3_000 }
    });
    expect(BUILDINGS.agora.levels).toEqual({
      1: { flatIncome: 500 }, 2: { flatIncome: 1_250 }, 3: { flatIncome: 2_500 }
    });
    expect(BUILDINGS.healer.levels).toEqual({
      1: { populationRate: 0.02, flatIncome: 250 },
      2: { populationRate: 0.05, flatIncome: 500 },
      3: { populationRate: 0.10, flatIncome: 1_500 }
    });
    expect(BUILDINGS.port).toMatchObject({
      maxLevel: 3,
      levels: { 1: { flatIncome: 750 }, 2: { flatIncome: 1_500 }, 3: { flatIncome: 3_000 } }
    });
  });

  it("yeni ekonomi binalarını ve hammadde üretimini nihai değerlerle saklar", () => {
    expect(BUILDINGS.inns_baths.levels[3]).toEqual({ flatIncome: 3_000, populationPercent: 0.15 });
    expect(BUILDINGS.caravanserai.levels[2]).toEqual({ flatIncome: 1_000, landTradePercent: 0.30 });
    expect(BUILDINGS.customs_house.levels[3]).toEqual({ flatIncome: 1_500, seaIncomePercent: 0.60 });
    expect(BUILDINGS.artisans_quarter.levels[2]).toEqual({ flatIncome: 1_500 });
    expect(BUILDINGS.census_tax_office.levels).toEqual({
      1: { flatIncome: 500, taxIncomePercent: 0.15 },
      2: { flatIncome: 1_000, taxIncomePercent: 0.30 },
      3: { flatIncome: 2_000, taxIncomePercent: 0.50 }
    });
    expect(BUILDINGS.raw_material.category).toBe("FLAT_ECONOMY");
    expect([0, 1, 2, 3].map(rawMaterialProduction)).toEqual([2, 4, 6, 8]);
    expect([0, 1, 2, 3].map(caravanseraiForeignConcessionBonus)).toEqual([0, 0.05, 0.10, 0.15]);
  });
});
