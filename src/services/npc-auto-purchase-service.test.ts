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
  doctrine: "BALANCED",
  budgetPercent: 50,
  targetFillPercent: 100,
  minimumReserve: 1_000,
  scope: "ALL_PLAYERLESS"
};

function document(input: { treasury: number; militaryUsed: number; trainingRemaining: number; buildingStarted?: boolean }): CountryDocument {
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
      is_coastal: false,
      effectiveResources: ["GRAIN"],
      constructionLimit: 2,
      slotLimit: 6,
      policies: [],
      trainingRemaining: input.trainingRemaining,
      militaryLimit: 10_000,
      militaryUsed: input.militaryUsed,
      buildings: input.buildingStarted
        ? [{ settlement_id: "settlement", building_type: "farm", level: 0, target_level: 1, status: "BUILDING", started_turn: 3, completion_turn: 6 }]
        : [],
      units: [],
      pendingRecruitment: []
    }]
  } as unknown as CountryDocument;
}

describe("NPC ek alım planlaması", () => {
  it("ilk çalıştırmada bütçe yüzdesini, rezervi ve tek bina sınırını korur", () => {
    const plan = planCountryPurchases(document({ treasury: 10_000, militaryUsed: 0, trainingRemaining: 10_000 }), config, "BALANCED");
    expect(plan.spendLimit).toBe(5_000);
    expect(plan.plannedCost).toBeGreaterThan(0);
    expect(plan.plannedCost).toBeLessThanOrEqual(5_000);
    expect(plan.buildingActions).toHaveLength(1);
  });

  it("ikinci çalıştırmada kalan hazine ve kapasiteyle asker alır fakat ikinci bina açmaz", () => {
    const plan = planCountryPurchases(
      document({ treasury: 5_000, militaryUsed: 2_000, trainingRemaining: 8_000, buildingStarted: true }),
      config,
      "BALANCED",
      0
    );
    expect(plan.spendLimit).toBe(2_500);
    expect(plan.plannedCost).toBeGreaterThan(0);
    expect(plan.plannedCost).toBeLessThanOrEqual(2_500);
    expect(plan.buildingActions).toHaveLength(0);
    expect(plan.unitActions.reduce((sum, action) => sum + action.quantity, 0)).toBeGreaterThan(0);
  });
});