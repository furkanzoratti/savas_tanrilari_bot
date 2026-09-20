import { describe, expect, it } from "vitest";
import {
  adjacentHexes,
  calculateArmyMovement,
  calculateFleetMovement,
  effectiveScoutStrength,
  formatHexCoordinate,
  hexCodeAxial,
  hexDistance,
  mutualAwareness,
  parseHexCoordinate,
  resolveReconRoll,
  resolveUnobservedDetection,
  scoutSizeModifiers,
  targetVisibility
} from "./movement.js";

describe("kara ve deniz hareket kuralları", () => {
  it("ordu büyüklüğünü, süvari bonusunu ve yüzdelik hızı sırayla uygular", () => {
    const result = calculateArmyMovement({
      totalTroops: 22_000,
      composition: { light_cavalry: 12_000, heavy_cavalry: 10_000 },
      speedPercent: 0.25
    });
    expect(result).toMatchObject({ canMove: true, baseAllowance: 4, speedBonus: 1, formationBonus: 1, allowance: 6 });
  });

  it("örnekteki tam kuşatma yükünü ağır konvoy olarak iki Hex yavaşlatır", () => {
    const result = calculateArmyMovement({
      totalTroops: 22_000,
      composition: { light_infantry: 22_000 },
      siegeAssets: { catapult: 2, ballista: 4 }
    });
    expect(result).toMatchObject({ siegeLoad: 4, siegeCapacity: 4, siegePenalty: 2, allowance: 2 });
  });

  it("az sayıdaki ağır aracı tam dolu konvoy kadar yavaşlatmaz", () => {
    const result = calculateArmyMovement({
      totalTroops: 22_000,
      composition: { light_infantry: 22_000 },
      siegeAssets: { catapult: 1 }
    });
    expect(result).toMatchObject({ siegeLoad: 1, siegeCapacity: 4, siegePenalty: 1, allowance: 3 });
  });

  it("kapasiteyi aşan kuşatma konvoyunu hareket ettirmez", () => {
    const result = calculateArmyMovement({
      totalTroops: 4_000,
      composition: { light_infantry: 4_000 },
      siegeAssets: { siege_tower: 1 }
    });
    expect(result.canMove).toBe(false);
    expect(result.allowance).toBe(0);
  });

  it("stratejik intikal ile zorunlu yürüyüşü aynı anda biriktirmez", () => {
    const strategic = calculateArmyMovement({
      totalTroops: 35_000,
      composition: { heavy_infantry: 35_000 },
      mode: "STRATEGIC_REDEPLOYMENT",
      strategicRedeploymentEligible: true
    });
    const forced = calculateArmyMovement({
      totalTroops: 35_000,
      composition: { heavy_infantry: 35_000 },
      mode: "FORCED_MARCH"
    });
    expect(strategic.allowance).toBe(5);
    expect(forced.allowance).toBe(5);
  });

  it("dost toprak bonusunu yalnızca bütünüyle ülke içinde kalan rotaya uygular", () => {
    const ownLand = calculateArmyMovement({
      totalTroops: 22_000, composition: { heavy_infantry: 22_000 }, friendlyTerritoryRoute: true
    });
    const foreignDestination = calculateArmyMovement({
      totalTroops: 22_000, composition: { heavy_infantry: 22_000 }, friendlyTerritoryRoute: false
    });
    expect(ownLand).toMatchObject({ baseAllowance: 4, territoryBonus: 1, allowance: 5 });
    expect(foreignDestination).toMatchObject({ territoryBonus: 0, allowance: 4 });
  });

  it("filo yük cezasını mutlak sayı yerine kapasite oranından hesaplar", () => {
    const result = calculateFleetMovement({
      composition: { kerkouros: 5, trireme: 10, quinquereme: 3 },
      cargoLoad: 20,
      cargoCapacity: 30
    });
    expect(result).toMatchObject({ totalShips: 18, baseAllowance: 7, compositionModifier: -1, cargoPenalty: 1, allowance: 5 });
  });

  it("filoya ait deniz Hex'leri üzerinde de yalnızca bir dost bölge bonusu verir", () => {
    const result = calculateFleetMovement({ composition: { trireme: 6 }, friendlyTerritoryRoute: true });
    expect(result).toMatchObject({ baseAllowance: 8, territoryBonus: 1, allowance: 9 });
  });
});

describe("harita koordinatları", () => {
  it("Excel tipi sütunları okuyup aynı biçimde yazar", () => {
    expect(parseHexCoordinate("AA-12")).toEqual({ column: 26, row: 12 });
    expect(formatHexCoordinate({ column: 26, row: 12 })).toBe("AA12");
    expect(hexCodeAxial("AA12")).toEqual({ q: 26, r: -2 });
  });

  it("tek komşu mesafesini bir Hex olarak hesaplar", () => {
    const origin = parseHexCoordinate("C10");
    for (const neighbor of adjacentHexes(origin)) expect(hexDistance(origin, neighbor)).toBe(1);
  });
});

describe("gizli keşif kuralları", () => {
  it("ağır süvariyi yarım keşif gücü sayar", () => {
    expect(effectiveScoutStrength({ lightCavalry: 200, horseArchers: 100, heavyCavalry: 400 })).toBe(500);
    expect(scoutSizeModifiers(500)).toEqual({ rollBonus: 1, detectionBonusForEnemy: 0 });
    expect(scoutSizeModifiers(800)).toEqual({ rollBonus: 2, detectionBonusForEnemy: 1 });
  });

  it("hedef büyüklüğü, kuşatma yükü ve gizli yürüyüşü görünürlüğe katar", () => {
    expect(targetVisibility(32_000, true, true)).toBe(1);
  });

  it("doğal 20 üstün; bonusla ulaşılan 20 en fazla keskin sonuç verir", () => {
    expect(resolveReconRoll("MOBILE_SCOUT", 20, -10).tier).toBe("SUPERIOR");
    expect(resolveReconRoll("MOBILE_SCOUT", 18, 2).tier).toBe("SHARP");
  });

  it("doğal 1 türüne göre kritik sonucu işaretler", () => {
    expect(resolveReconRoll("REGIONAL_OBSERVER", 1, 20)).toMatchObject({ tier: "CRITICAL_FAILURE", observerExposed: true });
    expect(resolveReconRoll("MOBILE_SCOUT", 1, 20)).toMatchObject({ tier: "CRITICAL_FAILURE", opponentFreeAction: true });
  });

  it("gözcüsüz bölgede yalnız doğal 20 aynı tur söylenti üretir", () => {
    expect(resolveUnobservedDetection(19, 1).tier).toBe("DELAYED_RUMOR");
    expect(resolveUnobservedDetection(20, -10).tier).toBe("IMMEDIATE_RUMOR");
    expect(resolveUnobservedDetection(1, 20).tier).toBe("CRITICAL_FAILURE");
  });

  it("karşılıklı farkındalık farkını savaş başlangıcı seçeneklerine çevirir", () => {
    expect(mutualAwareness(4, 1)).toEqual({
      superiorSide: "A",
      levelDifference: 3,
      ambushBonus: 3,
      mayChooseTerrain: true,
      mayAvoidContact: true,
      learnsEnemyDeployment: true
    });
  });
});
