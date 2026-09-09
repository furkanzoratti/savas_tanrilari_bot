import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { commandBuilders } from "./commands.js";
import { characterAvailableForCommand, charactersEmbed } from "./character-ui.js";

const availableCharacter = {
  role:"DIPLOMAT", assignment:"NONE", operation_status:null, character_status:"ACTIVE",
  doctrine:null, commander_victories:0, specialization:null
} as const;

describe("Akademi karakter komutları", () => {
  it("Akademi seçimlerinde karakter ve yerleşkeleri otomatik tamamlar", () => {
    const command = commandBuilders.find((item) => item.name === "akademi");
    for (const subcommand of ["ata"]) {
      const sub = command?.options?.find((item) => item.name === subcommand);
      expect(sub?.options?.find((item) => item.name === "karakter")).toMatchObject({autocomplete:true});
      expect(sub?.options?.find((item) => item.name === "yerleske")).toMatchObject({autocomplete:true});
    }
    expect(command?.options?.find((item) => item.name === "gorevden-al")?.options?.find((item) => item.name === "karakter"))
      .toMatchObject({autocomplete:true});
  });

  it("aynı turda yeniden görevlendirilebilen Diplomat ve Tüccarı doğru filtreler", () => {
    expect(characterAvailableForCommand(availableCharacter,"diplomat","vassallastir")).toBe(true);
    expect(characterAvailableForCommand(availableCharacter,"diplomat","asimilasyon")).toBe(true);
    expect(characterAvailableForCommand({...availableCharacter,assignment:"DIPLOMAT_DEFENSE"},"diplomat","gorev-bitir")).toBe(true);
    expect(characterAvailableForCommand({...availableCharacter,assignment:"DIPLOMAT_DEFENSE"},"diplomat","vassallastir")).toBe(false);
    expect(characterAvailableForCommand({...availableCharacter,role:"MERCHANT",assignment:"MERCHANT_DOMESTIC"},"tuccar","gorev-bitir")).toBe(true);
    expect(characterAvailableForCommand({...availableCharacter,character_status:"DEAD"},"diplomat","gorev-baslat")).toBe(false);
  });

  it("Diplomat görevlerinde yalnızca göreve ait seçenekleri gösterir", () => {
    const command = commandBuilders.find((item) => item.name === "diplomat");
    expect(command?.options?.map((item) => item.name)).toEqual([
      "halkla-uzlas","kultur-degistir","asimilasyon","vassallastir","vassal-entegre-et","savunma-ata","gorev-bitir"
    ]);
    const reconciliation = command?.options?.find((item) => item.name === "halkla-uzlas");
    const culture = command?.options?.find((item) => item.name === "kultur-degistir");
    const vassalize = command?.options?.find((item) => item.name === "vassallastir");
    expect(reconciliation?.options?.map((item) => item.name)).toEqual(["diplomat","olay","hedef-sehir"]);
    expect(reconciliation?.options?.find((item) => item.name === "olay")?.choices?.map((choice) => choice.value)).toEqual([
      "BLACK_MARKET","EPIDEMIC","UNREST","REBELLION"
    ]);
    expect(culture?.options?.map((item) => item.name)).toEqual(["diplomat","kultur","hedef-sehir"]);
    expect(vassalize?.options?.map((item) => item.name)).toEqual(["diplomat","hedef-ulke"]);
    expect(command?.options?.find((item) => item.name === "asimilasyon")?.options?.map((item) => item.name)).toEqual(["diplomat","hedef-sehir"]);
  });

  it("Tüccar görevlerinde yalnızca göreve ait seçenekleri gösterir", () => {
    const command = commandBuilders.find((item) => item.name === "tuccar");
    expect(command?.options?.map((item) => item.name)).toEqual([
      "yerel-ticaret","ticari-imtiyaz","satin-alma-temsilciligi","karaborsa-tasfiyesi","imtiyaz-yanit","gorev-bitir"
    ]);
    expect(command?.options?.find((item) => item.name === "yerel-ticaret")?.options?.map((item) => item.name))
      .toEqual(["tuccar","hedef-sehir"]);
    expect(command?.options?.find((item) => item.name === "ticari-imtiyaz")?.options?.map((item) => item.name))
      .toEqual(["tuccar","hedef-ulke","hedef-sehir","gelir-sehri"]);
    expect(command?.options?.find((item) => item.name === "satin-alma-temsilciligi")?.options?.map((item) => item.name))
      .toEqual(["tuccar","hedef-sehir","alim-kategorisi"]);
  });

  it("yöneticiye Akademi log kanalını ayarlama, denetleme ve test etme seçenekleri verir", () => {
    const command = commandBuilders.find((item) => item.name === "karakter-yonetim");
    const logChannel = command?.options?.find((item) => item.name === "log-kanali");
    const operations = logChannel?.options?.find((item) => item.name === "islem");

    expect(operations?.choices?.map((choice) => choice.value)).toEqual(["set","clear","status","test"]);
    expect(command?.options?.map((item)=>item.name)).toContain("tur-gorevlerini-isle");
  });

  it("yönetici mali hareket dökümünde ülke ve isteğe bağlı tur seçtirir", () => {
    const command = commandBuilders.find((item) => item.name === "hazine-hareketleri");
    expect(command?.options?.find((item)=>item.name==="ulke")).toMatchObject({required:true});
    expect(command?.options?.find((item)=>item.name==="tur")).toMatchObject({required:false,min_value:0});
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
