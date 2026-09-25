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
  doctrine:null, commander_victories:0, specialization:null, specialization_progress:0, is_admiral:false
} as const;

describe("Akademi karakter komutları", () => {
  it("Akademi seçimlerinde karakter ve yerleşkeleri otomatik tamamlar", () => {
    const command = commandBuilders.find((item) => item.name === "akademi");
    for (const subcommand of ["ata"]) {
      const sub = command?.options?.find((item) => item.name === subcommand);
      expect(sub?.options?.find((item) => item.name === "karakter")).toMatchObject({autocomplete:true});
      expect(sub?.options?.find((item) => item.name === "yerleske")).toMatchObject({autocomplete:true});
    }
    for (const subcommand of ["gorevden-al","karakteri-gorevden-al"]) {
      expect(command?.options?.find((item) => item.name === subcommand)?.options?.find((item) => item.name === "karakter"))
        .toMatchObject({autocomplete:true});
    }
  });

  it("yalnız müsait ve henüz dönüşmemiş Komutanı Amiralliğe sunar", () => {
    const command = commandBuilders.find((item) => item.name === "komutan");
    expect(command?.options?.map((item)=>item.name)).toContain("amirale-donustur");
    const commander={...availableCharacter,role:"COMMANDER" as const};
    expect(characterAvailableForCommand(commander,"komutan","amirale-donustur")).toBe(true);
    expect(characterAvailableForCommand({...commander,is_admiral:true},"komutan","amirale-donustur")).toBe(false);
    expect(characterAvailableForCommand({...commander,assignment:"ARMY"},"komutan","amirale-donustur")).toBe(false);
  });

  it("Amiral için ayrı doktrin ve 3 deniz zaferinde açılan uzmanlık sunar",()=>{
    const command=commandBuilders.find((item)=>item.name==="amiral");
    expect(command?.options?.map((item)=>item.name)).toEqual(["doktrin-sec","uzmanlik-sec"]);
    expect(command?.options?.find((item)=>item.name==="doktrin-sec")?.options?.find((item)=>item.name==="doktrin")?.choices)
      .toHaveLength(5);
    expect(command?.options?.find((item)=>item.name==="uzmanlik-sec")?.options?.find((item)=>item.name==="uzmanlik")?.choices)
      .toHaveLength(4);
    const admiral={
      ...availableCharacter,role:"COMMANDER" as const,is_admiral:true,
      admiral_doctrine:null,admiral_specialization:null,admiral_victories:2
    };
    expect(characterAvailableForCommand(admiral,"amiral","doktrin-sec")).toBe(true);
    expect(characterAvailableForCommand(admiral,"amiral","uzmanlik-sec")).toBe(false);
    expect(characterAvailableForCommand({...admiral,admiral_victories:3},"amiral","uzmanlik-sec")).toBe(true);
    expect(characterAvailableForCommand(admiral,"komutan","doktrin-sec")).toBe(false);
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
      "halkla-uzlas","kultur-degistir","asimilasyon","vassallastir","vassal-entegre-et","savunma-ata","uzmanlik-sec","gorev-bitir"
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
      "yerel-ticaret","ticari-imtiyaz","satin-alma-temsilciligi","karaborsa-tasfiyesi","imtiyaz-yanit","uzmanlik-sec","gorev-bitir"
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
    const manualCharacter=command?.options?.find((item)=>item.name==="karakter-ekle");
    expect(manualCharacter?.options?.map((item)=>item.name)).toEqual(["ulke","rol","ad","bonus"]);
    expect(manualCharacter?.options?.find((item)=>item.name==="rol")?.choices?.map((choice)=>choice.value))
      .toEqual(["SPY","MERCHANT","COMMANDER","DIPLOMAT"]);
    expect(manualCharacter?.options?.find((item)=>item.name==="bonus")).toMatchObject({required:true,min_value:0,max_value:5});
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
      specialization_progress:0,specialization_level:0,character_status:"ACTIVE",is_admiral:false,unavailable_until_turn:null,
      trained_settlement_name:null,assigned_settlement_name:"Persepolis",assigned_country_name:"Persler",
      assigned_army_name:null,assigned_fleet_name:null,operation_type:"FOREIGN_CONCESSION",operation_status:"ACTIVE",
      operation_progress:null,operation_goal:null,target_country_name:"Persler",target_settlement_name:"Persepolis"
    }]).toJSON();

    expect(embed.description).toContain("Yabancı Ticari İmtiyaz");
    expect(embed.description).not.toContain("Şehir karşı casusluğu");
  });

  it("panelin üstünde Akademi kapasitesini, altında ölüm şehrini gösterir", () => {
    const base = {
      id:"00000000-0000-4000-8000-000000000011",country_id:"00000000-0000-4000-8000-000000000012",
      assignment:"NONE",assignment_ready_turn:null,doctrine:null,commander_victories:0,specialization:null,
      specialization_progress:0,specialization_level:0,is_admiral:false,unavailable_until_turn:null,
      trained_settlement_name:null,assigned_settlement_name:null,assigned_country_name:null,
      assigned_army_name:null,assigned_fleet_name:null,operation_type:null,operation_status:null,
      operation_progress:null,operation_goal:null,target_country_name:null,target_settlement_name:null
    } as const;
    const embed = charactersEmbed("Roma", [
      {...base,name:"Marcus",role:"COMMANDER",skill_bonus:1,character_status:"ACTIVE"},
      {...base,id:"00000000-0000-4000-8000-000000000013",name:"Cassia",role:"SPY",skill_bonus:2,
        character_status:"DEAD",died_at:"2026-09-22T12:00:00Z",death_settlement_name:"İskenderiye"},
      {...base,id:"00000000-0000-4000-8000-000000000014",name:"Livia",role:"DIPLOMAT",skill_bonus:1,
        character_status:"DEAD",died_at:"2026-09-21T12:00:00Z",death_settlement_name:"Roma"},
      {...base,id:"00000000-0000-4000-8000-000000000015",name:"Titus",role:"MERCHANT",skill_bonus:0,
        character_status:"DEAD",died_at:"2026-09-20T12:00:00Z",death_settlement_name:"Kartaca"},
      {...base,id:"00000000-0000-4000-8000-000000000016",name:"Aulus",role:"COMMANDER",skill_bonus:3,
        character_status:"DEAD",is_admiral:true,died_at:"2026-09-19T12:00:00Z",death_settlement_name:"Rodos"}
    ],{academies:2,characters:1,pending:1,capacity:10}).toJSON();

    expect(embed.description).toContain("Akademi: **2**");
    expect(embed.description).toContain("Barındırılabilir karakter: **10**");
    expect(embed.description).toContain("Mevcut karakter: **1/10**");
    expect(embed.description).toContain("💀 Ölü Karakterler");
    expect(embed.description).toContain("Öldüğü şehir: **İskenderiye**");
    expect(embed.description).toContain("**Livia** — Diplomat (+1)");
    expect(embed.description).toContain("Öldüğü şehir: **Roma**");
    expect(embed.description).toContain("**Titus** — Tüccar (+0)");
    expect(embed.description).toContain("Öldüğü şehir: **Kartaca**");
    expect(embed.description).toContain("**Aulus** — Amiral (+3)");
    expect(embed.description).toContain("Öldüğü şehir: **Rodos**");
  });

  it("Amiralin deniz zaferi, doktrini ve uzmanlık seviyesini gösterir",()=>{
    const embed=charactersEmbed("Rodos",[{
      id:"00000000-0000-4000-8000-000000000021",country_id:"00000000-0000-4000-8000-000000000022",
      name:"Theodoros",role:"COMMANDER",skill_bonus:2,assignment:"FLEET",assignment_ready_turn:null,
      doctrine:"OFFENSIVE",commander_victories:7,specialization:"FIELD_TACTICIAN",specialization_progress:7,
      specialization_level:2,character_status:"ACTIVE",is_admiral:true,admiral_doctrine:"COMBINED_FLEET",
      admiral_specialization:"SEA_RAIDER",admiral_victories:6,admiral_specialization_level:2,
      unavailable_until_turn:null,trained_settlement_name:"Rodos",assigned_settlement_name:null,
      assigned_country_name:null,assigned_army_name:null,assigned_fleet_name:"Ege Filosu",operation_type:null,
      operation_status:null,operation_progress:null,operation_goal:null,target_country_name:null,target_settlement_name:null
    }]).toJSON();
    expect(embed.description).toContain("Deniz zaferi 6/9");
    expect(embed.description).toContain("Birleşik Filo Doktrini");
    expect(embed.description).toContain("Deniz Akıncısı Sv2");
    expect(embed.description).not.toContain("Saldırı Doktrini");
    expect(embed.description).not.toContain("Meydan Taktisyeni");
  });

  it("tutsak casusun tutulduğu şehri açıkça gösterir",()=>{
    const embed=charactersEmbed("Arvernler",[{
      id:"00000000-0000-4000-8000-000000000031",country_id:"00000000-0000-4000-8000-000000000032",
      name:"Pessinus",role:"SPY",skill_bonus:0,assignment:"CAPTURED",assignment_ready_turn:null,
      doctrine:null,commander_victories:0,specialization:null,specialization_progress:0,specialization_level:0,
      character_status:"ACTIVE",is_admiral:false,unavailable_until_turn:null,trained_settlement_name:null,
      assigned_settlement_name:"Roma",assigned_country_name:"Roma",assigned_army_name:null,assigned_fleet_name:null,
      operation_type:null,operation_status:null,operation_progress:null,operation_goal:null,
      target_country_name:null,target_settlement_name:null
    }]).toJSON();
    expect(embed.description).toContain("Esir");
    expect(embed.description).toContain("Tutsak olduğu şehir: **Roma** (Roma)");
  });
});
