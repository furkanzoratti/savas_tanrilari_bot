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
      characters: [
        { name: "Aurelius", role: "COMMANDER", skill_bonus: 0, assignment: "CURIA", assigned_settlement_name: "Ordusal" },
        { name: "Lycinia", role: "MERCHANT", skill_bonus: 1, assignment: "AGORA", assigned_settlement_name: "Ordusal" }
      ],
      totalGrossIncome: 1_000, totalPayableIncome: 1_000, totalIncomeBreakdown: emptyIncome,
      totalUpkeep: 100, netIncome: 900, tradeAgreements: [],
      allies: [{ id: "kartaca", name: "Kartaca" }],
      pacts: [{ id: "pakt", name: "Akdeniz Birliği", purpose: "Ticaret güvenliği", founder_name: "Roma" }],
      settlements: [{
        id: "city", country_id: "country", name: "Roma", population: 100_000, slave_population: 0,
        base_income: 1_000, tax_income: 0, land_trade_income: 0, sea_trade_income: 0,
        base_population_growth: 100, manual_flat_income: 0, manual_income_percent: 0,
        ruin_stage: 0, resource_type: "GRAIN", culture_group: "ITALIC", garrison_level: 3, local_treasury: 500, base_land_trade_income: 2_000,
        is_conquered: false, conquered_turn: null, black_market_active: true, epidemic_active: true,
        unrest_active: false, rebellion_active: false, grossIncome: 1_000, payableIncome: 1_000,
        incomeBreakdown: emptyIncome, buildingIncomeBonus: emptyIncome, buildingUpkeep: 0,
        unitUpkeep: 100, shipUpkeep: 0, totalSettlementUpkeep: 100, populationGain: 100,
        militaryUsed: 1_400, militaryLimit: 7_500, slotLimit: 10, effectiveResources: ["GRAIN"],
        buildings: [
          { building_type: "academy", level: 1, status: "ACTIVE" },
          { building_type: "trade_guild", level: 1, status: "ACTIVE" }
        ], ships: [], siegeAssets: [],
        pendingRecruitment: [], pendingShips: [],
        units: [
          { unit_type: "light_infantry", quantity: 400, status: "GARRISON", force_type: "GARRISON" },
          { unit_type: "heavy_infantry", quantity: 200, status: "GARRISON", force_type: "GARRISON" },
          { unit_type: "heavy_infantry", quantity: 1_000, status: "GARRISON", force_type: "ARMY" }
        ]
      }]
    } as unknown as CountryDocument;

    const embeds = renderDocument(document);
    expect(embeds).toHaveLength(2);
    const fields = embeds[1]!.data.fields ?? [];
    const countryFields = embeds[0]!.data.fields ?? [];
    expect(fields.map((field) => field.name)).toEqual(expect.arrayContaining(["🏺 Kültür", "🚨 Aktif Yerleşke Olayları", "🛡️ Garnizon", "⚔️ Ordu"]));
    expect(fields.find((field) => field.name === "🚨 Aktif Yerleşke Olayları")?.value).toContain("Karaborsa");
    expect(fields.find((field) => field.name === "🚨 Aktif Yerleşke Olayları")?.value).toContain("Salgın");
    expect(fields.find((field) => field.name === "🏺 Kültür")?.value).toContain("İtalik");
    expect(fields.find((field) => field.name === "⚔️ Ordu")?.value).not.toContain("Yerleşkede");
    expect(fields.find((field) => field.name === "🛡️ Garnizon")?.value).toContain("**200** Ağır Piyade");
    expect(fields.find((field) => field.name === "🏗️ Binalar ve İnşaatlar")?.value).toContain("Akademi Sv1");
    expect(fields.find((field) => field.name === "🏗️ Binalar ve İnşaatlar")?.value).not.toContain("Kamu ve Altyapı");
    expect(fields.find((field) => field.name === "🏗️ Binalar ve İnşaatlar")?.value).not.toContain("Yüzdesel Ekonomi");
    expect(countryFields.find((field) => field.name === "🛡️ Müttefikler")?.value).toContain("Kartaca");
    expect(countryFields.find((field) => field.name === "🏛️ Üye Olunan Paktlar")?.value).toContain("Akdeniz Birliği");
    const officials = countryFields.find((field) => field.name === "🎓 Devlet Görevlileri")?.value;
    expect(officials).toContain("↳ Curia");
    expect(officials).toContain("↳ Agora / Forum");
    expect(officials).not.toContain("Ordusal");
    expect(fields.find((field) => field.name === "👥 Nüfus")?.value).not.toContain("Sonraki Alım");
    expect(fields.find((field) => field.name === "💰 Gelir Kalemleri")?.value).toContain("Toplam:");
    expect(fields.find((field) => field.name === "💰 Gelir Kalemleri")?.value).not.toContain("Tahsil edilecek");
    expect(fields.find((field) => field.name === "🏦 Yerel Hazine")?.value).toContain("500 Altın");
    expect(fields.find((field) => field.name === "👥 Nüfus")?.value).toContain("🎖️ **Ordu Limiti**");
    expect(fields.find((field) => field.name === "👥 Nüfus")?.value).toContain("7.500");
    expect(fields.find((field) => field.name === "💰 Gelir Kalemleri")?.value).not.toContain("Deniz Ticareti");
  });
});
