import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("oyuncu otomatik alım komutu", () => {
  it("gemi ile üç ordu alım türünü oyuncuya sunar", () => {
    const command = commandBuilders.find((item) => item.name === "otomatik-alim");
    expect(command).toBeDefined();
    const type = command?.options.find((option) => option.name === "tur");
    expect(type?.required).toBe(true);
    expect(type?.choices?.map((choice) => choice.value)).toEqual(["SHIPS", "QUALITY", "LIGHT", "GENERAL"]);
    expect(type?.choices?.map((choice) => choice.name)).toEqual(["Gemi Alımı", "Ağır Ordu", "Hafif Ordu", "Orta Ordu"]);
  });
});
