import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("kalıcı ordu komutları", () => {
  it("oyuncuya ordu kurma, asker ve komutan yönetimi sunar", () => {
    const army = commandBuilders.find((command) => command.name === "ordu");
    expect(army?.options?.map((option) => option.name)).toEqual([
      "olustur", "asker-ekle", "asker-cikar", "komutan-ata", "komutan-kaldir", "bilgi", "dagit"
    ]);
    const add = army?.options?.find((option) => option.name === "asker-ekle");
    expect(add?.options?.find((option) => option.name === "ordu")).toMatchObject({ required: true, autocomplete: true });
    expect(add?.options?.find((option) => option.name === "yerleske")).toMatchObject({ required: true, autocomplete: true });
  });

  it("mevcut kadro komutunu korur ve yöneticiye ordu ekleme komutu verir", () => {
    const battle = commandBuilders.find((command) => command.name === "savas");
    expect(battle?.options?.some((option) => option.name === "kadro-ayarla")).toBe(true);
    const assignment = battle?.options?.find((option) => option.name === "ordu-ekle");
    expect(assignment?.options?.map((option) => option.name)).toEqual(["taraf", "islem", "ordu"]);
    expect(assignment?.options?.find((option) => option.name === "ordu")).toMatchObject({ required: true, autocomplete: true });
  });
});
