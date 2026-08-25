import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { commandBuilders } from "./commands.js";
import { renderPublicCountryProfile, renderPublicPactProfile } from "./diplomacy-ui.js";

describe("ittifak, pakt ve herkese açık devlet profili", () => {
  it("diplomasi kanalını yönetim alt komut sınırını aşmadan ayrı komut olarak kaydeder", () => {
    const configuration = commandBuilders.find((command) => command.name === "diplomasi-kanali");
    const administration = commandBuilders.find((command) => command.name === "yonetim");
    expect(configuration?.options?.map((option) => option.name)).toEqual(["islem", "kanal"]);
    expect(administration?.options?.length).toBeLessThanOrEqual(25);
  });

  it("ittifak daveti, listeleme ve karşılıklı fesih komutlarını sunar", () => {
    const command = commandBuilders.find((item) => item.name === "ittifak");
    expect(command?.options?.map((option) => option.name)).toEqual(["teklif", "liste", "feshet"]);
  });

  it("pakt oluşturma, davet, herkese açık bilgi ve liderlik yönetimini sunar", () => {
    const command = commandBuilders.find((item) => item.name === "pakt");
    expect(command?.options?.map((option) => option.name)).toEqual([
      "olustur", "davet", "davetlerim", "bilgi", "liste", "ayril", "uye-cikar", "lider-devret", "dagit"
    ]);
  });

  it("herkese açık devlet kartında yalnızca diplomatik ve yerleşke bilgilerini gösterir", () => {
    const embed = renderPublicCountryProfile({
      id: "roma", name: "Roma",
      settlements: [{ name: "Roma", resource_type: "IRON" }, { name: "Neapolis", resource_type: "GRAIN" }],
      allies: [{ id: "kartaca", name: "Kartaca" }],
      pacts: [{ id: "pakt", name: "Akdeniz Birliği", purpose: "Deniz güvenliği", founder_name: "Roma" }]
    }).toJSON();
    const fields = embed.fields ?? [];
    const combined = JSON.stringify(embed);
    expect(fields.map((field) => field.name)).toEqual([
      "🗺️ Yerleşkeler ve Hammaddeler", "🤝 Müttefikler", "🏛️ Üye Olunan Paktlar"
    ]);
    expect(combined).toContain("Demir");
    expect(combined).toContain("Tahıl");
    expect(combined).toContain("Kartaca");
    expect(combined).toContain("Akdeniz Birliği");
    expect(combined).not.toMatch(/Hazine|Nüfus|Ordu|Gelir|Bakım|Asker/i);
  });

  it("paktın amaç, açıklama, lider ve üye devletlerini kamuya açık kartta gösterir", () => {
    const embed = renderPublicPactProfile({
      id: "pakt", guild_id: "guild", founder_country_id: "roma", founder_country_name: "Roma",
      name: "Akdeniz Birliği", purpose: "Deniz güvenliği", description: "Ortak ticaret yollarını korur.",
      member_count: 2, members: [{ id: "roma", name: "Roma" }, { id: "kartaca", name: "Kartaca" }]
    }).toJSON();
    const combined = JSON.stringify(embed);
    expect(combined).toContain("Deniz güvenliği");
    expect(combined).toContain("Ortak ticaret yollarını korur.");
    expect(combined).toContain("Roma");
    expect(combined).toContain("Kartaca");
    expect(embed.fields?.some((field) => field.name === "👑 Pakt Lideri")).toBe(true);
  });
});
