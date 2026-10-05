import { describe, expect, it } from "vitest";
import { BASE_SIEGE_STARVATION_TURNS } from "./battle.js";
import { siegeStarvationBonus } from "./siege-starvation.js";

describe("kuşatma erzak dayanıklılığı", () => {
  it("Çiftlik, Su Kemeri, Garnizon Takviyesi ve ülke etkisini aynı havuzda toplar", () => {
    const bonus = siegeStarvationBonus({
      farmLevel: 3,
      aqueductLevel: 2,
      garrisonReinforcement: true,
      formableBonus: 2
    });
    expect(bonus).toBe(7);
    expect(BASE_SIEGE_STARVATION_TURNS + bonus).toBe(13);
  });

  it("Çiftlik Sv2 ve Sv3 eşiklerini, toplam +8 sınırını korur", () => {
    expect(siegeStarvationBonus({ farmLevel: 1, aqueductLevel: 1, garrisonReinforcement: false })).toBe(0);
    expect(siegeStarvationBonus({ farmLevel: 2, aqueductLevel: 1, garrisonReinforcement: false })).toBe(1);
    expect(siegeStarvationBonus({ farmLevel: 3, aqueductLevel: 1, garrisonReinforcement: false })).toBe(3);
    expect(siegeStarvationBonus({ farmLevel: 3, aqueductLevel: 3, garrisonReinforcement: true, formableBonus: 20 })).toBe(8);
  });

  it("oranlı din etkisinden gelen yarım turu tam tur sayacına güvenle çevirir", () => {
    expect(siegeStarvationBonus({ farmLevel: 1, aqueductLevel: 1, garrisonReinforcement: false, formableBonus: 0.5 })).toBe(0);
    expect(siegeStarvationBonus({ farmLevel: 2, aqueductLevel: 1, garrisonReinforcement: false, formableBonus: 0.5 })).toBe(1);
    expect(Number.isInteger(siegeStarvationBonus({ farmLevel: 3, aqueductLevel: 2, garrisonReinforcement: true, formableBonus: 0.5 }))).toBe(true);
  });
});
