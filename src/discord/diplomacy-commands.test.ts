import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { existsSync } from "node:fs";
import { commandBuilders } from "./commands.js";
import { PACT_BANNER_PATH, PACT_BANNER_URL, PORT_ACCESS_BANNER_PATH, PORT_ACCESS_BANNER_URL, STATE_PROFILE_BANNER_PATH, STATE_PROFILE_BANNER_URL } from "./assets.js";
import { diplomacyReplyIsPublic, portAccessInviteEmbed, renderPublicCountryProfile, renderPublicPactProfile } from "./diplomacy-ui.js";

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

  it("liman erişimi teklifi, listeleme ve yönlü kaldırma komutlarını sunar",()=>{
    const command=commandBuilders.find((item)=>item.name==="liman-erisimi");
    expect(command?.options?.map((option)=>option.name)).toEqual(["teklif","liste","kaldir"]);
    expect(command?.options?.find((option)=>option.name==="kaldir")?.options?.find((option)=>option.name==="yon")?.choices?.map((choice)=>choice.value))
      .toEqual(["RECEIVED","GRANTED"]);
  });

  it("liman erişimi teklifini özel görsele bağlar",()=>{
    const embed=portAccessInviteEmbed({
      id:"access",guild_id:"guild",requester_country_id:"britanya",requester_country_name:"Büyük Britanya",
      grantor_country_id:"roma",grantor_country_name:"Roma",status:"PENDING",channel_id:null,message_id:null
    }).toJSON();
    expect(embed.image?.url).toBe(PORT_ACCESS_BANNER_URL);
    expect(PORT_ACCESS_BANNER_URL).toBe("attachment://ancient-port-access-banner.png");
    expect(existsSync(PORT_ACCESS_BANNER_PATH)).toBe(true);
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
      status: "ACTIVE", destroyed_turn: null, destroyed_reason: null,
      settlements: [{ name: "Roma", resource_type: "IRON" }, { name: "Neapolis", resource_type: "GRAIN" }],
      allies: [{ id: "kartaca", name: "Kartaca" }],
      vassals: [{ id: "numidya", name: "Numidya" }],
      pacts: [{ id: "pakt", name: "Akdeniz Birliği", purpose: "Deniz güvenliği", founder_name: "Roma" }],
      wars: [{ id: "makedonya", name: "Makedonya" }]
    }).toJSON();
    const fields = embed.fields ?? [];
    const combined = JSON.stringify(embed);
    expect(fields.map((field) => field.name)).toEqual([
      "📌 Devlet Durumu", "🗺️ Yerleşkeler ve Hammaddeler", "🤝 Müttefikler", "👑 Vassal Devletler", "🏛️ Üye Olunan Paktlar", "⚔️ Savaşta Olduğu Devletler"
    ]);
    expect(combined).toContain("Demir");
    expect(combined).toContain("Tahıl");
    expect(combined).toContain("Kartaca");
    expect(combined).toContain("Akdeniz Birliği");
    expect(combined).toContain("Makedonya");
    expect(combined).toContain("Numidya");
    expect(combined).not.toMatch(/Hazine|Nüfus|Ordu|Gelir|Bakım|Asker/i);
    expect(embed.image?.url).toBe(STATE_PROFILE_BANNER_URL);
    expect(existsSync(STATE_PROFILE_BANNER_PATH)).toBe(true);
  });

  it("yok edilen devletin kaydını ve yok edilme açıklamasını kamu kartında korur", () => {
    const embed = renderPublicCountryProfile({
      id: "eski", name: "Eski Krallık", status: "YOK_EDİLDİ", destroyed_turn: 12, destroyed_reason: "Son yerleşkesini kaybetti.",
      settlements: [], allies: [], pacts: [], wars: [], vassals: []
    }).toJSON();
    expect(embed.title).toContain("🏴");
    expect(JSON.stringify(embed)).toContain("YOK EDİLDİ");
    expect(JSON.stringify(embed)).toContain("Tur 12");
    expect(JSON.stringify(embed)).toContain("Son yerleşkesini kaybetti.");
  });

  it("paktın amaç', açıklama, lider ve üye devletlerini kamuya açık kartta gösterir", () => {
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
    expect(embed.image?.url).toBe(PACT_BANNER_URL);
    expect(existsSync(PACT_BANNER_PATH)).toBe(true);
  });

  it("pakt bilgisi, davet, ittifak teklifi ve devlet profilini her kanalda herkese açar", () => {
    expect(diplomacyReplyIsPublic("pakt", "bilgi")).toBe(true);
    expect(diplomacyReplyIsPublic("pakt", "liste")).toBe(true);
    expect(diplomacyReplyIsPublic("pakt", "davet")).toBe(true);
    expect(diplomacyReplyIsPublic("ittifak", "teklif")).toBe(true);
    expect(diplomacyReplyIsPublic("liman-erisimi","teklif")).toBe(true);
    expect(diplomacyReplyIsPublic("devlet-bilgisi")).toBe(true);
    expect(diplomacyReplyIsPublic("pakt", "davetlerim")).toBe(false);
    expect(diplomacyReplyIsPublic("ittifak", "liste")).toBe(false);
    expect(diplomacyReplyIsPublic("liman-erisimi","liste")).toBe(false);
  });
});
