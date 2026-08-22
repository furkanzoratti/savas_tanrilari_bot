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
  });

  it("yerleşke oluştururken dört ayrı gelir kalemi ister", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    const settlement = admin?.options?.find((option) => option.name === "yerleske-ekle");
    const names = settlement?.options?.map((option) => option.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(["gelir", "vergi-geliri", "kara-ticareti", "deniz-ticareti"]));
  });
});
