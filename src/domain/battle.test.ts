import { describe, expect, it } from "vitest";
import { MAX_BOMBARDMENTS_PER_GAME_TURN, advantageTier, remainingBombardments, baseRetreatRate, battleEnds, compositionTotal, engagedComposition, orderState, resolveRound, rollBattlePool, rollNavalPool, rollSiegeSupport, siegeDefenderCaptured, siegeDefenseModifiers } from "./battle.js";

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
    const support = rollSiegeSupport({ ram: 2, catapult: 1, siege_tower: 1, mantlet: 2 }, { ram: "GATE", catapult: "WALL", siege_tower: "ASSAULT", mantlet: "ASSAULT" }, () => 0);
    expect(support.wallDamage).toBeGreaterThan(0);
    expect(support.gateDamage).toBeGreaterThan(0);
    expect(support.clash).toBeGreaterThan(0);
    expect(support.defense).toBeCloseTo(0.10);
  });
  it("on katapult ve on balista suru iki turda yıkamaz", () => {
    const support = rollSiegeSupport({ catapult: 10, ballista: 10 }, { catapult: "WALL", ballista: "WALL" }, (max) => max - 1);
    expect(support.wallDamage * 2).toBeLessThan(30_000);
  });

  it("şehir, gedik açılmadan veya savunma kırılmadan düşmez", () => {
    expect(siegeDefenderCaptured(12_000, 8_000, 6, 0, 1_000)).toBe(false);
    expect(siegeDefenderCaptured(12_000, 8_000, 8, 0, 1_000)).toBe(true);
    expect(siegeDefenderCaptured(12_000, 3_600, 4, 30_000, 0)).toBe(true);
    expect(siegeDefenderCaptured(12_000, 0, 8, 30_000, 1_000)).toBe(false);
    expect(siegeDefenderCaptured(12_000, 0, 8, 30_000, 1_000, true)).toBe(true);
  });

  it("sağlam tahkimat savunana belirgin üstünlük verir", () => {
    expect(siegeDefenseModifiers(30_000, 1_000)).toEqual({ defenderClash: 1.50, defenderDamage: 1.35, attackerDamage: 0.50 });
    expect(siegeDefenseModifiers(0, 1_000)).toEqual({ defenderClash: 1.25, defenderDamage: 1.15, attackerDamage: 0.75 });
  });

  it("geri çekilme yalnızca ilk turda kayıpsızdır", () => {
    expect(baseRetreatRate(1)).toBe(0);
    expect(baseRetreatRate(2)).toBe(0.05);
    expect(baseRetreatRate(5)).toBeGreaterThan(baseRetreatRate(2));
  });
  it("oyun turu başına üç bombardıman hakkını sınırlar", () => {
    expect(MAX_BOMBARDMENTS_PER_GAME_TURN).toBe(3);
    expect(remainingBombardments(0)).toBe(3);
    expect(remainingBombardments(2)).toBe(1);
    expect(remainingBombardments(3)).toBe(0);
    expect(remainingBombardments(7)).toBe(0);
  });
});
