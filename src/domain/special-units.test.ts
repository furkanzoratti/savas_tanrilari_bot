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
      germanic_shock_warrior: { name: "Cermen Şok Savaşçıları", price: 3_500, upkeep: 350 },
      anatolian_thureophoroi: { name: "Anadolu Kalkanlıları (Thureophoroi)", price: 3_000, upkeep: 300 },
      triarii_veteran: { name: "Triarii Gazileri", price: 3_000, upkeep: 300 },
      punic_veteran: { name: "Pön Gazileri", price: 4_750, upkeep: 475 },
      gaesatae: { name: "Gaesatae", price: 4_750, upkeep: 475 },
      peltast: { name: "Peltastlar", price: 1_750, upkeep: 175 },
      silver_shield: { name: "Gümüş Kalkanlılar", price: 3_500, upkeep: 400 },
      machimoi_phalangitai: { name: "Machimoi Phalangitai", price: 3_500, upkeep: 400 },
      mauryan_war_elephant: { name: "Maurya Savaş Filleri", price: 8_000, upkeep: 800 },
      desert_raider: { name: "Çöl Akıncıları", price: 4_250, upkeep: 425 },
      egyptian_war_chariot: { name: "Chariot", price: 5_000, upkeep: 500 }
    });
    for (const unitType of SPECIAL_UNIT_TYPES) expect(UNITS[unitType]).toEqual(SPECIAL_UNITS[unitType]);
  });

  it("güncel savaş değerlerini kullanır", () => {
    expect(BATTLE_UNIT_STATS.legionary).toMatchObject({ clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 8, durability: 3 });
    expect(BATTLE_UNIT_STATS.hoplite).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 12, durability: 3 });
    expect(BATTLE_UNIT_STATS.horse_archer).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 8, durability: 2 });
    expect(BATTLE_UNIT_STATS.camel_cavalry).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 10, durability: 2 });
    expect(BATTLE_UNIT_STATS.briton_longbow).toMatchObject({ clashDice: 1, clashSides: 12, damageDice: 2, damageSides: 12, durability: 1 });
    expect(BATTLE_UNIT_STATS.persian_immortal).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 10, durability: 3 });
    expect(BATTLE_UNIT_STATS.carthaginian_war_elephant).toMatchObject({ clashDice: 3, clashSides: 10, damageDice: 2, damageSides: 10, durability: 3 });
    expect(BATTLE_UNIT_STATS.iberian_caetrati).toMatchObject({ clashDice: 2, clashSides: 6, damageDice: 2, damageSides: 8, durability: 1 });
    expect(BATTLE_UNIT_STATS.germanic_shock_warrior).toMatchObject({ clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 8, durability: 1 });
    expect(BATTLE_UNIT_STATS.anatolian_thureophoroi).toMatchObject({ clashDice: 2, clashSides: 6, damageDice: 1, damageSides: 10, durability: 2 });
    expect(BATTLE_UNIT_STATS.triarii_veteran).toMatchObject({ clashDice: 2, clashSides: 6, damageDice: 1, damageSides: 8, durability: 2 });
    expect(BATTLE_UNIT_STATS.punic_veteran).toMatchObject({ clashDice: 3, clashSides: 6, damageDice: 2, damageSides: 8, durability: 3 });
    expect(BATTLE_UNIT_STATS.gaesatae).toMatchObject({ clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 8, durability: 2 });
    expect(BATTLE_UNIT_STATS.peltast).toMatchObject({ clashDice: 1, clashSides: 8, damageDice: 1, damageSides: 8, durability: 1 });
    expect(BATTLE_UNIT_STATS.silver_shield).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 10, durability: 3 });
    expect(BATTLE_UNIT_STATS.machimoi_phalangitai).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 10, durability: 3 });
    expect(BATTLE_UNIT_STATS.mauryan_war_elephant).toMatchObject({ clashDice: 3, clashSides: 12, damageDice: 2, damageSides: 12, durability: 3 });
    expect(BATTLE_UNIT_STATS.desert_raider).toMatchObject({ clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 8, durability: 2 });
    expect(BATTLE_UNIT_STATS.egyptian_war_chariot).toMatchObject({ clashDice: 2, clashSides: 12, damageDice: 2, damageSides: 12, durability: 2 });
  });

  it("özel birlik tür denetimini korur; özel alım kotası tanımlamaz", () => {
    expect(isSpecialUnitType("briton_longbow")).toBe(true);
    expect(isSpecialUnitType("carthaginian_war_elephant")).toBe(true);
    expect(isSpecialUnitType("anatolian_thureophoroi")).toBe(true);
    expect(isSpecialUnitType("egyptian_war_chariot")).toBe(true);
    expect(isSpecialUnitType("archer")).toBe(false);
  });
});
