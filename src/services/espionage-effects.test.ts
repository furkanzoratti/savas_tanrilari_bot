import { describe, expect, it } from "vitest";
import { productionOrderLabel, recruitmentWaveLabel } from "./espionage-effects.js";

describe("casusluk etki hedefleri", () => {
  it("asker alım dalgasını birlik, miktar ve turuyla adlandırır", () => {
    expect(recruitmentWaveLabel({ id:"wave",unit_type:"heavy_infantry",quantity:1_250,due_turn:14 }))
      .toBe("1.250 Ağır Piyade (Tur 14)");
  });

  it("gemi ve kuşatma üretim emrini gerçek adıyla adlandırır", () => {
    expect(productionOrderLabel({ kind:"SHIP",id:"ship",item_type:"trireme",quantity:2,completion_turn:15 }))
      .toBe("2 Trireme (Tur 15)");
    expect(productionOrderLabel({ kind:"SIEGE",id:"siege",item_type:"catapult",quantity:3,completion_turn:16 }))
      .toBe("3 Katapult (Tur 16)");
  });
});
