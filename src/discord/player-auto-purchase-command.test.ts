import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("oyuncu otomatik alım komutu", () => {
  it("iki gemi ile üç ordu alım türünü oyuncuya sunar", () => {
    const command = commandBuilders.find((item) => item.name === "otomatik-alim");
    expect(command).toBeDefined();
    const type = command?.options.find((option) => option.name === "tur");
    expect(type?.required).toBe(true);
    expect(type?.choices?.map((choice) => choice.value)).toEqual(["HEAVY_SHIPS", "MIXED_SHIPS", "QUALITY", "LIGHT", "GENERAL"]);
    expect(type?.choices?.map((choice) => choice.name)).toEqual(["Ağır Gemi", "Karışık Gemi", "Ağır Ordu", "Hafif Ordu", "Orta Ordu"]);
  });
});
