import { describe, expect, it } from "vitest";
import { UNITS } from "./catalog.js";
import { SPECIAL_UNITS } from "./special-units.js";
import { BATTLE_UNIT_STATS, assessArmyComposition, rollBattlePool } from "./battle.js";

describe("ordu kompozisyonu ve güncel birlik dengesi", () => {
  it("yeni fiyat, bakım ve Hafif Piyade zarlarını uygular", () => {
    expect(UNITS.heavy_infantry).toEqual({ name: "Ağır Piyade", price: 4_500, upkeep: 450 });
    expect(UNITS.light_cavalry).toEqual({ name: "Hafif Süvari", price: 3_000, upkeep: 300 });
    expect(SPECIAL_UNITS.legionary).toEqual({ name: "Lejyoner", price: 5_000, upkeep: 500 });
    expect(BATTLE_UNIT_STATS.light_infantry.clashSides).toBe(4);
  });

  it("yüzde 80 ve üzerindeki tek birimi Tekdüze Ordu sayar", () => {
    const result = assessArmyComposition({ heavy_infantry: 8_000, archer: 2_000 });
    expect(result.tier).toBe("MONOTYPE");
    expect(result.clashMultiplier).toBe(0.85);
    expect(result.damageMultiplier).toBe(0.90);
  });

  it("yüzde 79-21 iki birimli orduya sınırlı kompozisyon uygular", () => {
    const result = assessArmyComposition({ heavy_infantry: 7_900, archer: 2_100 });
    expect(result.tier).toBe("LIMITED");
    expect(result.clashMultiplier).toBe(0.90);
    expect(result.damageMultiplier).toBe(0.95);
  });

  it("üç anlamlı birim ve üç taktiksel rolü standart sayar", () => {
    const result = assessArmyComposition({ light_infantry: 6_000, spear: 2_000, archer: 2_000 });
    expect(result.tier).toBe("STANDARD");
    expect(result.clashMultiplier).toBe(1);
    expect(result.damageMultiplier).toBe(1);
  });

  it("üç farklı hat biriminin kompozisyon kuralını istismar etmesine izin vermez", () => {
    const result = assessArmyComposition({ light_infantry: 4_000, heavy_infantry: 4_000, legionary: 2_000 });
    expect(result.meaningfulUnitCount).toBe(3);
    expect(result.tier).toBe("LIMITED");
  });

  it("dengeli ve mükemmel karma orduları ayrı kademelendirir", () => {
    const balanced = assessArmyComposition({ light_infantry: 6_000, spear: 1_000, archer: 1_000, light_cavalry: 2_000 });
    expect(balanced.tier).toBe("BALANCED");
    expect(balanced.clashMultiplier).toBe(1.10);

    const excellent = assessArmyComposition({ light_infantry: 5_000, spear: 1_000, archer: 2_000, light_cavalry: 2_000 });
    expect(excellent.tier).toBe("EXCELLENT");
    expect(excellent.clashMultiplier).toBe(1.15);
    expect(excellent.damageMultiplier).toBe(1.08);
  });

  it("surlar ve kapı sağlamken kuşatma kompozisyonunda süvari aramaz", () => {
    const army = { light_infantry: 6_000, spear: 2_000, archer: 2_000 };
    expect(assessArmyComposition(army, "FIELD").tier).toBe("STANDARD");
    expect(assessArmyComposition(army, "SIEGE_RESTRICTED").tier).toBe("EXCELLENT");
  });

  it("kompozisyon çarpanlarını yalnız cepheye giren kara birliklerinin zarına uygular", () => {
    const roll = rollBattlePool(
      { light_infantry: 5_000, spear: 1_000, archer: 2_000, light_cavalry: 2_000 },
      10_000,
      () => 0,
      "FIELD",
      undefined,
      true
    );
    expect(roll.composition?.tier).toBe("EXCELLENT");
    expect(roll.clash).toBe(14);
    expect(roll.damage).toBe(11);
  });

  it("pasifken sınıflandırma kodunu korur fakat çarpanları uygulamaz", () => {
    const roll = rollBattlePool(
      { light_infantry: 5_000, spear: 1_000, archer: 2_000, light_cavalry: 2_000 },
      10_000,
      () => 0,
      "FIELD",
      undefined,
      false
    );
    expect(roll.composition).toMatchObject({ tier: "EXCELLENT", clashMultiplier: 1, damageMultiplier: 1 });
    expect(roll.clash).toBe(12);
    expect(roll.damage).toBe(10);
  });
});
