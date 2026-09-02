import { describe, expect, it } from "vitest";
import { MAX_BOMBARDMENTS_PER_GAME_TURN, activeSiegeAssaultAssets, advantageTier, remainingBombardments, baseRetreatRate, battleEnds, commanderClashBonus, compositionTotal, engagedComposition, orderState, resolveRound, rollBattlePool, rollNavalPool, rollSiegeSupport, siegeAssaultAccess, siegeAssaultComposition, siegeDefenderCaptured, siegeDefenderComposition, siegeDefenseModifiers, siegeLineBreaks, siegeOrderState, siegePressureAfterRound } from "./battle.js";

describe("savaş motoru", () => {
  it("kuşatma savunmasındaki süvarileri yalnız hesap sırasında yaya karşılıklarına dönüştürür", () => {
    const original = { light_cavalry: 100, heavy_cavalry: 200, horse_archer: 300, camel_cavalry: 400, archer: 50 } as const;
    expect(siegeDefenderComposition(original)).toEqual({
      light_infantry: 100,
      heavy_infantry: 200,
      archer: 350,
      spear: 400
    });
    expect(original.light_cavalry).toBe(100);
  });

  it("atanmış Komutanın özellik puanını küçük ve sınırlı çarpışma bonusuna çevirir", () => {
    expect(commanderClashBonus(1)).toBe(1);
    expect(commanderClashBonus(2)).toBe(2);
    expect(commanderClashBonus(99)).toBe(3);
  });

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

  it("kuşatma aletlerinin yeni zarlarını ve tek Koçbaşı sınırını uygular", () => {
    const minimum = rollSiegeSupport(
      { ladder_group: 1, siege_tower: 1, ram: 8, ballista: 1, catapult: 1 },
      { ladder_group: "ASSAULT", siege_tower: "ASSAULT", ram: "GATE", ballista: "WALL", catapult: "WALL" },
      () => 0
    );
    expect(minimum.detail.ladderClash).toBe(0);
    expect(minimum.detail.towerClash).toBe(2);
    expect(minimum.detail.ballistaWall).toBe(5);
    expect(minimum.detail.catapultWall).toBe(40);
    expect(minimum.gateDamage).toBe(35);

    const maximumLadder = rollSiegeSupport({ ladder_group: 1 }, { ladder_group: "ASSAULT" }, (max) => max - 1);
    expect(maximumLadder.detail.ladderClash).toBe(0);
    expect(maximumLadder.clash).toBe(0);

    const army = rollSiegeSupport(
      { ballista: 1, catapult: 1 },
      { ballista: "ARMY", catapult: "ARMY" },
      (max) => max - 1
    );
    expect(army.detail.ballistaArmy).toBe(10);
    expect(army.detail.catapultArmy).toBe(20);
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

  it("kuşatma baskısını tahkimat çarpanından önceki ham çarpışmadan hesaplar", () => {
    const result = resolveRound(
      { heavy_infantry: 5_000 }, { light_infantry: 5_000 },
      { clash: 100, damage: 100, detail: {} }, { clash: 150, damage: 100, detail: {} },
      { pressureClashA: 100, pressureClashB: 100 }
    );
    expect(result.winner).toBe("B");
    expect(result.pressureWinner).toBeNull();
    expect(result.pressureDeltaA).toBe(0);
    expect(result.pressureDeltaB).toBe(0);
  });

  it("kuşatma rezervleri baskıyı azaltır ve baskıyı sekizde sınırlar", () => {
    expect(siegePressureAfterRound(7, 3, 40_000, 18_000)).toEqual({
      pressure: 8, reserve: 22_000, reserveRelief: 2, hasUsableReserve: true
    });
    expect(siegePressureAfterRound(6, 3, 27_000, 18_000)).toEqual({
      pressure: 8, reserve: 9_000, reserveRelief: 1, hasUsableReserve: true
    });
    expect(siegePressureAfterRound(6, 3, 20_000, 18_000)).toEqual({
      pressure: 8, reserve: 2_000, reserveRelief: 0, hasUsableReserve: false
    });
    expect(siegeOrderState(8, 10_000)).toBe("CRITICAL");
  });

  it("ilk kritik turda hat kırılmaz; rezervsiz ikinci yenilgide kırılır", () => {
    expect(siegeLineBreaks(7, 8, true, 10_000, false)).toBe(false);
    expect(siegeLineBreaks(8, 8, true, 10_000, false)).toBe(true);
    expect(siegeLineBreaks(8, 8, true, 30_000, true)).toBe(false);
  });

  it("şehir yalnız erişim, ikinci kritik yenilgi ve ağır tükenme birlikte oluşunca düşer", () => {
    const base = {
      initial: 40_000, previousPressure: 8, currentPressure: 8, lostRound: true,
      wallHp: 0, gateHp: 1_000, assaultCapacity: 0, defenderFrontage: 18_000
    };
    expect(siegeDefenderCaptured({ ...base, remaining: 10_000 })).toBe(false);
    expect(siegeDefenderCaptured({ ...base, remaining: 9_000 })).toBe(true);
    expect(siegeDefenderCaptured({ ...base, remaining: 9_000, previousPressure: 7 })).toBe(false);
    expect(siegeDefenderCaptured({ ...base, remaining: 9_000, wallHp: 30_000 })).toBe(false);
    expect(siegeDefenderCaptured({ ...base, remaining: 0, wallHp: 30_000, assaultCapacity: 1_000 })).toBe(true);
  });

  it("merdiven ve kuleleri 15.000 kişilik hücum kapasitesine dönüştürür", () => {
    expect(siegeAssaultAccess({ ladder_group: 2, siege_tower: 1 })).toEqual({
      capacity: 5_000, activeLadderGroups: 2, activeSiegeTowers: 1
    });
    expect(siegeAssaultAccess({ ladder_group: 10, siege_tower: 4 })).toEqual({
      capacity: 15_000, activeLadderGroups: 3, activeSiegeTowers: 4
    });
    expect(activeSiegeAssaultAssets({ ladder_group: 10, siege_tower: 4, catapult: 2 })).toEqual({
      ladder_group: 3, siege_tower: 4, catapult: 2
    });
  });

  it("gedik öncesinde yakın dövüş piyadesini erişimle sınırlar, menzillileri kalan cepheye alır ve süvariyi dışarıda tutar", () => {
    const engaged = siegeAssaultComposition({
      light_infantry: 4_000, spear: 4_000, heavy_infantry: 4_000, archer: 6_000, slinger: 6_000, heavy_cavalry: 5_000
    }, { ladder_group: 2, siege_tower: 1 }, 30_000, 1_000);
    expect((engaged.light_infantry ?? 0) + (engaged.spear ?? 0) + (engaged.heavy_infantry ?? 0)).toBe(5_000);
    expect((engaged.archer ?? 0) + (engaged.slinger ?? 0)).toBe(10_000);
    expect(engaged.heavy_cavalry ?? 0).toBe(0);
    expect(compositionTotal(engaged)).toBe(15_000);
  });

  it("sur veya kapı açıldığında erişim kısıtını kaldırır", () => {
    const army = { heavy_infantry: 6_000, heavy_cavalry: 6_000 };
    expect(siegeAssaultComposition(army, {}, 0, 1_000)).toEqual(army);
  });

  it("gedik veya açık kapı yokken kaybı yalnız hücuma erişen birliklerden düşer", () => {
    const army = { heavy_infantry: 3_000, heavy_cavalry: 2_000 };
    const engaged = siegeAssaultComposition(army, { ladder_group: 3 }, 30_000, 1_000);
    const result = resolveRound(
      army, { archer: 1_000 },
      { clash: 10, damage: 10, detail: {} }, { clash: 10, damage: 20, detail: {} },
      { casualtyCompositionA: engaged }
    );
    expect(result.remainingA.heavy_infantry).toBeLessThan(3_000);
    expect(result.remainingA.heavy_cavalry).toBe(2_000);
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
  it("oyun turu başına dört bombardıman hakkını sınırlar", () => {
    expect(MAX_BOMBARDMENTS_PER_GAME_TURN).toBe(4);
    expect(remainingBombardments(0)).toBe(4);
    expect(remainingBombardments(2)).toBe(2);
    expect(remainingBombardments(3)).toBe(1);
    expect(remainingBombardments(4)).toBe(0);
    expect(remainingBombardments(7)).toBe(0);
  });
});
