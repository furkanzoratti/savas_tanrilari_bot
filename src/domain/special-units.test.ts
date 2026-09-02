import { describe, expect, it } from "vitest";
import { BATTLE_UNIT_STATS } from "./battle.js";
import { UNITS } from "./catalog.js";
import { SPECIAL_UNIT_TYPES, SPECIAL_UNITS, isSpecialUnitType } from "./special-units.js";

describe("ülkeye özel birlikler", () => {
  it("kararlaştırılan adları, fiyatları ve bakım değerlerini kullanır", () => {
    expect(SPECIAL_UNITS).toEqual({
      legionary: { name: "Lejyoner", price: 5_000, upkeep: 500 },
      hoplite: { name: "Hoplit", price: 3_500, upkeep: 400 },
      horse_archer: { name: "Atlı Okçu", price: 4_500, upkeep: 450 },
      camel_cavalry: { name: "Deve Süvarisi", price: 4_000, upkeep: 350 },
      briton_longbow: { name: "Briton Uzun Yaycıları", price: 3_500, upkeep: 400 },
      persian_immortal: { name: "Pers Ölümsüzleri", price: 5_000, upkeep: 500 },
      carthaginian_war_elephant: { name: "Kartaca Savaş Filleri", price: 6_500, upkeep: 650 },
      iberian_caetrati: { name: "İber Caetratileri", price: 3_000, upkeep: 300 },
      germanic_shock_warrior: { name: "Cermen Şok Savaşçıları", price: 3_500, upkeep: 350 }
    });
    for (const unitType of SPECIAL_UNIT_TYPES) expect(UNITS[unitType]).toEqual(SPECIAL_UNITS[unitType]);
  });

  it("önceden belirlenen savaş değerlerini değiştirmez", () => {
    expect(BATTLE_UNIT_STATS.legionary).toMatchObject({ clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 8, durability: 3 });
    expect(BATTLE_UNIT_STATS.hoplite).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 10, durability: 3 });
    expect(BATTLE_UNIT_STATS.horse_archer).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 8, durability: 2 });
    expect(BATTLE_UNIT_STATS.camel_cavalry).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 10, durability: 2 });
    expect(BATTLE_UNIT_STATS.briton_longbow).toMatchObject({ clashDice: 1, clashSides: 10, damageDice: 2, damageSides: 10, durability: 1 });
    expect(BATTLE_UNIT_STATS.persian_immortal).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 10, durability: 3 });
    expect(BATTLE_UNIT_STATS.carthaginian_war_elephant).toMatchObject({ clashDice: 3, clashSides: 8, damageDice: 2, damageSides: 10, durability: 3 });
    expect(BATTLE_UNIT_STATS.iberian_caetrati).toMatchObject({ clashDice: 2, clashSides: 6, damageDice: 2, damageSides: 8, durability: 1 });
    expect(BATTLE_UNIT_STATS.germanic_shock_warrior).toMatchObject({ clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 8, durability: 1 });
  });

  it("özel birlik tür denetimini korur; özel alım kotası tanımlamaz", () => {
    expect(isSpecialUnitType("briton_longbow")).toBe(true);
    expect(isSpecialUnitType("carthaginian_war_elephant")).toBe(true);
    expect(isSpecialUnitType("archer")).toBe(false);
  });
});
