import { describe, expect, it } from "vitest";
import { assessSettlementEventRisk, EVENT_COOLDOWN_TURNS, findWeightedSelection, type EventRiskInput } from "./events.js";

function settlement(overrides: Partial<EventRiskInput> = {}): EventRiskInput {
  return {
    population: 100_000,
    slavePopulation: 0,
    ruinStage: 0,
    conquered: false,
    besieged: false,
    resources: [],
    buildings: {},
    policies: [],
    assignedMerchant: false,
    state: { black_market_active: false, epidemic_active: false, unrest_active: false, rebellion_active: false },
    currentTurn: 12,
    lastTriggeredTurn: null,
    ...overrides
  };
}

describe("yönetici kontrollü ağırlıklı yerleşke olayları", () => {
  it("Agora Sv3'e atanmış tüccarı karaborsaya karşı tamamen korur", () => {
    const result = assessSettlementEventRisk("BLACK_MARKET", settlement({ buildings: { agora: 3, trade_guild: 2 }, assignedMerchant: true }));
    expect(result.weight).toBe(0);
    expect(result.blockedReason).toContain("tamamen engeller");
  });

  it("atanmış tüccarın karaborsa riskini azaltır", () => {
    const without = assessSettlementEventRisk("BLACK_MARKET", settlement({ buildings: { agora: 2, trade_guild: 2 } }));
    const withMerchant = assessSettlementEventRisk("BLACK_MARKET", settlement({ buildings: { agora: 2, trade_guild: 2 }, assignedMerchant: true }));
    expect(withMerchant.weight).toBeLessThan(without.weight);
    expect(withMerchant.factors.some((factor) => factor.label.includes("tüccar"))).toBe(true);
  });

  it("Zeytin, Şifacı Evi ve Panteon korumasıyla salgın riskini düşürür", () => {
    const baseline = assessSettlementEventRisk("EPIDEMIC", settlement());
    const protectedCity = assessSettlementEventRisk("EPIDEMIC", settlement({ resources: ["OLIVE"], buildings: { healer: 1, pantheon: 2 } }));
    expect(protectedCity.weight).toBeLessThan(baseline.weight);
  });

  it("Lupanar, köle kampı ve vergi baskısıyla huzursuzluğu artırır", () => {
    const peaceful = assessSettlementEventRisk("UNREST", settlement());
    const risky = assessSettlementEventRisk("UNREST", settlement({ buildings: { lupanar: 2, slave_camp: 1 }, policies: ["STRICT_TAXATION"] }));
    expect(risky.weight).toBeGreaterThan(peaceful.weight);
  });

  it("tetikleyici bulunmayan yerleşkeyi isyan havuzundan çıkarır", () => {
    expect(assessSettlementEventRisk("REBELLION", settlement()).weight).toBe(0);
    const unrest = assessSettlementEventRisk("REBELLION", settlement({ state: { black_market_active: false, epidemic_active: false, unrest_active: true, rebellion_active: false } }));
    expect(unrest.weight).toBeGreaterThan(0);
  });

  it("Birleşik Taç huzursuzluk ve isyan ağırlığını 10 puan azaltır", () => {
    const unrestBase = assessSettlementEventRisk("UNREST", settlement({ buildings: { lupanar: 2 } }));
    const unrestProtected = assessSettlementEventRisk("UNREST", settlement({ buildings: { lupanar: 2 }, stabilityRiskReduction: 10 }));
    expect(unrestProtected.weight).toBe(unrestBase.weight - 10);
    expect(unrestProtected.factors).toContainEqual({ label: "Birleşik Taç", adjustment: -10 });
    const state = { black_market_active: false, epidemic_active: false, unrest_active: true, rebellion_active: false };
    const rebellionBase = assessSettlementEventRisk("REBELLION", settlement({ state }));
    const rebellionProtected = assessSettlementEventRisk("REBELLION", settlement({ state, stabilityRiskReduction: 10 }));
    expect(rebellionProtected.weight).toBe(rebellionBase.weight - 10);
  });

  it("aktif olayı ve aynı olayın bekleme süresini havuzdan çıkarır", () => {
    const active = assessSettlementEventRisk("EPIDEMIC", settlement({ state: { black_market_active: false, epidemic_active: true, unrest_active: false, rebellion_active: false } }));
    expect(active.weight).toBe(0);
    const cooling = assessSettlementEventRisk("EPIDEMIC", settlement({ lastTriggeredTurn: 11 }));
    expect(cooling.cooldownUntilTurn).toBe(11 + EVENT_COOLDOWN_TURNS);
    expect(assessSettlementEventRisk("EPIDEMIC", settlement({ lastTriggeredTurn: 9 })).weight).toBeGreaterThan(0);
  });

  it("ağırlıklı zarın sınırlarında doğru yerleşkeyi seçer", () => {
    const cities = [{ name: "Roma", weight: 10 }, { name: "Capua", weight: 30 }, { name: "Athena", weight: 5 }];
    expect(findWeightedSelection(cities, 1).selected.name).toBe("Roma");
    expect(findWeightedSelection(cities, 10).selected.name).toBe("Roma");
    expect(findWeightedSelection(cities, 11).selected.name).toBe("Capua");
    expect(findWeightedSelection(cities, 45)).toMatchObject({ selected: cities[2], rangeStart: 41, rangeEnd: 45 });
    expect(() => findWeightedSelection(cities, 46)).toThrow();
  });
});
