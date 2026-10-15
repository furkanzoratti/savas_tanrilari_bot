import { describe, expect, it } from "vitest";
import { NAVAL_UNIT_STATS } from "./battle.js";
import { SHIPS } from "./catalog.js";
import { NAVAL_HULL_STATS } from "./naval-hulls.js";
import { countryCanPurchaseShip, purchasableShipTypes } from "./scandinavian-navy.js";

describe("İskandinav donanma doktrini", () => {
  it("İskandinav devletlerine yalnız Hjortspring, diğer devletlere yalnız standart gemileri açar", () => {
    expect(purchasableShipTypes(true)).toEqual(["hjortspring"]);
    expect(purchasableShipTypes(false)).toEqual(["kerkouros", "trireme", "quinquereme"]);
    expect(countryCanPurchaseShip(true, "trireme")).toBe(false);
    expect(countryCanPurchaseShip(false, "hjortspring")).toBe(false);
    expect(countryCanPurchaseShip(true, "hjortspring")).toBe(true);
  });

  it("Hjortspring'i fiyat, savaş gücü ve gövde dayanıklılığında Kerkouros ile Trireme arasına koyar", () => {
    expect(SHIPS.hjortspring.price).toBeGreaterThan(SHIPS.kerkouros.price);
    expect(SHIPS.hjortspring.price).toBeLessThan(SHIPS.trireme.price);
    expect(NAVAL_UNIT_STATS.hjortspring.clashDice * NAVAL_UNIT_STATS.hjortspring.clashSides)
      .toBeGreaterThan(NAVAL_UNIT_STATS.kerkouros.clashDice * NAVAL_UNIT_STATS.kerkouros.clashSides);
    expect(NAVAL_UNIT_STATS.hjortspring.damageDice * NAVAL_UNIT_STATS.hjortspring.damageSides)
      .toBeLessThan(NAVAL_UNIT_STATS.trireme.damageDice * NAVAL_UNIT_STATS.trireme.damageSides);
    expect(NAVAL_HULL_STATS.kerkouros.maxHp).toBeLessThan(NAVAL_HULL_STATS.hjortspring.maxHp);
    expect(NAVAL_HULL_STATS.hjortspring.maxHp).toBeLessThan(NAVAL_HULL_STATS.trireme.maxHp);
  });
});
