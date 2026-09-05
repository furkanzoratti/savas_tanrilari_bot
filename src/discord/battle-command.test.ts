import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("savaş komutları", () => {
  it("taslak, gizli kadro, yayın, tur ve özel detay akışını kaydeder", () => {
    const battle = commandBuilders.find((command) => command.name === "savas");
    const names = battle?.options?.map((option) => option.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(["baslat", "taraf-ulke", "birlik-ayarla", "kadro-ayarla", "gemi-ayarla", "filo-ayarla", "kusatma-aleti-ayarla", "kusatma-asamasi", "bombardiman", "yayinla", "tur-oynat", "ordu-detay", "kayip-raporu", "bitir", "iptal"]));
  });

  it("koalisyon ülkesi ve ülke bazlı kadro seçeneklerini sunar", () => {
    const battle = commandBuilders.find((command) => command.name === "savas");
    const participant = battle?.options?.find((option) => option.name === "taraf-ulke");
    expect(participant?.options?.map((option) => option.name)).toEqual(["taraf", "islem", "ulke"]);
    for (const name of ["birlik-ayarla", "kadro-ayarla", "gemi-ayarla", "filo-ayarla"]) {
      const command = battle?.options?.find((option) => option.name === name);
      expect(command?.options?.some((option) => option.name === "ulke")).toBe(true);
    }
    const roster = battle?.options?.find((option) => option.name === "kadro-ayarla");
    expect(roster?.options?.find((option) => option.name === "taraf")).toBeUndefined();
    expect(roster?.options?.find((option) => option.name === "ulke")).toMatchObject({ required: true, autocomplete: true });
    const mercenary = battle?.options?.find((option) => option.name === "parali-asker-ayarla");
    expect(mercenary?.options?.map((option) => option.name)).toEqual(["ulke", "islem", "sirket"]);
    const settlement = roster?.options?.find((option) => option.name === "yerleske");
    expect(settlement).toMatchObject({
      required: false,
      autocomplete: true
    });
  });
  it("on savaş alanı hazır ayarını sunar", () => {
    const battle = commandBuilders.find((command) => command.name === "savas");
    const start = battle?.options?.find((option) => option.name === "baslat");
    const terrain = start?.options?.find((option) => option.name === "arazi");
    expect(terrain?.choices).toHaveLength(10);
  });
  it("kuşatma aletinde hedef seçimini zorunlu tutar", () => {
    const battle = commandBuilders.find((command) => command.name === "savas");
    const support = battle?.options?.find((option) => option.name === "kusatma-aleti-ayarla");
    const target = support?.options?.find((option) => option.name === "hedef");
    expect(target?.required).toBe(true);
    expect(target?.choices?.map((choice) => choice.value)).toEqual(expect.arrayContaining(["WALL", "GATE", "ARMY", "ASSAULT"]));
  });
});
