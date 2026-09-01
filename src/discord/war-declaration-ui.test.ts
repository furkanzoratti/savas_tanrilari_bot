import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { commandBuilders } from "./commands.js";
import {
  WAR_DECLARATION_BANNER_PATH, WAR_DECLARATION_BANNER_URL,
  PEACE_TREATY_BANNER_PATH, PEACE_TREATY_BANNER_URL
} from "./assets.js";
import { parsePeaceIndemnity, renderPeaceAnnouncement, renderPeaceOffer, renderWarDeclaration, renderWarEndAnnouncement, renderWarInvitation } from "./war-declaration-ui.js";

describe("resmî savaş ilanları ve barış duyuruları", () => {
  it("oyuncu ve yönetici savaş komutlarını ayrı ayrı kaydeder", () => {
    const names = commandBuilders.map((command) => command.name);
    expect(names).toEqual(expect.arrayContaining([
      "savas-ilan-kanali", "savas-ilani", "pakt-savasi", "savas-cagrisi", "savas-yapilandir", "baris-teklifi", "aktif-savaslar", "savas-sonlandir"
    ]));
    expect(commandBuilders.find((command) => command.name === "yonetim")?.options?.length).toBeLessThanOrEqual(25);
  });

  it("mevcut savaşları bütün yönetici yapılandırma işlemleriyle düzenleyebilir", () => {
    const command = commandBuilders.find((item) => item.name === "savas-yapilandir");
    const subcommands = command?.options?.map((option) => option.name);
    expect(subcommands).toEqual([
      "hedef-ayarla", "pakt-bagla", "pakt-kaldir", "ulke-ekle", "ulke-cikar", "lider-degistir"
    ]);
    for (const subcommand of command?.options ?? []) {
      const warOption = subcommand.options?.find((option) => option.name === "savas");
      expect(warOption).toMatchObject({ required: true, autocomplete: true });
    }
  });

  it("savaş ilanını gerekçe, metin ve özgün banner ile gösterir", () => {
    const embed = renderWarDeclaration({
      id: "war", guild_id: "guild", attacker_country_id: "roma", attacker_country_name: "Roma",
      defender_country_id: "kartaca", defender_country_name: "Kartaca", reason: "Sınır anlaşmazlığı",
      war_goal: "Sicilya'nın güvenliği", war_type: "FACTION", attacker_pact_id: null, attacker_pact_name: null,
      defender_pact_id: null, defender_pact_name: null,
      attacker_participant_names: ["Roma", "Massilia"], defender_participant_names: ["Kartaca", "Numidya"],
      declaration: "Senatonun resmî kararı", status: "ACTIVE", started_turn: 12,
      ended_turn: null, winner_country_id: null, winner_country_name: null, end_outcome: null, end_description: null,
      channel_id: null, message_id: null
    }).toJSON();
    expect(JSON.stringify(embed)).toContain("Sınır anlaşmazlığı");
    expect(JSON.stringify(embed)).toContain("Senatonun resmî kararı");
    expect(JSON.stringify(embed)).toContain("Sicilya'nın güvenliği");
    expect(JSON.stringify(embed)).toContain("Massilia");
    expect(JSON.stringify(embed)).toContain("Numidya");
    expect(embed.image?.url).toBe(WAR_DECLARATION_BANNER_URL);
    expect(existsSync(WAR_DECLARATION_BANNER_PATH)).toBe(true);
  });

  it("savaş çağrısında hedef devleti, cepheyi ve savaş hedefini gösterir", () => {
    const war = {
      id: "war", guild_id: "guild", attacker_country_id: "roma", attacker_country_name: "Roma",
      defender_country_id: "kartaca", defender_country_name: "Kartaca", war_goal: "Sicilya'nın güvenliği",
      war_type: "FACTION" as const, attacker_pact_id: null, attacker_pact_name: null,
      defender_pact_id: null, defender_pact_name: null, attacker_participant_names: ["Roma"],
      defender_participant_names: ["Kartaca"], reason: "Sınır anlaşmazlığı", declaration: "İlan",
      status: "ACTIVE" as const, started_turn: 12, ended_turn: null, winner_country_id: null,
      winner_country_name: null, end_outcome: null, end_description: null, channel_id: null, message_id: null
    };
    const embed = renderWarInvitation({
      id: "invite", guild_id: "guild", war_id: "war", country_id: "massilia", country_name: "Massilia",
      side: "ATTACKER", invited_by_country_id: "roma", invited_by_country_name: "Roma", status: "PENDING",
      invited_turn: 13, responded_turn: null, channel_id: null, message_id: null
    }, war).toJSON();
    expect(JSON.stringify(embed)).toContain("Massilia");
    expect(JSON.stringify(embed)).toContain("Roma Cephesi");
    expect(JSON.stringify(embed)).toContain("Sicilya'nın güvenliği");
  });

  it("barış teklifinde tazminatı ve ödeyen tarafı açıklar", () => {
    const embed = renderPeaceOffer({
      id: "offer", guild_id: "guild", war_id: "war", proposer_country_id: "roma", proposer_country_name: "Roma",
      receiver_country_id: "kartaca", receiver_country_name: "Kartaca", terms: "Sınırlar korunacak.",
      indemnity_amount: 10_000, payer_country_id: "kartaca", payer_country_name: "Kartaca",
      recipient_country_id: "roma", recipient_country_name: "Roma", status: "PENDING", offered_turn: 13,
      resolved_turn: null, channel_id: null, message_id: null
    }).toJSON();
    expect(JSON.stringify(embed)).toContain("10.000 Altın");
    expect(JSON.stringify(embed)).toContain("Sınırlar korunacak.");
  });

  it("savaş sonlandırma komutunda aktif savaş seçimi ve üç sonuç seçeneği sunar", () => {
    const command = commandBuilders.find((item) => item.name === "savas-sonlandir");
    const warOption = command?.options?.find((option) => option.name === "savas");
    const winnerOption = command?.options?.find((option) => option.name === "kazanan");
    expect(warOption).toMatchObject({ required: true, autocomplete: true });
    expect(winnerOption).toMatchObject({ required: true, autocomplete: true });
  });

  it("kazananı ve yönetici açıklamasını kamuya açık savaş bitiş duyurusunda gösterir", () => {
    const embed = renderWarEndAnnouncement({
      firstCountry: "Roma", secondCountry: "Kartaca", winnerCountry: "Roma",
      outcome: "ATTACKER_VICTORY", turn: 14, description: "Kartaca ordusu teslim oldu."
    }).toJSON();
    expect(JSON.stringify(embed)).toContain("Kazanan: **Roma**");
    expect(JSON.stringify(embed)).toContain("Kartaca ordusu teslim oldu.");
    expect(embed.image?.url).toBe(PEACE_TREATY_BANNER_URL);
  });

  it("beyaz barış sonucunda kazanan devlet göstermeden savaşı kapatır", () => {
    const embed = renderWarEndAnnouncement({
      firstCountry: "Roma", secondCountry: "Kartaca", winnerCountry: null,
      outcome: "WHITE_PEACE", turn: 14, description: "Taraflar mevcut sınırlara döndü."
    }).toJSON();
    expect(JSON.stringify(embed)).toContain("Beyaz Barış");
    expect(JSON.stringify(embed)).not.toContain("Kazanan:");
  });

  it("kamuya açık barış kapanışını özgün banner ile gösterir", () => {
    const embed = renderPeaceAnnouncement({
      firstCountry: "Roma", secondCountry: "Kartaca", turn: 13, terms: "Saldırmazlık",
      indemnityAmount: 10_000, payerCountry: "Kartaca", recipientCountry: "Roma"
    }).toJSON();
    expect(JSON.stringify(embed)).toContain("10.000 Altın");
    expect(embed.image?.url).toBe(PEACE_TREATY_BANNER_URL);
    expect(existsSync(PEACE_TREATY_BANNER_PATH)).toBe(true);
  });

  it("uzun barış şartlarını Discord alan sınırı nedeniyle kesmeden bölümlere ayırır", () => {
    const terms = "A".repeat(1_100) + "ANTLAŞMANIN SONU";
    const embed = renderPeaceAnnouncement({ firstCountry: "Roma", secondCountry: "Kartaca", turn: 13, terms }).toJSON();
    expect(embed.fields?.some((field) => field.name.includes("Devamı"))).toBe(true);
    expect(JSON.stringify(embed)).toContain("ANTLAŞMANIN SONU");
  });

  it("Türkçe ayrılmış tutarları okur ve negatif değerleri reddeder", () => {
    expect(parsePeaceIndemnity("10.000")).toBe(10_000);
    expect(parsePeaceIndemnity(" ")).toBe(0);
    expect(() => parsePeaceIndemnity("-100")).toThrow();
    expect(() => parsePeaceIndemnity("10 altın")).toThrow();
  });
});
