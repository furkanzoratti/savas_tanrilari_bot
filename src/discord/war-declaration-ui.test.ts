import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { commandBuilders } from "./commands.js";
import { countryFlagEmojiName } from "./country-flag-emojis.js";
import {
  WAR_DECLARATION_BANNER_PATH, WAR_DECLARATION_BANNER_URL,
  PEACE_TREATY_BANNER_PATH, PEACE_TREATY_BANNER_URL
} from "./assets.js";
import { parsePeaceIndemnity, renderActiveWarDetail, renderActiveWarPages, renderActiveWarSelectionRows, renderPeaceAnnouncement, renderPeaceOffer, renderWarDeclaration, renderWarEndAnnouncement, renderWarInvitation } from "./war-declaration-ui.js";

describe("resmî savaş ilanları ve barış duyuruları", () => {
  it("devlet adlarını sunucudaki bayrak emoji adlarına eşler", () => {
    expect(countryFlagEmojiName("Bosporos Krallığı")).toBe("bosporoc");
    expect(countryFlagEmojiName("Büyük Britanya")).toBe("britanya");
    expect(countryFlagEmojiName("Nil İmparatorluğu")).toBe("nilimp");
    expect(countryFlagEmojiName("Satraplar")).toBe("satraplar");
    expect(countryFlagEmojiName("Baykal Devleti")).toBeNull();
  });

  it("oyuncu ve yönetici savaş komutlarını ayrı ayrı kaydeder", () => {
    const names = commandBuilders.map((command) => command.name);
    expect(names).toEqual(expect.arrayContaining([
      "savas-ilan-kanali", "savas-ilani", "pakt-savasi", "savas-cagrisi", "savas-yapilandir", "baris-teklifi", "aktif-savaslar", "savas-sonlandir"
    ]));
    expect(commandBuilders.find((command) => command.name === "yonetim")?.options?.length).toBeLessThanOrEqual(25);
    const peaceCommand = commandBuilders.find((command) => command.name === "baris-teklifi");
    expect(peaceCommand?.description).toContain("görsel form");
    expect(peaceCommand?.options?.map((option) => option.name)).toEqual(["ulke"]);
  });

  it("valilik komutunda görsel divanı ve geriye dönük yönetim alt komutlarını korur", () => {
    const governorship = commandBuilders.find((command) => command.name === "valilik");
    expect(governorship?.options?.map((option) => option.name)).toEqual([
      "listele", "ata", "odak-degistir", "gorevden-al"
    ]);
    expect(governorship?.options?.find((option) => option.name === "listele")?.description).toContain("divanını açar");
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

  it("aktif savaşları okunabilir kartlara ayırır ve uzun listeleri sayfalar",()=>{
    const base={
      id:"war",guild_id:"guild",attacker_country_id:"roma",attacker_country_name:"Roma",
      defender_country_id:"kartaca",defender_country_name:"Kartaca",war_goal:"Sicilya'nın güvenliği",
      war_type:"FACTION" as const,attacker_pact_id:null,attacker_pact_name:null,
      defender_pact_id:null,defender_pact_name:null,attacker_participant_names:["Roma","Massilia"],
      defender_participant_names:["Kartaca","Numidya"],reason:"Sınır anlaşmazlığı",declaration:"İlan",
      status:"ACTIVE" as const,started_turn:12,ended_turn:null,winner_country_id:null,
      winner_country_name:null,end_outcome:null,end_description:null,channel_id:null,message_id:null
    };
    const pages=renderActiveWarPages(Array.from({length:7},(_,index)=>({...base,id:`war-${index}`})));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.toJSON().fields).toHaveLength(6);
    expect(pages[1]!.toJSON().fields).toHaveLength(1);
    const first=JSON.stringify(pages[0]!.toJSON());
    expect(first).toContain("🏳️ **Roma**");
    expect(first).not.toContain("👑");
    expect(first).not.toContain("işareti cephe liderini gösterir");
    expect(first).toContain("Saldıran");
    expect(first).toContain("Savunan");
    expect(first).toContain("Çok Taraflı Savaş");
    const selections=renderActiveWarSelectionRows(Array.from({length:7},(_,index)=>({...base,id:`war-${index}`})));
    expect(selections).toHaveLength(2);
    expect(selections[0]!.toJSON().components[0]?.custom_id).toBe("active_war_detail|0");
    expect(selections[0]!.toJSON().components[0]?.options).toHaveLength(6);
  });

  it("seçilen savaşın puan, kayıp, muharebe ve işgal ayrıntılarını gösterir",()=>{
    const war={
      id:"war",guild_id:"guild",attacker_country_id:"roma",attacker_country_name:"Roma",
      defender_country_id:"kartaca",defender_country_name:"Kartaca",war_goal:"Sicilya'nın güvenliği",
      goal_type:"CONQUEST" as const,goal_target_country_id:"kartaca",goal_target_country_name:"Kartaca",
      goal_target_settlement_id:"sirakuza",goal_target_settlement_name:"Siraküza",attacker_score:29,
      war_type:"COUNTRY" as const,attacker_pact_id:null,attacker_pact_name:null,
      defender_pact_id:null,defender_pact_name:null,attacker_participant_names:["Roma"],
      defender_participant_names:["Kartaca"],attacker_diplomatic_ally_names:[],defender_diplomatic_ally_names:[],
      reason:"Sınır anlaşmazlığı",declaration:"İlan",status:"ACTIVE" as const,started_turn:12,ended_turn:null,
      winner_country_id:null,winner_country_name:null,end_outcome:null,end_description:null,channel_id:null,message_id:null
    };
    const embeds=renderActiveWarDetail({
      war,attackerLosses:450,defenderLosses:800,
      battles:[{
        id:"battle",terrain:"SIEGE",status:"FINISHED",round_number:3,winner_side:"A",finish_reason:"Şehir düştü",
        defender_settlement_name:"Siraküza",country_a_name:"Roma",country_b_name:"Kartaca",
        official_side_a:"ATTACKER",official_side_b:"DEFENDER",initial_a:5000,current_a:4550,losses_a:450,
        initial_b:3000,current_b:2200,losses_b:800,battle_score_side:"ATTACKER",battle_score_points:4
      },{
        id:"active-siege",terrain:"SIEGE",status:"WAITING_FIRST_ROLL",round_number:1,winner_side:null,finish_reason:null,
        defender_settlement_name:"Gizli Kale",country_a_name:"Roma",country_b_name:"Kartaca",
        official_side_a:"ATTACKER",official_side_b:"DEFENDER",initial_a:9999,current_a:9999,losses_a:0,
        initial_b:4999,current_b:4999,losses_b:0,battle_score_side:null,battle_score_points:0
      }],
      scoreEvents:[
        {id:"event",side:"ATTACKER",event_type:"OCCUPATION",points:10,game_turn:13,battle_id:"battle",settlement_id:"sirakuza",settlement_name:"Siraküza",battle_terrain:"SIEGE"}
      ],
      occupations:[{
        id:"occupation",settlement_id:"sirakuza",settlement_name:"Siraküza",occupier_country_id:"roma",occupier_country_name:"Roma",
        legal_owner_country_id:"kartaca",legal_owner_country_name:"Kartaca",started_turn:13,status:"ACTIVE",ended_turn:null,score_points:25
      }]
    });
    const overview=embeds[0]!.toJSON();
    const text=JSON.stringify(embeds.map((embed)=>embed.toJSON()));
    expect(overview.fields?.some((field)=>field.name==="🔴 Saldıran Cephe")).toBe(true);
    expect(overview.fields?.some((field)=>field.name==="🔵 Savunan Cephe")).toBe(true);
    expect(text).toContain("29 / 100");
    expect(text).toContain("450");
    expect(text).toContain("800");
    expect(text).toContain("Siraküza");
    expect(text).not.toContain("Lejyoner");
    expect(text).not.toContain("4550/5000");
    expect(text).not.toContain("Gizli Kale");
    expect(text).not.toContain("9999");
    expect(text).toContain("+4 Saldıran");
    expect(text).toContain("+10");
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
