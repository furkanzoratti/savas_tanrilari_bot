import { describe, expect, it } from "vitest";
import { MAX_BOMBARDMENTS_PER_GAME_TURN, activeSiegeAssaultAssets, advantageTier, remainingBombardments, baseRetreatRate, battleEnds, compositionTotal, engagedComposition, orderState, resolveRound, rollBattlePool, rollNavalPool, rollSiegeSupport, siegeAssaultAccess, siegeAssaultComposition, siegeDefenderCaptured, siegeDefenseModifiers } from "./battle.js";

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

  it("Mühendislik Atölyesi Sv3 bonusunu her topçu hasar zarına +1 uygular", () => {
    const normal = rollSiegeSupport({ catapult: 2, ballista: 2 }, { catapult: "WALL", ballista: "WALL" }, () => 0);
    const improved = rollSiegeSupport({ catapult: 2, ballista: 2 }, { catapult: "WALL", ballista: "WALL" }, () => 0, 1);
    expect(improved.wallDamage - normal.wallDamage).toBe(90);
  });

  it("şehir, gedik açılmadan veya savunma kırılmadan düşmez", () => {
    expect(siegeDefenderCaptured(12_000, 8_000, 6, 0, 1_000)).toBe(false);
    expect(siegeDefenderCaptured(12_000, 8_000, 8, 0, 1_000)).toBe(true);
    expect(siegeDefenderCaptured(12_000, 3_600, 4, 30_000, 0)).toBe(true);
    expect(siegeDefenderCaptured(12_000, 0, 8, 30_000, 1_000)).toBe(false);
    expect(siegeDefenderCaptured(12_000, 0, 8, 30_000, 1_000, 1_000)).toBe(true);
  });

  it("merdiven ve kuleleri 12.000 kişilik hücum kapasitesine dönüştürür", () => {
    expect(siegeAssaultAccess({ ladder_group: 2, siege_tower: 1 })).toEqual({
      capacity: 5_000, activeLadderGroups: 2, activeSiegeTowers: 1
    });
    expect(siegeAssaultAccess({ ladder_group: 10, siege_tower: 4 })).toEqual({
      capacity: 12_000, activeLadderGroups: 0, activeSiegeTowers: 4
    });
    expect(activeSiegeAssaultAssets({ ladder_group: 10, siege_tower: 4, catapult: 2 })).toEqual({
      siege_tower: 4, catapult: 2
    });
  });

  it("gedik öncesinde yakın dövüş piyadesini erişimle sınırlar, menzillileri kalan cepheye alır ve süvariyi dışarıda tutar", () => {
    const engaged = siegeAssaultComposition({
      light_infantry: 4_000, spear: 4_000, heavy_infantry: 4_000, archer: 6_000, slinger: 6_000, heavy_cavalry: 5_000
    }, { ladder_group: 2, siege_tower: 1 }, 30_000, 1_000);
    expect((engaged.light_infantry ?? 0) + (engaged.spear ?? 0) + (engaged.heavy_infantry ?? 0)).toBe(5_000);
    expect((engaged.archer ?? 0) + (engaged.slinger ?? 0)).toBe(7_000);
    expect(engaged.heavy_cavalry ?? 0).toBe(0);
    expect(compositionTotal(engaged)).toBe(12_000);
  });

  it("sur veya kapı açıldığında erişim kısıtını kaldırır", () => {
    const army = { heavy_infantry: 6_000, heavy_cavalry: 6_000 };
    expect(siegeAssaultComposition(army, {}, 0, 1_000)).toEqual(army);
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
