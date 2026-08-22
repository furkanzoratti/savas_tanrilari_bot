import { describe, expect, it } from "vitest";
import { advantageTier, battleEnds, compositionTotal, engagedComposition, orderState, resolveRound, rollBattlePool, rollNavalPool, rollSiegeSupport } from "./battle.js";

describe("savaş motoru", () => {
  it("cephe kapasitesini aşan orduyu gizli olarak ölçekler", () => {
    const engaged = engagedComposition({ heavy_infantry: 20_000, archer: 20_000 }, 30_000);
    expect(compositionTotal(engaged)).toBe(30_000);
    expect(engaged.heavy_infantry).toBe(15_000);
    expect(engaged.archer).toBe(15_000);
  });

  it("pahalı birliklerin daha büyük zar havuzu ve dayanıklılığı vardır", () => {
    const low = rollBattlePool({ light_infantry: 1_000 }, 30_000, () => 0);
    const heavy = rollBattlePool({ heavy_infantry: 1_000 }, 30_000, () => 0);
    expect(heavy.clash).toBeGreaterThan(low.clash);
    expect(heavy.damage).toBeGreaterThan(low.damage);
  });

  it("üstünlük aralıklarını yüzde farkıyla sınıflandırır", () => {
    expect(advantageTier(109, 100).tier).toBe("BALANCED");
    expect(advantageTier(120, 100)).toEqual({ tier: "MINOR", winner: "A" });
    expect(advantageTier(140, 100)).toEqual({ tier: "CLEAR", winner: "A" });
    expect(advantageTier(160, 100)).toEqual({ tier: "CRUSHING", winner: "A" });
  });

  it("ana çarpışma tekrar eder ve yalnızca dağılma koşulunda biter", () => {
    expect(battleEnds(3, 10_000, 8_000)).toBe(false);
    expect(orderState(4, 10_000, 8_000)).toBe("SHAKEN");
    expect(battleEnds(6, 10_000, 8_000)).toBe(true);
  });

  it("kayıpları kompozisyona uygular fakat tur çıktısı yalnızca toplam verir", () => {
    const result = resolveRound(
      { heavy_infantry: 5_000 }, { light_infantry: 5_000 },
      { clash: 100, damage: 100, detail: {} }, { clash: 50, damage: 50, detail: {} }
    );
    expect(result.winner).toBe("A");
    expect(result.lossB).toBeGreaterThan(result.lossA);
    expect(compositionTotal(result.remainingB)).toBe(5_000 - result.lossB);
  });

  it("deniz savaşında her gemiyi ayrı bir zar birimi olarak işler", () => {
    const roll = rollNavalPool({ kerkouros: 2, trireme: 1, quinquereme: 1 }, 30, () => 0);
    expect(roll.clash).toBe(7);
    expect(roll.damage).toBe(7);
    const result = resolveRound(
      { quinquereme: 10 }, { kerkouros: 10 },
      { clash: 100, damage: 300, detail: {} }, { clash: 50, damage: 100, detail: {} }, { mode: "NAVAL" }
    );
    expect(result.lossB).toBeGreaterThanOrEqual(result.lossA);
    expect(result.lossB).toBeLessThanOrEqual(10);
  });

  it("kuşatma aletleri sur hasarı ve savaş desteği üretir", () => {
    const support = rollSiegeSupport({ ram: 2, catapult: 1, siege_tower: 1, mantlet: 2 }, () => 0);
    expect(support.wallDamage).toBeGreaterThan(0);
    expect(support.clash).toBeGreaterThan(0);
    expect(support.defense).toBeCloseTo(0.10);
  });
});

