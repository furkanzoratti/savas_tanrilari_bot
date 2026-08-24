import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";
import { renderDocument } from "./document.js";
import type { CountryDocument } from "../services/game-service.js";

describe("kültür ve yerleşke kartı", () => {
  it("yerleşke oluşturma ve kültür değiştirme komutlarını kaydeder", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    const create = admin?.options?.find((option) => option.name === "yerleske-ekle");
    const culture = create?.options?.find((option) => option.name === "kultur") as { autocomplete?: boolean } | undefined;
    expect(culture?.autocomplete).toBe(true);
    expect(admin?.options?.some((option) => option.name === "kultur-ayarla")).toBe(true);
  });

  it("sabit garnizon ile seferberlik ordusunu ayrı ve açık başlıklarla gösterir", () => {
    const emptyIncome = { building: 0, tax: 0, landTrade: 0, seaTrade: 0 };
    const document = {
      guild: { current_turn: 3, turn_phase: "OPEN" },
      country: { name: "Roma", treasury: 10_000, mobilization: "PEACE" },
      playerIds: ["123"], freePopulation: 100_000, militaryUsed: 2_000, militaryLimit: 7_500,
      totalGrossIncome: 1_000, totalPayableIncome: 1_000, totalIncomeBreakdown: emptyIncome,
      totalUpkeep: 100, netIncome: 900, tradeAgreements: [],
      settlements: [{
        id: "city", country_id: "country", name: "Roma", population: 100_000, slave_population: 0,
        base_income: 1_000, tax_income: 0, land_trade_income: 0, sea_trade_income: 0,
        base_population_growth: 100, manual_flat_income: 0, manual_income_percent: 0,
        ruin_stage: 0, resource_type: "GRAIN", culture_group: "ITALIC", garrison_level: 3, local_treasury: 500, base_land_trade_income: 2_000,
        is_conquered: false, conquered_turn: null, grossIncome: 1_000, payableIncome: 1_000,
        incomeBreakdown: emptyIncome, buildingIncomeBonus: emptyIncome, buildingUpkeep: 0,
        unitUpkeep: 100, shipUpkeep: 0, totalSettlementUpkeep: 100, populationGain: 100,
        militaryUsed: 1_400, militaryLimit: 7_500, slotLimit: 10, effectiveResources: ["GRAIN"], buildings: [], ships: [], siegeAssets: [],
        pendingRecruitment: [], pendingShips: [],
        units: [
          { unit_type: "light_infantry", quantity: 400, status: "GARRISON", force_type: "GARRISON" },
          { unit_type: "heavy_infantry", quantity: 1_000, status: "GARRISON", force_type: "ARMY" }
        ]
      }]
    } as unknown as CountryDocument;

    const embeds = renderDocument(document);
    expect(embeds).toHaveLength(2);
    const fields = embeds[1]!.data.fields ?? [];
    expect(fields.map((field) => field.name)).toEqual(expect.arrayContaining(["🏺 Kültür", "🛡️ Garnizon", "⚔️ Ordu"]));
    expect(fields.find((field) => field.name === "🏺 Kültür")?.value).toContain("İtalik");
    expect(fields.find((field) => field.name === "⚔️ Ordu")?.value).not.toContain("Yerleşkede");
    expect(fields.find((field) => field.name === "👥 Nüfus")?.value).not.toContain("Sonraki Alım");
    expect(fields.find((field) => field.name === "💰 Gelir Kalemleri")?.value).toContain("Toplam:");
    expect(fields.find((field) => field.name === "💰 Gelir Kalemleri")?.value).not.toContain("Tahsil edilecek");
    expect(fields.find((field) => field.name === "🏦 Yerel Hazine")?.value).toContain("500 Altın");
    expect(fields.find((field) => field.name === "🎖️ Ordu Limiti")?.value).toContain("7.500");
    expect(fields.find((field) => field.name === "💰 Gelir Kalemleri")?.value).not.toContain("Deniz Ticareti");
  });
});
