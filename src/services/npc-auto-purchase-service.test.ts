import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import type { CountryDocument } from "./game-service.js";
import { planCountryPurchases, type NpcAutoPurchaseConfig } from "./npc-auto-purchase-service.js";

const config: NpcAutoPurchaseConfig = {
  guildId: "guild",
  enabled: true,
  doctrine: "FULL_BUILDING_ARMY",
  budgetPercent: 50,
  targetFillPercent: 100,
  minimumReserve: 1_000,
  scope: "ALL_PLAYERLESS"
};

function document(input: { treasury: number; militaryUsed: number; trainingRemaining: number; buildingStarted?: boolean; units?: Array<{ unit_type: string; quantity: number; status: string; force_type: string }>; levelOneBuildings?: string[]; naval?: boolean; besieged?: boolean }): CountryDocument {
  return {
    guild: { current_turn: 3 },
    country: { id: "country" },
    militaryLimit: 10_000,
    militaryUsed: input.militaryUsed,
    specialUnitUnlocks: [],
    settlements: [{
      id: "settlement",
      name: "Test Şehri",
      local_treasury: input.treasury,
      is_conquered: false,
      isBesieged: input.besieged ?? false,
      is_coastal: input.naval ?? false,
      effectiveResources: ["GRAIN"],
      constructionLimit: 2,
      slotLimit: 6,
      policies: [],
      trainingRemaining: input.trainingRemaining,
      militaryLimit: 10_000,
      militaryUsed: input.militaryUsed,
      buildings: input.naval
        ? [
          { settlement_id: "settlement", building_type: "port", level: 1, target_level: 1, status: "ACTIVE", started_turn: 0, completion_turn: 0 },
          { settlement_id: "settlement", building_type: "shipyard", level: 2, target_level: 2, status: "ACTIVE", started_turn: 0, completion_turn: 0 }
        ]
        : input.buildingStarted
          ? [{ settlement_id: "settlement", building_type: "farm", level: 0, target_level: 1, status: "BUILDING", started_turn: 3, completion_turn: 6 }]
          : (input.levelOneBuildings ?? []).map((building_type) => ({ settlement_id: "settlement", building_type, level: 1, target_level: 1, status: "ACTIVE", started_turn: 0, completion_turn: 0 })),
      units: input.units ?? [],
      ships: [],
      pendingRecruitment: [],
      pendingShips: []
    }]
  } as unknown as CountryDocument;
}

describe("NPC ek alım planlaması", () => {
  it("ilk çalıştırmada bütçe yüzdesini, rezervi ve iki bina sınırını korur", () => {
    const plan = planCountryPurchases(document({ treasury: 10_000, militaryUsed: 0, trainingRemaining: 10_000 }), config, "FULL_BUILDING_ARMY");
    expect(plan.spendLimit).toBe(5_000);
    expect(plan.plannedCost).toBeGreaterThan(0);
    expect(plan.plannedCost).toBeLessThanOrEqual(5_000);
    expect(plan.buildingActions).toHaveLength(2);
  });

  it("ikinci çalıştırmada kalan hazine ve kapasiteyle asker alır fakat ikinci bina açmaz", () => {
    const plan = planCountryPurchases(
      document({ treasury: 5_000, militaryUsed: 2_000, trainingRemaining: 8_000, buildingStarted: true }),
      config,
      "ARMY_ONLY",
      0
    );
    expect(plan.spendLimit).toBe(2_500);
    expect(plan.plannedCost).toBeGreaterThan(0);
    expect(plan.plannedCost).toBeLessThanOrEqual(2_500);
    expect(plan.buildingActions).toHaveLength(0);
    expect(plan.unitActions.reduce((sum, action) => sum + action.quantity, 0)).toBeGreaterThan(0);
  });

  it("Gemi Odaklı uygun tersanede önce gemi üretir", () => {
    const plan = planCountryPurchases(document({ treasury: 30_000, militaryUsed: 0, trainingRemaining: 10_000, naval: true }), { ...config, budgetPercent: 100 }, "NAVAL_FOCUS");
    expect(plan.shipActions.length).toBeGreaterThan(0);
    expect(plan.shipActions.reduce((sum, action) => sum + action.quantity, 0)).toBeGreaterThan(0);
  });

  it("Gemi Odaklı gemi üretemeyen devlette kompozisyona uygun asker alır", () => {
    const plan = planCountryPurchases(document({ treasury: 10_000, militaryUsed: 0, trainingRemaining: 10_000 }), { ...config, budgetPercent: 100 }, "NAVAL_FOCUS");
    expect(plan.shipActions).toHaveLength(0);
    expect(plan.unitActions.length).toBeGreaterThan(0);
  });

  it("savunan konumunda kuşatma altındaki yerleşkeyi bütün yeni NPC alımlarından çıkarır", () => {
    const plan = planCountryPurchases(document({ treasury: 30_000, militaryUsed: 0, trainingRemaining: 10_000, naval: true, besieged: true }), { ...config, budgetPercent: 100 }, "NAVAL_FOCUS");
    expect(plan.buildingActions).toHaveLength(0);
    expect(plan.shipActions).toHaveLength(0);
    expect(plan.unitActions).toHaveLength(0);
  });
});
