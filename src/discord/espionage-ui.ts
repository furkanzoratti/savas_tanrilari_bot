import { EmbedBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type Client } from "discord.js";
import { ESPIONAGE_PREPARATIONS, ESPIONAGE_SEVERITY_LABELS, ESPIONAGE_TARGETS, type EspionagePreparation, type EspionageTarget } from "../domain/espionage.js";
import { gold } from "../domain/format.js";
import { espionageService, type EspionageOperationView } from "../services/espionage-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { characterService } from "../services/character-service.js";
import { isGameMaster, requireGameMaster, resolveCountry } from "./auth.js";
import { queueCharacterLog } from "./character-ui.js";

const assignmentLabels: Record<string, string> = {
  NONE: "Müsait",
  ESPIONAGE: "Göreve gidiyor",
  ESPIONAGE_RETURNING: "Dönüş yolunda",
  CAPTURED: "Yakalandı",
  COUNTERINTELLIGENCE_TRAVELING_COUNTRY: "Ülke karşı casusluğuna gidiyor",
  COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT: "Şehir karşı casusluğuna gidiyor",
  COUNTERINTELLIGENCE_COUNTRY: "Ülke karşı casusluğu",
  COUNTERINTELLIGENCE_SETTLEMENT: "Şehir karşı casusluğu",
  PERSONAL_GUARD: "Şahsi koruma",
  CURIA: "Curia görevi",
  AGORA: "Agora görevi",
  ARMY: "Ordu görevi"
};

function playerOperationLine(operation: EspionageOperationView): string {
  const state = operation.status === "TRAVELING"
    ? `Yolda • Tur ${operation.resolve_turn} başında uygulanacak`
    : operation.status === "CANCELLED" ? "İptal edildi" : "Tamamlandı • DM anlatımı bekleniyor";
  return `• **${operation.spy_name}** → ${operation.target_country_name} / ${operation.target_settlement_name}\n↳ ${ESPIONAGE_TARGETS[operation.target_type].label} • ${state}`;
}

function detectionText(level: number | null, captured: boolean): string {
  if (captured) return "Ülke ve casus açığa çıktı; casus yakalandı";
  if (level === 2) return "Kaynak ülke tespit edildi";
  if (level === 1) return "Yabancı müdahale fark edildi";
  return "İz bulunamadı";
}

export function espionageLogEmbed(operation: EspionageOperationView): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(operation.captured ? 0xed4245 : operation.severity === "HEAVY" ? 0x8b1e1e : operation.severity === "NONE" ? 0x747f8d : 0xc59b45)
    .setTitle(`🕵️ Casusluk Operasyonu • Tur ${operation.resolve_turn}`)
    .setDescription([
      `**Saldıran:** ${operation.attacker_country_name} • **Casus:** ${operation.spy_name} (+${operation.spy_skill_bonus})`,
      `**Hedef:** ${operation.target_country_name} / ${operation.target_settlement_name}`,
      `**Hedef Türü:** ${ESPIONAGE_TARGETS[operation.target_type].label}`,
      operation.target_character_name ? `**Özel Hedef:** ${operation.target_character_name}` : operation.target_army_name ? `**Özel Hedef:** ${operation.target_army_name}` : null,
      `**Hazırlık:** ${ESPIONAGE_PREPARATIONS[operation.preparation].label} • ${gold(operation.preparation_cost)}`,
      "",
      `**Geçerli Hedef:** ${operation.valid_target ? `Evet • ${operation.target_building_name ?? operation.target_building_type}` : "Hayır"}`,
      `**Başarı Zarı:** ${operation.attack_roll} → **${operation.attack_total}**`,
      `**Savunma Zarı:** ${operation.defense_roll} → **${operation.defense_total}**`,
      `**Fark / Sonuç:** ${operation.margin} • **${ESPIONAGE_SEVERITY_LABELS[operation.severity ?? "NONE"]}**`,
      `**Mekanik Etki:** ${operation.effect_text ?? "Yok"}`,
      "",
      `**Tespit Zarı:** ${operation.detection_roll} → **${operation.detection_total}**`,
      `**Tespit Sonucu:** ${detectionText(operation.detection_level, operation.captured)}`,
      operation.captured && operation.target_type === "ASSASSINATE" ? "**Sonuç:** Yakalanan Suikastçı kalıcı olarak kaybedildi." : operation.captured ? `**Esaret:** Casus Tur ${operation.return_turn + 2} başında yeniden kullanılabilir.` : `**Dönüş:** Tur ${operation.return_turn} başında yeniden kullanılabilir.`
    ].filter((line):line is string=>line!==null).join("\n"))
    .setFooter({ text: `Operasyon: ${operation.id}` })
    .setTimestamp(operation.resolved_at ?? new Date());
}

export async function publishPendingEspionageLogs(client: Client, guildId: string): Promise<number> {
  const channelId = await characterService.logChannel(guildId) ?? await espionageService.logChannel(guildId);
  if (!channelId) return 0;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) throw new Error("Casusluk log kanalı bulunamadı veya metin kanalı değil.");
  let published = 0;
  for (const operation of await espionageService.pendingLogs(guildId)) {
    await channel.send({ embeds: [espionageLogEmbed(operation)] });
    await espionageService.markLogged(operation.id);
    published += 1;
  }
  return published;
}

async function logEspionageCommand(interaction: ChatInputCommandInteraction, countryName: string, entry: string): Promise<void> {
  await queueCharacterLog({
    client:interaction.client,guildId:interaction.guildId!,interactionId:interaction.id,
    actorUserId:interaction.user.id,title:"Casus Görev Günlüğü",source:"ESPIONAGE_COMMAND",
    entry:"🕵️ <@"+interaction.user.id+"> • **"+countryName+"**\n↳ "+entry
  }).catch(() => undefined);
}

export async function handleEspionageCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (interaction.commandName === "casusluk") {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });
    const country = await resolveCountry(interaction);
    if (sub === "gorev-baslat") {
      const targetCountry = await gameService.countryByName(interaction.guildId, interaction.options.getString("hedef-ulke", true));
      if (!targetCountry) throw new GameError("Hedef ülke bulunamadı.");
      const operation = await espionageService.startOperation({
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        attackerCountryId: country.id,
        spyCharacterId: interaction.options.getString("casus", true),
        targetCountryId: targetCountry.id,
        targetSettlementId: interaction.options.getString("hedef-sehir", true),
        targetType: interaction.options.getString("hedef", true) as EspionageTarget,
        preparation: interaction.options.getString("hazirlik", true) as EspionagePreparation,
        targetCharacterId: ["DISCREDIT","KIDNAP","ASSASSINATE"].includes(interaction.options.getString("hedef",true)) ? interaction.options.getString("ozel-hedef") : null,
        targetArmyId: ["SUPPLY_COLLAPSE","DESERTION"].includes(interaction.options.getString("hedef",true)) ? interaction.options.getString("ozel-hedef") : null
      });
      await interaction.editReply([
        `🕵️ **${operation.spy_name}**, **${operation.target_country_name} / ${operation.target_settlement_name}** hedefine gönderildi.`,
        `Görev: **${ESPIONAGE_TARGETS[operation.target_type].label}** • Çözüm: **Tur ${operation.resolve_turn}**`,
        `Hazırlık gideri: **${gold(operation.preparation_cost)}**`,
        "Hedefin uygunluğu ve gerçek mekanik sonuç oyuncuya açıklanmaz. Sonuç DM anlatımıyla duyurulacaktır."
      ].join("\n"));
      await logEspionageCommand(interaction,country.name,"**"+operation.spy_name+"**, **"+operation.target_country_name+" / "+operation.target_settlement_name+"** hedefine gönderildi • "+ESPIONAGE_TARGETS[operation.target_type].label+" • Çözüm Tur "+operation.resolve_turn+".");
      return true;
    }
    if (sub === "operasyonlarim") {
      const operations = await espionageService.operationsForCountry(country.id);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x4b4d52).setTitle(`🕵️ ${country.name} • Casusluk Operasyonları`).setDescription(operations.length ? operations.map(playerOperationLine).join("\n\n").slice(0, 4_000) : "Henüz operasyon bulunmuyor.")] });
      await logEspionageCommand(interaction,country.name,"Casusluk operasyonlarını görüntüledi.");
      return true;
    }
    if (sub === "casuslarim") {
      const spies = await espionageService.spies(country.id);
      const text = spies.length ? spies.map((spy) => `• **${spy.name}** (+${spy.skill_bonus}) — ${assignmentLabels[spy.assignment] ?? spy.assignment}${spy.country_name && spy.settlement_name ? `\n↳ ${spy.country_name} • ${spy.settlement_name}` : ""}`).join("\n\n") : "Akademide yetişmiş casus bulunmuyor.";
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x4b4d52).setTitle(`🕵️ ${country.name} • Casuslar`).setDescription(text.slice(0, 4_000))] });
      await logEspionageCommand(interaction,country.name,"Casus listesini görüntüledi.");
      return true;
    }
    if (sub === "savunma-ata") {
      const scope = interaction.options.getString("kapsam", true) as "COUNTRY" | "SETTLEMENT" | "CHARACTER";
      const settlementId = interaction.options.getString("sehir");
      if (scope === "SETTLEMENT" && !settlementId) throw new GameError("Şehir karşı casusluğu için bir şehir seçmelisiniz.");
      const protectedCharacterId = interaction.options.getString("korunan-karakter");
      if (scope === "CHARACTER" && !protectedCharacterId) throw new GameError("Şahsi koruma için korunacak karakteri seçmelisiniz.");
      await espionageService.assignDefense({ guildId: interaction.guildId, countryId: country.id, spyCharacterId: interaction.options.getString("casus", true), scope, settlementId,characterId:protectedCharacterId });
      await interaction.editReply({ content: `🛡️ Casus karşı casusluk görevine gönderildi; **bir sonraki tur başında** göreve başlayacak: **${scope === "COUNTRY" ? `${country.name} geneli` : scope === "SETTLEMENT" ? "seçilen şehir" : "seçilen karakter"}**.` });
      await logEspionageCommand(interaction,country.name,"Casus karşı casusluk görevine atandı • **"+scope+"**.");
      return true;
    }
    if (sub === "savunma-kaldir") {
      await espionageService.removeDefense({ guildId: interaction.guildId, countryId: country.id, spyCharacterId: interaction.options.getString("casus", true) });
      await interaction.editReply({ content: "✅ Casusun karşı casusluk görevi kaldırıldı." });
      await logEspionageCommand(interaction,country.name,"Casusun karşı casusluk görevi kaldırıldı.");
      return true;
    }
    if (sub === "bina-onar") {
      const settlementId=interaction.options.getString("sehir",true);
      const cost=await espionageService.repairBuilding({countryId:country.id,settlementId,buildingType:interaction.options.getString("hasarli-bina",true)});
      await interaction.editReply(`✅ Bina onarıldı ve yeniden etkinleştirildi. Şehir hazinesinden **${gold(cost)}** ödendi.`);
      await logEspionageCommand(interaction,country.name,"Casusluk hasarlı bina onarıldı • **"+gold(cost)+"** ödendi.");
      return true;
    }
  }
  if (interaction.commandName === "casusluk-yonetim") {
    requireGameMaster(interaction);
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });
    if (sub === "log-kanali") {
      const operation = interaction.options.getString("islem", true);
      const channel = interaction.options.getChannel("kanal");
      if (operation === "set" && !channel) throw new GameError("Bir log kanalı seçmelisiniz.");
      await espionageService.setLogChannel(interaction.guildId, operation === "set" ? channel!.id : null);
      if (operation === "set") await publishPendingEspionageLogs(interaction.client, interaction.guildId);
      await interaction.editReply(operation === "set" ? `✅ Casusluk sonuçları ${channel} kanalına gönderilecek.` : "✅ Casusluk log kanalı kapatıldı; veritabanı kayıtları korunur.");
      return true;
    }
    if (sub === "listele") {
      const operations = await espionageService.adminList(interaction.guildId);
      const lines = operations.map((item) => `• \`${item.id.slice(0, 8)}\` **${item.attacker_country_name}** → ${item.target_country_name} / ${item.target_settlement_name}\n↳ ${item.status} • Tur ${item.resolve_turn}`);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x4b4d52).setTitle("🔒 Casusluk Yönetim Kayıtları").setDescription(lines.length ? lines.join("\n\n").slice(0, 4_000) : "Operasyon bulunmuyor.")] });
      return true;
    }
    if (sub === "iptal") {
      await espionageService.cancel({ guildId: interaction.guildId, operationId: interaction.options.getString("operasyon", true) });
      await interaction.editReply("✅ Yoldaki operasyon iptal edildi ve casus yeniden müsait duruma getirildi. Hazırlık bedeli iade edilmedi.");
      return true;
    }
  }
  return false;
}

export async function handleEspionageAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  if (!interaction.guildId || !["casusluk", "casusluk-yonetim"].includes(interaction.commandName)) return false;
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
  if (interaction.commandName === "casusluk-yonetim" && focused.name === "operasyon") {
    if (!isGameMaster(interaction)) { await interaction.respond([]); return true; }
    const rows = (await espionageService.adminList(interaction.guildId)).filter((item) => item.status === "TRAVELING");
    await interaction.respond(rows.filter((item) => !query || `${item.attacker_country_name} ${item.target_country_name} ${item.target_settlement_name}`.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item) => ({ name: `${item.attacker_country_name} → ${item.target_country_name} / ${item.target_settlement_name}`.slice(0,100), value: item.id })));
    return true;
  }
  const own = await gameService.countryForUser(interaction.guildId, interaction.user.id);
  if (!own) { await interaction.respond([]); return true; }
  if (focused.name === "casus") {
    const spies = await espionageService.spies(own.id);
    const sub = interaction.options.getSubcommand(false);
    const filtered = ["gorev-baslat", "savunma-ata"].includes(sub ?? "") ? spies.filter((spy) => spy.assignment === "NONE")
      : sub === "savunma-kaldir" ? spies.filter((spy) => spy.assignment.startsWith("COUNTERINTELLIGENCE"))
      : spies.filter((spy) => spy.assignment === "NONE" || spy.assignment.startsWith("COUNTERINTELLIGENCE"));
    await interaction.respond(filtered.filter((spy) => !query || spy.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((spy) => ({ name: `${spy.name} (+${spy.skill_bonus}) • ${assignmentLabels[spy.assignment] ?? spy.assignment}`.slice(0,100), value: spy.id })));
    return true;
  }
  if (focused.name === "hedef-ulke") {
    const countries = (await gameService.listCountries(interaction.guildId)).filter((item) => item.id !== own.id);
    await interaction.respond(countries.filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item) => ({ name: item.name, value: item.name })));
    return true;
  }
  if (focused.name === "hedef-sehir") {
    const name = interaction.options.getString("hedef-ulke");
    const target = name ? await gameService.countryByName(interaction.guildId,name) : null;
    const settlements = target ? await gameService.listSettlements(target.id) : [];
    await interaction.respond(settlements.filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item) => ({ name: item.name, value: item.id })));
    return true;
  }
  if (focused.name === "ozel-hedef") {
    const targetType = interaction.options.getString("hedef") as EspionageTarget|null;
    const name = interaction.options.getString("hedef-ulke");
    const target = name ? await gameService.countryByName(interaction.guildId,name) : null;
    if (!target || !targetType) { await interaction.respond([]); return true; }
    const kind = ["DISCREDIT","KIDNAP","ASSASSINATE"].includes(targetType) ? "CHARACTER"
      : ["SUPPLY_COLLAPSE","DESERTION"].includes(targetType) ? "ARMY" : null;
    const rows = kind ? await espionageService.targets(target.id,kind) : [];
    await interaction.respond(rows.filter((item)=>!query||item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item)=>({name:item.name.slice(0,100),value:item.id})));
    return true;
  }
  if (focused.name === "korunan-karakter") {
    const rows = (await gameService.document(own.id)).characters.filter((item)=>item.id !== interaction.options.getString("casus"));
    await interaction.respond(rows.filter((item)=>!query||item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item)=>({name:`${item.name} • ${item.role}`.slice(0,100),value:item.id})));
    return true;
  }
  if (focused.name === "sehir") {
    const settlements = await gameService.listSettlements(own.id);
    await interaction.respond(settlements.filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item) => ({ name: item.name, value: item.id })));
    return true;
  }
  if (focused.name === "hasarli-bina") {
    const rows=await espionageService.damagedBuildings(own.id,interaction.options.getString("sehir"));
    await interaction.respond(rows.filter((item)=>!query||`${item.name} ${item.settlement_name}`.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25)
      .map((item)=>({name:`${item.name} • ${item.cost.toLocaleString("tr-TR")} Altın`.slice(0,100),value:item.key})));
    return true;
  }
  await interaction.respond([]);
  return true;
}
