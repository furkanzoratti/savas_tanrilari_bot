import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("hammadde ve düğmeli ticaret komutları", () => {
  it("yeni yerleşkede hammadde seçtirir ve sonradan değiştirme komutu sunar", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim")!;
    const settlement = admin.options?.find((option) => option.name === "yerleske-ekle");
    const resource = settlement?.options?.find((option) => option.name === "hammadde");
    expect(resource?.required).toBe(true);
    expect(resource?.choices).toHaveLength(15);
    expect(admin.options?.some((option) => option.name === "hammadde-ayarla")).toBe(true);
  });

  it("ticaret teklifinde iki yerleşkeyi seçtirir ve ID tabanlı yanıtı kaldırır", () => {
    const trade = commandBuilders.find((command) => command.name === "ticaret")!;
    expect(trade.options?.map((option) => option.name)).toEqual(["teklif", "liste", "feshet"]);
    const offer = trade.options?.find((option) => option.name === "teklif");
    expect(offer?.options?.map((option) => option.name)).toContain("kendi-yerlesken");
    expect(offer?.options?.map((option) => option.name)).toContain("hedef-yerleske");
    const terminate = trade.options?.find((option) => option.name === "feshet");
    expect(terminate?.options?.some((option) => option.name === "id")).toBe(false);
  });
});
