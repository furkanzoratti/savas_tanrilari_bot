import { describe, expect, it } from "vitest";
import { commandBuilders, unitChoices } from "./commands.js";

describe("özel birlik Discord komutları", () => {
  it("yönetici erişim komutunu beş özel birlik seçeneğiyle kaydeder", () => {
    const command = commandBuilders.find((item) => item.name === "ozel-birlik-yetkisi");
    expect(command?.options?.map((option) => option.name)).toEqual(["ayarla", "listele"]);
    const configure = command?.options?.find((option) => option.name === "ayarla");
    expect(configure?.options?.find((option) => option.name === "birlik")?.choices?.map((choice) => choice.value)).toEqual([
      "legionary", "hoplite", "horse_archer", "camel_cavalry", "briton_longbow"
    ]);
  });

  it("özel birlikleri asker alımı ve tek mesajlık savaş kadrosuna ekler", () => {
    expect(unitChoices.map(([key]) => key)).toEqual(expect.arrayContaining([
      "legionary", "hoplite", "horse_archer", "camel_cavalry", "briton_longbow"
    ]));
    const battle = commandBuilders.find((item) => item.name === "savas");
    const roster = battle?.options?.find((option) => option.name === "kadro-ayarla");
    expect(roster?.options?.map((option) => option.name)).toEqual(expect.arrayContaining([
      "lejyoner", "hoplit", "atli-okcu", "deve-suvarisi", "briton-uzun-yayci"
    ]));
  });
});
