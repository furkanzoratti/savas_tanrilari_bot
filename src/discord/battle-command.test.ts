import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("savaş komutları", () => {
  it("taslak, gizli kadro, yayın, tur ve özel detay akışını kaydeder", () => {
    const battle = commandBuilders.find((command) => command.name === "savas");
    const names = battle?.options?.map((option) => option.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(["baslat", "birlik-ayarla", "kadro-ayarla", "gemi-ayarla", "filo-ayarla", "kusatma-aleti-ayarla", "yayinla", "tur-oynat", "ordu-detay", "kayip-raporu", "bitir", "iptal"]));
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
