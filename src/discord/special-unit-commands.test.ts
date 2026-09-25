import { describe, expect, it } from "vitest";
import { commandBuilders, unitChoices } from "./commands.js";

describe("özel birlik Discord komutları", () => {
  it("yönetici erişim komutunu bütün özel birlik seçenekleriyle kaydeder", () => {
    const command = commandBuilders.find((item) => item.name === "ozel-birlik-yetkisi");
    expect(command?.options?.map((option) => option.name)).toEqual(["ayarla", "listele"]);
    const configure = command?.options?.find((option) => option.name === "ayarla");
    expect(configure?.options?.find((option) => option.name === "birlik")?.choices?.map((choice) => choice.value)).toEqual([
      "legionary", "hoplite", "horse_archer", "camel_cavalry", "briton_longbow",
      "persian_immortal", "carthaginian_war_elephant", "iberian_caetrati", "germanic_shock_warrior", "anatolian_thureophoroi",
      "triarii_veteran", "punic_veteran", "gaesatae", "peltast", "silver_shield", "machimoi_phalangitai",
      "mauryan_war_elephant", "desert_raider", "egyptian_war_chariot"
    ]);
  });

  it("özel birlikleri asker alımı ve tek mesajlık savaş kadrosuna ekler", () => {
    expect(unitChoices.map(([key]) => key)).toEqual(expect.arrayContaining([
      "legionary", "hoplite", "horse_archer", "camel_cavalry", "briton_longbow",
      "persian_immortal", "carthaginian_war_elephant", "iberian_caetrati", "germanic_shock_warrior", "anatolian_thureophoroi"
      ,"triarii_veteran", "punic_veteran", "gaesatae", "peltast", "silver_shield", "machimoi_phalangitai",
      "mauryan_war_elephant", "desert_raider", "egyptian_war_chariot"
    ]));
    const battle = commandBuilders.find((item) => item.name === "savas");
    const singleUnit = battle?.options?.find((option) => option.name === "birlik-ayarla");
    expect(singleUnit?.options?.find((option) => option.name === "birim")?.autocomplete).toBe(true);
    const roster = battle?.options?.find((option) => option.name === "kadro-ayarla");
    expect(roster?.options?.map((option) => option.name)).toEqual(expect.arrayContaining([
      "lejyoner", "hoplit", "atli-okcu", "deve-suvarisi", "briton-uzun-yayci", "pers-olumsuzleri",
      "kartaca-savas-fili", "iber-caetratileri", "cermen-sok-savascisi", "anadolu-kalkanlilari"
    ]));
  });
});
