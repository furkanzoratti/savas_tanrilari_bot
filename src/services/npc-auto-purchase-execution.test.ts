import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  lockQuery: vi.fn(),
  release: vi.fn(),
  listCountries: vi.fn(),
  document: vi.fn(),
  guildState: vi.fn(),
  purchaseUnits: vi.fn(),
  purchaseBuilding: vi.fn()
}));

vi.mock("../db/pool.js", () => ({
  pool: {
    query: mocks.poolQuery,
    connect: vi.fn(async () => ({ query: mocks.lockQuery, release: mocks.release }))
  }
}));

vi.mock("./game-service.js", () => ({
  GameError: class GameError extends Error {},
  buildingPurchaseTerms: vi.fn(() => ({ cost: 1_000, duration: 3 })),
  unitPurchaseCost: vi.fn((_type: string, quantity: number) => quantity),
  gameService: {
    listCountries: mocks.listCountries,
    document: mocks.document,
    guildState: mocks.guildState,
    purchaseUnits: mocks.purchaseUnits,
    purchaseBuilding: mocks.purchaseBuilding,
    ensureGuild: vi.fn()
  }
}));

import { npcAutoPurchaseService } from "./npc-auto-purchase-service.js";

function npcDocument(treasury: number, militaryUsed: number, trainingRemaining: number) {
  return {
    guild: { current_turn: 3 },
    country: { id: "npc-country" },
    playerIds: [],
    militaryLimit: 10_000,
    militaryUsed,
    specialUnitUnlocks: [],
    settlements: [{
      id: "npc-city",
      name: "NPC Şehri",
      local_treasury: treasury,
      is_conquered: false,
      is_coastal: false,
      effectiveResources: ["GRAIN"],
      constructionLimit: 2,
      slotLimit: 6,
      policies: [],
      trainingRemaining,
      militaryLimit: 10_000,
      militaryUsed,
      buildings: [],
      units: [],
      pendingRecruitment: []
    }]
  };
}

describe("NPC otomatik alım tekrar çalıştırma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let attempt = 0;
    mocks.lockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT enabled")) return { rows: [{
        enabled: true,
        doctrine: "DEFENSIVE",
        budget_percent: 50,
        target_fill_percent: 100,
        minimum_reserve: 1_000,
        scope: "ALL_PLAYERLESS"
      }], rowCount: 1 };
      if (sql.includes("npc_auto_purchase_country_overrides")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO npc_auto_purchase_runs")) {
        attempt += 1;
        return { rows: [{ attempt_count: attempt }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    mocks.listCountries.mockResolvedValue([{ id: "npc-country", name: "NPC Ülkesi" }]);
    mocks.guildState.mockResolvedValue({ current_turn: 3, acquisition_interval: 3 });
    mocks.document
      .mockResolvedValueOnce(npcDocument(10_000, 0, 10_000))
      .mockResolvedValueOnce(npcDocument(5_000, 5_000, 5_000));
    mocks.purchaseUnits.mockImplementation(async (input: { quantity: number }) => ({ cost: input.quantity }));
    mocks.purchaseBuilding.mockResolvedValue({ cost: 1_000, targetLevel: 1, completionTurn: 6 });
  });

  it("ikinci kullanımda atlamaz ve kalan hazineyle ek emir oluşturur", async () => {
    const first = await npcAutoPurchaseService.execute("guild", "gm");
    const second = await npcAutoPurchaseService.execute("guild", "gm");

    expect(first[0]).toMatchObject({ runNumber: 1, status: "COMPLETE", actualCost: 5_000 });
    expect(second[0]).toMatchObject({ runNumber: 2, status: "COMPLETE", actualCost: 2_000 });
    expect(second[0]!.unitActions.reduce((sum, action) => sum + action.quantity, 0)).toBe(2_000);
    expect(mocks.poolQuery.mock.calls.some(([sql]) => String(sql).includes("attempt_count=npc_auto_purchase_runs.attempt_count+1"))).toBe(true);
    expect(mocks.lockQuery).toHaveBeenCalledWith("SELECT pg_advisory_lock(hashtext($1))", ["npc-auto-purchase:guild"]);
    expect(mocks.lockQuery).toHaveBeenCalledWith("SELECT pg_advisory_unlock(hashtext($1))", ["npc-auto-purchase:guild"]);
  });
});