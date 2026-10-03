import { describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("./game-service.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./game-service.js")>();
  return {
    ...original,
    unitPurchaseCost: vi.fn((_unitType: string, quantity: number) => quantity),
    gameService: { document: vi.fn(), guildState: vi.fn() }
  };
});

import { planPlayerPurchases,playerArmyUnitCandidates,playerAutoPurchasePlanFingerprint } from "./player-auto-purchase-service.js";

function documentFixture(options: { naval?: boolean; specialUnits?: string[] } = {}) {
  return {
    guild: { discord_id: "guild", current_turn: 30 },
    country: { id: "country", name: "Test Ülkesi", active_formable_key: null },
    playerIds: ["player"],
    militaryLimit: 20_000,
    militaryUsed: 0,
    specialUnitUnlocks: options.specialUnits ?? [],
    settlements: [{
      id: "city", name: "Test Şehri", local_treasury: 100_000,
      is_conquered: false, isBesieged: false, is_coastal: Boolean(options.naval),
      effectiveResources: [], policies: [], trainingRemaining: 20_000,
      militaryLimit: 20_000, militaryUsed: 0, constructionLimit: 2, slotLimit: 6,
      buildings: options.naval ? [
        { building_type: "port", status: "ACTIVE", level: 3 },
        { building_type: "shipyard", status: "ACTIVE", level: 3 }
      ] : [],
      units: [], ships: [], pendingRecruitment: [], pendingShips: []
    }]
  } as any;
}

describe("oyuncu otomatik alım planlaması", () => {
  it("gemi alımında en pahalı gemiden başlayıp kalan üretim puanını doldurur", () => {
    const plan = planPlayerPurchases("guild", 30, "SHIPS", documentFixture({ naval: true }));
    expect(plan.unitActions).toHaveLength(0);
    expect(plan.shipActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ shipType: "quinquereme", quantity: 3 }),
      expect.objectContaining({ shipType: "trireme", quantity: 1 }),
      expect.objectContaining({ shipType: "kerkouros", quantity: 1 })
    ]));
  });

  it("ağır ordu planını ağır standartlar ve onları karşılayan özel birliklerden kurar", () => {
    const specialUnits = ["hoplite", "germanic_companion_cavalry", "sarmatian_longswordsmen", "briton_longbow", "peltast"];
    const candidates = playerArmyUnitCandidates("QUALITY", specialUnits as any);
    expect(candidates).toEqual([
      "heavy_infantry", "sarmatian_longswordsmen", "heavy_cavalry", "germanic_companion_cavalry", "hoplite", "briton_longbow"
    ]);
    const plan = planPlayerPurchases("guild", 30, "QUALITY", documentFixture({ specialUnits }));
    const allowed = new Set(candidates);
    expect(plan.unitActions.length).toBeGreaterThan(0);
    expect(plan.unitActions.every((action) => allowed.has(action.unitType))).toBe(true);
    expect(plan.shipActions).toHaveLength(0);
  });

  it("hafif ordu planına yalnız hafif standart ve dayanıklılığı düşük özel birlikleri alır", () => {
    const specialUnits = ["peltast", "iberian_caetrati", "briton_longbow", "hoplite", "germanic_companion_cavalry"];
    expect(playerArmyUnitCandidates("LIGHT", specialUnits as any)).toEqual([
      "light_infantry", "light_cavalry", "slinger", "peltast", "iberian_caetrati", "briton_longbow"
    ]);
    const plan = planPlayerPurchases("guild", 30, "LIGHT", documentFixture({ specialUnits }));
    const allowed = new Set(["light_infantry", "light_cavalry", "slinger", "peltast", "iberian_caetrati", "briton_longbow"]);
    expect(plan.unitActions.length).toBeGreaterThan(0);
    expect(plan.unitActions.every((action) => allowed.has(action.unitType))).toBe(true);
  });

  it("orta orduda düşük ve kaliteli birlikleri aynı planda dengeler", () => {
    const plan = planPlayerPurchases("guild", 30, "GENERAL", documentFixture({ specialUnits: ["hoplite"] }));
    const types = new Set(plan.unitActions.map((action) => action.unitType));
    const low = ["light_infantry", "slinger", "light_cavalry"].some((unitType) => types.has(unitType as any));
    const quality = ["heavy_infantry", "heavy_cavalry", "hoplite"].some((unitType) => types.has(unitType as any));
    expect(low).toBe(true);
    expect(quality).toBe(true);
  });

  it("JSONB alan ve eylem sırası değişse bile aynı planı geçerli kabul eder",()=>{
    const original=planPlayerPurchases("guild",30,"QUALITY",documentFixture({specialUnits:["hoplite"]}));
    const fromJsonb={
      ...original,
      unitActions:[...original.unitActions].reverse().map((action)=>({
        cost:action.cost,quantity:action.quantity,unitType:action.unitType,
        settlementName:action.settlementName,settlementId:action.settlementId
      })),
      shipActions:[...original.shipActions].reverse().map((action)=>({
        cost:action.cost,quantity:action.quantity,shipType:action.shipType,
        settlementName:action.settlementName,settlementId:action.settlementId
      }))
    };
    expect(playerAutoPurchasePlanFingerprint(fromJsonb)).toBe(playerAutoPurchasePlanFingerprint(original));
  });
});
