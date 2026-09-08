import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { commandBuilders } from "./commands.js";
import { charactersEmbed } from "./character-ui.js";

describe("Akademi karakter komutları", () => {
  it("Diplomat görevlerinde gerekli hedefleri seçimli olarak sunar", () => {
    const command = commandBuilders.find((item) => item.name === "diplomat");
    const start = command?.options?.find((item) => item.name === "gorev-baslat");

    expect(start?.options?.find((item) => item.name === "diplomat")).toMatchObject({required:true,autocomplete:true});
    expect(start?.options?.find((item) => item.name === "hedef-sehir")).toMatchObject({autocomplete:true});
    expect(start?.options?.find((item) => item.name === "olay")?.choices?.map((choice) => choice.value)).toEqual([
      "BLACK_MARKET","EPIDEMIC","UNREST","REBELLION"
    ]);
  });

  it("yöneticiye Akademi log kanalını ayarlama, denetleme ve test etme seçenekleri verir", () => {
    const command = commandBuilders.find((item) => item.name === "karakter-yonetim");
    const logChannel = command?.options?.find((item) => item.name === "log-kanali");
    const operations = logChannel?.options?.find((item) => item.name === "islem");

    expect(operations?.choices?.map((choice) => choice.value)).toEqual(["set","clear","status","test"]);
  });

  it("Tüccar görevini casusluk açıklamasına düşürmeden doğru gösterir", () => {
    const embed = charactersEmbed("Gallaekler", [{
      id:"00000000-0000-4000-8000-000000000001",country_id:"00000000-0000-4000-8000-000000000002",
      name:"Yiğit Oçku",role:"MERCHANT",skill_bonus:0,assignment:"MERCHANT_FOREIGN",
      assignment_ready_turn:null,doctrine:null,commander_victories:0,specialization:null,
      specialization_progress:0,specialization_level:0,character_status:"ACTIVE",unavailable_until_turn:null,
      trained_settlement_name:null,assigned_settlement_name:"Persepolis",assigned_country_name:"Persler",
      assigned_army_name:null,operation_type:"FOREIGN_CONCESSION",operation_status:"ACTIVE",
      operation_progress:null,operation_goal:null,target_country_name:"Persler",target_settlement_name:"Persepolis"
    }]).toJSON();

    expect(embed.description).toContain("Yabancı Ticari İmtiyaz");
    expect(embed.description).not.toContain("Şehir karşı casusluğu");
  });
});
