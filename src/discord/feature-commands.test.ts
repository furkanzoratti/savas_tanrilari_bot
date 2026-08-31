import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("ticaret ve rol raporu komutları", () => {
  it("ticaret teklif, liste ve düğmeli fesih akışlarını kaydeder", () => {
    const trade = commandBuilders.find((command) => command.name === "ticaret");
    expect(trade?.options?.map((option) => option.name)).toEqual(["teklif", "liste", "feshet"]);
  });

  it("rol kanalı ve günlük rapor kanalı yönetimini ayrı tutar", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    expect(admin?.options?.some((option) => option.name === "rol-kanali")).toBe(true);
    expect(admin?.options?.some((option) => option.name === "rol-rapor-kanali")).toBe(true);
    expect(commandBuilders.some((command) => command.name === "hos-geldin")).toBe(true);
  });

  it("yerleşke oluştururken tek başlangıç geliri ister ve dağılımı otomasyona bırakır", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    const settlement = admin?.options?.find((option) => option.name === "yerleske-ekle");
    const names = settlement?.options?.map((option) => option.name) ?? [];
    expect(names).toContain("gelir");
    expect(names).not.toEqual(expect.arrayContaining(["vergi-geliri", "kara-ticareti", "deniz-ticareti"]));
    expect(admin?.options?.some((option) => option.name === "yerleske-hazinesi")).toBe(true);
  });

  it("paralı asker kampanyasına elle kara birliği kaybı ekleme komutunu kaydeder", () => {
    const command = commandBuilders.find((item) => item.name === "parali-asker");
    const loss = command?.options?.find((option) => option.name === "kayip-ekle");
    expect(loss?.options?.map((option) => option.name)).toEqual(["ulke", "sirket", "kalem", "miktar"]);
    expect(loss?.options?.find((option) => option.name === "miktar")).toMatchObject({ required: true, min_value: 1 });
    expect(loss?.options?.find((option) => option.name === "kalem")?.choices).toHaveLength(7);
  });

  it("oyuncu hazine taşıma komutunda ülke istemez ve iki şehri menüden seçtirir", () => {
    const command = commandBuilders.find((item) => item.name === "hazine-tasi");
    expect(command?.options?.map((option) => option.name)).toEqual(["kaynak-sehir", "hedef-sehir", "miktar"]);
    expect(command?.options?.find((option) => option.name === "kaynak-sehir")).toMatchObject({ required: true, autocomplete: true });
    expect(command?.options?.find((option) => option.name === "hedef-sehir")).toMatchObject({ required: true, autocomplete: true });
    expect(command?.options?.find((option) => option.name === "miktar")).toMatchObject({ required: true, min_value: 1 });
    expect(command?.options?.some((option) => option.name === "ulke")).toBe(false);
  });
});
