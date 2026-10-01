import { describe, expect, it } from "vitest";
import { BASE_SIEGE_STARVATION_TURNS, MAX_BOMBARDMENTS_PER_GAME_TURN, activeSiegeAssaultAssets, advantageTier, remainingBombardments, baseRetreatRate, battleEnds, commanderClashBonus, compositionTotal, engagedComposition, fieldPressureAfterRound, orderState, resolveRound, restoreSiegeAttackerCasualtyTypes, rollBattlePool, rollNavalPool, rollSiegeSupport, siegeAssaultAccess, siegeAssaultComposition, siegeAttackerBreaks, siegeAttackerDismountedComposition, siegeDefenderCaptured, siegeDefenderComposition, siegeDefenderGroups, siegeDefenderReserveBonus, siegeDefenseModifiers, siegeFrontageProfile, siegeOrderState, siegePressureAfterRound } from "./battle.js";

describe("savaş motoru", () => {
  it("kuşatma açlığının temel süresini altı oyun turu kabul eder", () => {
    expect(BASE_SIEGE_STARVATION_TURNS).toBe(6);
  });

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

  it("kuşatma saldırganının seçtiği süvarileri yaya hesaplar, kayıpları özgün türlerine geri yazar", () => {
    const original = { heavy_infantry: 1_000, heavy_cavalry: 2_000, archer: 500, horse_archer: 1_000 } as const;
    const dismounted = { heavy_cavalry: 1_000, horse_archer: 500 } as const;
    expect(siegeAttackerDismountedComposition(original, dismounted)).toEqual({
      heavy_infantry: 2_000, heavy_cavalry: 1_000, archer: 1_000, horse_archer: 500
    });
    expect(restoreSiegeAttackerCasualtyTypes(original, { heavy_infantry: 1_000, archer: 500 }, dismounted)).toEqual({
      heavy_infantry: 500, heavy_cavalry: 500, archer: 250, horse_archer: 250
    });
  });

  it("saldıran atlıları kuşatma cephesinden çıkarır, yalnız manuel indirilenleri yaya olarak dahil eder", () => {
    const original = { heavy_infantry: 1_000, light_cavalry: 2_000, horse_archer: 2_000 } as const;
    expect(siegeAssaultComposition(original, {}, 0, 0)).toEqual({ heavy_infantry: 1_000 });

    const dismounted = siegeAttackerDismountedComposition(original, { light_cavalry: 1_000, horse_archer: 1_000 });
    expect(siegeAssaultComposition(dismounted, {}, 0, 0)).toEqual({
      light_infantry: 1_000,
      heavy_infantry: 1_000,
      archer: 1_000
    });
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

  it("meydan savaşı yalnız 10 baskı ve en az yüzde 50 kayıp birlikte oluşunca otomatik biter", () => {
    expect(battleEnds(10, 10_000, 6_000)).toBe(false);
    expect(orderState(10, 10_000, 6_000)).toBe("CRITICAL");
    expect(battleEnds(8, 10_000, 5_000)).toBe(false);
    expect(orderState(8, 10_000, 5_000)).toBe("CRITICAL");
    expect(battleEnds(10, 10_000, 5_000)).toBe(true);
    expect(fieldPressureAfterRound(9, 3)).toBe(10);
    expect(fieldPressureAfterRound(1, -3)).toBe(0);
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
    const roll = rollNavalPool({ kerkouros: 2, trireme: 1, quinquereme: 1 }, () => 0);
    expect(roll.clash).toBe(7);
    expect(roll.damage).toBe(7);
    const result = resolveRound(
      { quinquereme: 10 }, { kerkouros: 10 },
      { clash: 100, damage: 300, detail: {} }, { clash: 50, damage: 100, detail: {} }, { mode: "NAVAL" }
    );
    expect(result.lossB).toBeGreaterThanOrEqual(result.lossA);
    expect(result.lossB).toBeLessThanOrEqual(10);
  });

  it("deniz savaşında 30 gemi sınırı olmadan bütün savaşabilir gemileri zar havuzuna alır",()=>{
    const roll=rollNavalPool({kerkouros:40,trireme:20,quinquereme:10},()=>0);
    expect(roll.detail.kerkouros?.engaged).toBe(40);
    expect(roll.detail.trireme?.engaged).toBe(20);
    expect(roll.detail.quinquereme?.engaged).toBe(10);
    expect(Object.values(roll.detail).reduce((sum,item)=>sum+Number(item.engaged??0),0)).toBe(70);
  });

  it("kuşatma aletleri sur hasarı ve savaş desteği üretir", () => {
    const support = rollSiegeSupport({ ram: 2, catapult: 1, siege_tower: 1, mantlet: 2 }, { ram: "GATE", catapult: "WALL", siege_tower: "ASSAULT", mantlet: "ASSAULT" }, () => 0);
    expect(support.wallDamage).toBeGreaterThan(0);
    expect(support.gateDamage).toBeGreaterThan(0);
    expect(support.clash).toBeGreaterThan(0);
    expect(support.defense).toBeCloseTo(0.04);
    expect(support.detail.mantletClash).toBe(0);
  });

  it("kuşatma aletlerinin yeni zarlarını ve tek Koçbaşı sınırını uygular", () => {
    const minimum = rollSiegeSupport(
      { ladder_group: 1, siege_tower: 1, ram: 8, ballista: 1, catapult: 1 },
      { ladder_group: "ASSAULT", siege_tower: "ASSAULT", ram: "GATE", ballista: "WALL", catapult: "WALL" },
      () => 0
    );
    expect(minimum.detail.ladderClash).toBe(0);
    expect(minimum.detail.towerClash).toBe(1);
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

    const gate = rollSiegeSupport(
      { ballista: 2 },
      { ballista: "GATE" },
      () => 0
    );
    expect(gate.wallDamage).toBe(0);
    expect(gate.gateDamage).toBe(10);
    expect(gate.detail.ballistaGate).toBe(10);
  });

  it("Mantlet yalnız hasar azaltır ve toplam azaltımı yüzde 20 ile sınırlar", () => {
    const support = rollSiegeSupport({ mantlet: 25 }, { mantlet: "ASSAULT" }, (max) => max - 1);
    expect(support.clash).toBe(0);
    expect(support.detail.mantletClash).toBe(0);
    expect(support.defense).toBeCloseTo(0.20);
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

  it("kuşatma rezervlerini baskıya indirim uygulamadan raporlar ve baskıyı on ikide sınırlar", () => {
    expect(siegePressureAfterRound(11, 3, 40_000, 18_000)).toEqual({
      pressure: 12, reserve: 22_000, reserveRelief: 0, hasUsableReserve: true
    });
    expect(siegePressureAfterRound(10, 3, 27_000, 18_000)).toEqual({
      pressure: 12, reserve: 9_000, reserveRelief: 0, hasUsableReserve: true
    });
    expect(siegePressureAfterRound(10, 3, 20_000, 18_000)).toEqual({
      pressure: 12, reserve: 2_000, reserveRelief: 0, hasUsableReserve: false
    });
    expect(siegeOrderState(12, 10_000)).toBe("CRITICAL");
  });

  it("kuşatan yalnız 12 baskı ve en az yüzde 50 kayıp birlikte oluşunca otomatik geri çekilir", () => {
    expect(siegeAttackerBreaks(12, 20_000, 11_000)).toBe(false);
    expect(siegeAttackerBreaks(10, 20_000, 10_000)).toBe(false);
    expect(siegeAttackerBreaks(12, 20_000, 10_000)).toBe(true);
    expect(siegeAttackerBreaks(0, 20_000, 0)).toBe(true);
  });

  it("şehir yalnız savunan ordunun mevcudu tamamen sıfırlandığında düşer", () => {
    expect(siegeDefenderCaptured({ remaining: 1 })).toBe(false);
    expect(siegeDefenderCaptured({ remaining: 0 })).toBe(true);
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

  it("gedik öncesinde yakın dövüş piyadesini erişimle, menzillileri 5.000 destek kapasitesiyle sınırlar ve süvariyi dışarıda tutar", () => {
    const engaged = siegeAssaultComposition({
      light_infantry: 4_000, spear: 4_000, heavy_infantry: 4_000, archer: 6_000, slinger: 6_000, heavy_cavalry: 5_000
    }, { ladder_group: 2, siege_tower: 1 }, 30_000, 1_000);
    expect((engaged.light_infantry ?? 0) + (engaged.spear ?? 0) + (engaged.heavy_infantry ?? 0)).toBe(5_000);
    expect((engaged.archer ?? 0) + (engaged.slinger ?? 0)).toBe(5_000);
    expect(engaged.heavy_cavalry ?? 0).toBe(0);
    expect(compositionTotal(engaged)).toBe(10_000);
  });

  it("gedik durumuna göre saldıran piyade cephesini 20.000, 25.000 ve 30.000'e çıkarır", () => {
    const composition = { heavy_infantry: 24_000, spear: 12_000, archer: 12_000 };
    const wallBreach = siegeAssaultComposition(composition, { ladder_group: 15 }, 0, 1_000);
    expect((wallBreach.heavy_infantry ?? 0) + (wallBreach.spear ?? 0)).toBe(25_000);
    expect(wallBreach.archer).toBe(5_000);
    expect(compositionTotal(wallBreach)).toBe(30_000);

    const gateBreach = siegeAssaultComposition(composition, {}, 30_000, 0);
    expect((gateBreach.heavy_infantry ?? 0) + (gateBreach.spear ?? 0)).toBe(20_000);
    expect(gateBreach.archer).toBe(5_000);
    expect(compositionTotal(gateBreach)).toBe(25_000);

    const bothBreached = siegeAssaultComposition(composition, {}, 0, 0);
    expect((bothBreached.heavy_infantry ?? 0) + (bothBreached.spear ?? 0)).toBe(30_000);
    expect(bothBreached.archer).toBe(5_000);
    expect(compositionTotal(bothBreached)).toBe(35_000);
  });

  it("savunucu cephesini tahkimat durumuna göre ayrı piyade ve menzilli havuzlardan doldurur", () => {
    const composition = { heavy_infantry: 30_000, archer: 15_000 };
    const intact = siegeDefenderGroups(composition, 30_000, 1_000);
    expect(compositionTotal(intact.infantry)).toBe(18_000);
    expect(compositionTotal(intact.ranged)).toBe(5_000);
    const gate = siegeDefenderGroups(composition, 30_000, 0);
    expect(compositionTotal(gate.infantry)).toBe(20_500);
    expect(compositionTotal(gate.ranged)).toBe(5_000);
    const wall = siegeDefenderGroups(composition, 0, 1_000);
    expect(compositionTotal(wall.infantry)).toBe(23_000);
    expect(compositionTotal(wall.ranged)).toBe(10_000);
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

  it("kuşatma saldırganının kaybını yüzde 70 piyade ve yüzde 30 menzilli olarak dağıtır", () => {
    const result = resolveRound(
      { light_infantry: 5_000, archer: 5_000 }, { light_infantry: 1_000 },
      { clash: 10, damage: 0, detail: {} }, { clash: 10, damage: 20, detail: {} },
      { casualtySplitA: {
        primaryComposition: { light_infantry: 5_000 },
        secondaryComposition: { archer: 5_000 },
        primaryShare: 0.70
      } }
    );
    expect(result.remainingA.light_infantry).toBe(4_776);
    expect(result.remainingA.archer).toBe(4_904);
  });

  it("yorgunluk yerine tahkimat durumuna bağlı sabit çarpanları uygular", () => {
    expect(siegeDefenseModifiers(30_000, 1_000)).toEqual({
      attackerClash: 0.80, attackerDamage: 0.80, defenderClash: 1.20, defenderDamage: 1.00, defenderIncomingDamage: 0.95
    });
    expect(siegeDefenseModifiers(30_000, 0)).toEqual({
      attackerClash: 0.90, attackerDamage: 0.90, defenderClash: 1.20, defenderDamage: 1.00, defenderIncomingDamage: 0.975
    });
    expect(siegeDefenseModifiers(0, 1_000)).toEqual({
      attackerClash: 0.90, attackerDamage: 0.90, defenderClash: 1.20, defenderDamage: 1.00, defenderIncomingDamage: 0.975
    });
    expect(siegeDefenseModifiers(0, 0)).toEqual({
      attackerClash: 1.00, attackerDamage: 1.00, defenderClash: 1.20, defenderDamage: 1.00, defenderIncomingDamage: 1.00
    });
  });

  it("savunucu rezervini cephenin beşte birlik dilimleriyle en fazla beş kademe güçlendirir", () => {
    const profile = siegeFrontageProfile(30_000, 1_000);
    const frontage = profile.defenderInfantry + profile.defenderRanged;
    expect(frontage).toBe(23_000);
    expect(siegeDefenderReserveBonus(30_000, frontage)).toMatchObject({
      reserve: 7_000, stepSize: 4_600, tiers: 1,
      clashMultiplier: 1.01, damageMultiplier: 1.01, incomingDamageMultiplier: 0.99
    });
    expect(siegeDefenderReserveBonus(50_000, frontage)).toMatchObject({
      reserve: 27_000, tiers: 5,
      clashMultiplier: 1.05, damageMultiplier: 1.05, incomingDamageMultiplier: 0.95
    });
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
