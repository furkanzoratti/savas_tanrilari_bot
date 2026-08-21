import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";
import { BRAND_BANNER_PATH, BRAND_BANNER_URL, TEMPLE_BANNER_PATH } from "./assets.js";
import { turnAnnouncement } from "./turn-announcements.js";

describe("ikinci komut ve görsel paketi", () => {
  it("asker terhis komutunu gerekli alanlarla kaydeder", () => {
    const command = commandBuilders.find((item) => item.name === "asker-terhis");
    expect(command?.options?.map((option) => option.name)).toEqual(["yerleske", "birim", "durum", "miktar", "ulke"]);
  });

  it("herkese görünen dört tur eylemini kaydeder", () => {
    const command = commandBuilders.find((item) => item.name === "tur");
    expect(command?.options?.map((option) => option.name)).toEqual(["atla", "ac", "durdur", "kapat"]);
  });

  it("yönetici komut günlüğü ayarlarını sunar", () => {
    const admin = commandBuilders.find((item) => item.name === "yonetim");
    expect(admin?.options?.some((option) => option.name === "komut-log-kanali")).toBe(true);
    expect(admin?.options?.some((option) => option.name === "komut-gecmisi")).toBe(true);
  });

  it("tur duyurusunu marka görseline bağlar ve iki görseli projede tutar", () => {
    const embed = turnAnnouncement({ kind: "OPEN", turn: 7 }).toJSON();
    expect(embed.title).toContain("TUR 7");
    expect(embed.image?.url).toBe(BRAND_BANNER_URL);
    expect(existsSync(BRAND_BANNER_PATH)).toBe(true);
    expect(existsSync(TEMPLE_BANNER_PATH)).toBe(true);
  });
});
