import { describe, expect, it } from "vitest";
import {
  assaultUnitTotal,
  hasAssaultForce,
  egyptianWarChariotPressureBonus,
  resolveRound,
  rollBattlePool,
  spearCavalryCounter
} from "./battle.js";

describe("Mızraklı–Süvari karşılaşması", () => {
  it("yalnızca karşılayabildiği süvari miktarı kadar kapsama verir", () => {
    const counter = spearCavalryCounter(
      { spear: 5_000 },
      { heavy_cavalry: 1_000 }
    );

    expect(counter.effectiveSpears).toBe(5_000);
    expect(counter.effectiveEnemyCavalry).toBe(1_000);
    expect(counter.matched).toBe(1_000);
    expect(counter.coverage).toBeCloseTo(0.20);
  });

  it("Hoplitleri ve Atlı Okçuları yarım ağırlıkla hesaplar", () => {
    const counter = spearCavalryCounter(
      { hoplite: 2_000 },
      { horse_archer: 2_000 }
    );

    expect(counter.effectiveSpears).toBe(1_000);
    expect(counter.effectiveEnemyCavalry).toBe(1_000);
    expect(counter.coverage).toBe(1);
  });

  it("Anadolu Kalkanlılarının yalnız yüzde 30'unu mızrak karşılığı sayar", () => {
    const counter = spearCavalryCounter(
      { anatolian_thureophoroi: 10_000 },
      { heavy_cavalry: 5_000 }
    );

    expect(counter.effectiveSpears).toBe(3_000);
    expect(counter.effectiveEnemyCavalry).toBe(5_000);
    expect(counter.matched).toBe(3_000);
  });

  it("Kartaca Savaş Fillerini mızrak karşılığında tam hareketli hedef sayar", () => {
    const counter = spearCavalryCounter(
      { spear: 1_000 },
      { carthaginian_war_elephant: 1_000 }
    );

    expect(counter.effectiveEnemyCavalry).toBe(1_000);
    expect(counter.matched).toBe(1_000);
    expect(counter.coverage).toBe(1);
  });

  it("yeni mızraklıları tam, yeni hareketli birlikleri tam ağırlıkla karşılar", () => {
    const counter = spearCavalryCounter(
      { triarii_veteran: 1_000, silver_shield: 1_000, machimoi_phalangitai: 1_000 },
      { mauryan_war_elephant: 1_000, desert_raider: 1_000, egyptian_war_chariot: 1_000 }
    );
    expect(counter.effectiveSpears).toBe(3_000);
    expect(counter.effectiveEnemyCavalry).toBe(3_000);
    expect(counter.mobileCoverage).toBe(1);
  });

  it("Mısır savaş arabası baskısını yalnız ilk tur açık arazide ve yetersiz mızrak karşısında verir", () => {
    const base = { round: 1, terrain: "OPEN_PLAIN" as const, pressureWinner: "A" as const, side: "A" as const, engagedChariots: 1_000 };
    expect(egyptianWarChariotPressureBonus({ ...base, enemyMobileCoverage: 0.49 })).toBe(1);
    expect(egyptianWarChariotPressureBonus({ ...base, enemyMobileCoverage: 0.50 })).toBe(0);
    expect(egyptianWarChariotPressureBonus({ ...base, terrain: "FOREST", enemyMobileCoverage: 0 })).toBe(0);
    expect(egyptianWarChariotPressureBonus({ ...base, round: 2, enemyMobileCoverage: 0 })).toBe(0);
  });

  it("kompozisyon pasifken de gerçek mızrak zarının eşleşen kısmına bonus ekler", () => {
    const withoutCavalry = rollBattlePool({ spear: 5_000 }, 5_000, (max) => max - 1, "FIELD", undefined, false);
    const withCavalry = rollBattlePool({ spear: 5_000 }, 5_000, (max) => max - 1, "FIELD", {
      opponentComposition: { heavy_cavalry: 1_000 },
      opponentFrontage: 5_000
    }, false);

    expect(withCavalry.clash).toBeGreaterThan(withoutCavalry.clash);
    expect(withCavalry.antiCavalryDamage).toBeGreaterThan(0);
    expect(withCavalry.counter?.coverage).toBeCloseTo(0.20);
  });

  it("karşı-hasarı piyadeye değil yalnızca süvariye uygular", () => {
    const resolved = resolveRound(
      { spear: 1_000 },
      { heavy_cavalry: 1_000, heavy_infantry: 1_000 },
      { clash: 10, damage: 10, antiCavalryDamage: 10, detail: {} },
      { clash: 10, damage: 0, detail: {} }
    );

    expect(resolved.remainingB.heavy_cavalry).toBeLessThan(1_000);
    expect(resolved.remainingB.heavy_infantry).toBe(1_000);
  });
});

describe("Hücum Birliği", () => {
  it("şehir ele geçirebilen yaya birliklerini eksiksiz sayar", () => {
    const composition = {
      light_infantry: 100,
      militia: 100,
      spear: 100,
      heavy_infantry: 100,
      legionary: 100,
      hoplite: 100,
      persian_immortal: 100,
      iberian_caetrati: 100,
      germanic_shock_warrior: 100,
      anatolian_thureophoroi: 100,
      triarii_veteran: 100,
      punic_veteran: 100,
      gaesatae: 100,
      peltast: 100,
      silver_shield: 100,
      machimoi_phalangitai: 100,
      archer: 5_000,
      heavy_cavalry: 5_000
    };

    expect(assaultUnitTotal(composition)).toBe(1_600);
    expect(hasAssaultForce(composition)).toBe(true);
  });

  it("yalnız menzilli ve atlı birliklerden oluşan orduyu hücum gücü saymaz", () => {
    expect(hasAssaultForce({ archer: 2_000, slinger: 2_000, heavy_cavalry: 1_000, horse_archer: 1_000 })).toBe(false);
  });
});
