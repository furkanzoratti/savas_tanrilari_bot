import { EmbedBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type Client } from "discord.js";
import { CHARACTER_ROLES } from "../domain/catalog.js";
import {
  CHARACTER_SPECIALIZATIONS, COMMANDER_DOCTRINES, DIPLOMAT_TASK_LABELS, MERCHANT_TASK_LABELS,
  type CharacterSpecialization, type CommanderDoctrine, type DiplomatTask, type MerchantTask
} from "../domain/characters.js";
import { characterService, type CharacterView } from "../services/character-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { requireGameMaster, resolveCountry } from "./auth.js";

const assignmentLabels: Record<string,string> = {
  NONE: "Görev bekliyor", CURIA: "Curia", AGORA: "Agora / Forum", ARMY: "Ordu komutanı",
  ESPIONAGE: "Casusluk görevine gidiyor", ESPIONAGE_RETURNING: "Casusluk görevinden dönüyor",
  CAPTURED: "Esir", COUNTERINTELLIGENCE_TRAVELING_COUNTRY: "Ülke karşı casusluğuna gidiyor",
  COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT: "Yerleşke karşı casusluğuna gidiyor",
  COUNTERINTELLIGENCE_COUNTRY: "Ülke karşı casusluğu",
  COUNTERINTELLIGENCE_SETTLEMENT: "Yerleşke karşı casusluğu", PERSONAL_GUARD: "Kişisel koruma",
  ASSIMILATION: "Asimilasyon", MERCHANT_LOCAL_TRAVELING: "Yerel ticarete gidiyor",
  MERCHANT_LOCAL: "Yerel ticaret", MERCHANT_FOREIGN_PENDING: "Ticari imtiyaz onayı bekliyor",
  MERCHANT_FOREIGN_TRAVELING: "Yabancı ticari imtiyaza gidiyor",
  MERCHANT_FOREIGN: "Yabancı ticari imtiyaz", MERCHANT_PURCHASE: "Satın alma temsilciliği",
  MERCHANT_BLACK_MARKET_TRAVELING: "Karaborsa görevine gidiyor",
  MERCHANT_BLACK_MARKET: "Karaborsa tasfiyesi", DIPLOMAT_TRAVELING: "Diplomatik göreve gidiyor",
  DIPLOMAT_RECONCILIATION: "Halkla Uzlaşma", DIPLOMAT_CULTURE: "Kültür değiştirme",
  DIPLOMAT_VASSALIZE: "Vassallaştırma", DIPLOMAT_INTEGRATE: "Vassal entegrasyonu",
  DIPLOMAT_DEFENSE: "Diplomatik savunma"
};

function characterLocation(character: CharacterView): string | null {
  if (character.target_country_name || character.target_settlement_name) {
    return [character.target_country_name,character.target_settlement_name].filter(Boolean).join(" • ");
  }
  if (character.assigned_country_name || character.assigned_settlement_name) {
    return [character.assigned_country_name,character.assigned_settlement_name].filter(Boolean).join(" • ");
  }
  return character.assigned_army_name ?? null;
}

function characterLine(character: CharacterView): string {
  const role = CHARACTER_ROLES[character.role];
  const task = character.operation_type
    ? MERCHANT_TASK_LABELS[character.operation_type as MerchantTask]
      ?? DIPLOMAT_TASK_LABELS[character.operation_type as DiplomatTask]
      ?? character.operation_type
    : assignmentLabels[character.assignment] ?? character.assignment;
  const details: string[] = [character.character_status === "DEAD" ? "Öldü" : task];
  const place = characterLocation(character);
  if (place) details.push(place);
  if (character.assignment_ready_turn !== null) details.push("Tur " + character.assignment_ready_turn);
  if (character.operation_progress !== null && character.operation_goal !== null) {
    details.push("İlerleme " + character.operation_progress + "/" + character.operation_goal);
  }
  if (character.role === "COMMANDER") {
    details.push("Zafer " + character.commander_victories + "/9");
    if (character.doctrine) details.push(COMMANDER_DOCTRINES[character.doctrine].label);
  }
  if (character.specialization) {
    details.push(CHARACTER_SPECIALIZATIONS[character.specialization].label + " Sv" + character.specialization_level);
  } else if (character.role !== "COMMANDER" && character.specialization_progress > 0) {
    details.push("Uzmanlık " + character.specialization_progress + "/3");
  }
  if (character.unavailable_until_turn !== null) details.push("Tur " + character.unavailable_until_turn + " sonuna dek kullanılamaz");
  return role.emoji + " **" + character.name + "** — " + role.label + " (+" + character.skill_bonus + ")\n↳ " + details.join(" • ");
}

export function charactersEmbed(countryName: string, characters: CharacterView[]): EmbedBuilder {
  const sections = (Object.keys(CHARACTER_ROLES) as Array<keyof typeof CHARACTER_ROLES>)
    .map((role) => {
      const rows = characters.filter((character) => character.role === role).map(characterLine);
      return rows.length ? "**" + CHARACTER_ROLES[role].emoji + " " + CHARACTER_ROLES[role].label + "ler**\n" + rows.join("\n\n") : null;
    }).filter((item): item is string => Boolean(item));
  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle("🎓 " + countryName + " • Karakterlerim")
    .setDescription((sections.length ? sections.join("\n\n") : "Akademide yetişmiş karakteriniz bulunmuyor.").slice(0,4000))
    .setFooter({ text: "Bu liste yalnızca ülke oyuncularına ve yöneticilere görünür." });
}

export async function publishCharacterTurnLogs(client: Client, guildId: string, logs: string[]): Promise<void> {
  if (!logs.length) return;
  const channelId = await characterService.logChannel(guildId);
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) return;
  for (let index=0; index<logs.length; index+=12) {
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🎓 Akademi Görev Sonuçları").setDescription(logs.slice(index,index+12).join("\n\n").slice(0,4000))]
    });
  }
}

export async function handleCharacterCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (interaction.commandName === "karakterlerim") {
    await interaction.deferReply({ ephemeral: true });
    const country = await resolveCountry(interaction);
    await interaction.editReply({ embeds: [charactersEmbed(country.name,await characterService.list(country.id))] });
    return true;
  }
  if (interaction.commandName === "karakter-yonetim") {
    requireGameMaster(interaction);
    await interaction.deferReply({ ephemeral: true });
    const operation = interaction.options.getString("islem",true);
    const channel = interaction.options.getChannel("kanal");
    if (operation === "set" && !channel) throw new GameError("Bir log kanalı seçmelisiniz.");
    await characterService.setLogChannel(interaction.guildId,operation === "set" ? channel!.id : null);
    await interaction.editReply(operation === "set" ? "✅ Akademi görev sonuçları " + String(channel) + " kanalına gönderilecek." : "✅ Akademi görev log kanalı kapatıldı.");
    return true;
  }
  if (!["komutan","tuccar","diplomat"].includes(interaction.commandName)) return false;
  await interaction.deferReply({ ephemeral: true });
  const country = await resolveCountry(interaction);
  const sub = interaction.options.getSubcommand();
  if (interaction.commandName === "komutan") {
    const characterId = interaction.options.getString("komutan",true);
    if (sub === "doktrin-sec") {
      const doctrine = interaction.options.getString("doktrin",true) as CommanderDoctrine;
      await characterService.setCommanderDoctrine({countryId:country.id,characterId,doctrine});
      await interaction.editReply("✅ Komutanın kalıcı doktrini **" + COMMANDER_DOCTRINES[doctrine].label + "** olarak belirlendi.");
    } else if (sub === "uzmanlik-sec") {
      const specialization = interaction.options.getString("uzmanlik",true) as CharacterSpecialization;
      await characterService.setCommanderSpecialization({countryId:country.id,characterId,specialization});
      await interaction.editReply("✅ Komutanın kalıcı uzmanlığı **" + CHARACTER_SPECIALIZATIONS[specialization].label + "** olarak belirlendi.");
    } else {
      await characterService.setBattleChief({
        guildId:interaction.guildId,countryId:country.id,characterId,
        battleId:interaction.options.getString("savas",true)
      });
      await interaction.editReply("✅ Seçilen Komutan bu savaşta tarafın **Başkomutanı** oldu.");
    }
    return true;
  }
  if (interaction.commandName === "tuccar") {
    if (sub === "imtiyaz-yanit") {
      const accept = interaction.options.getBoolean("kabul",true);
      await characterService.respondConcession({
        guildId:interaction.guildId,actorId:interaction.user.id,targetCountryId:country.id,
        operationId:interaction.options.getString("teklif",true),accept
      });
      await interaction.editReply(accept ? "✅ Ticari imtiyaz kabul edildi; Tüccar bir tur sonra göreve başlayacak." : "❌ Ticari imtiyaz reddedildi.");
      return true;
    }
    if (sub === "gorev-bitir") {
      await characterService.endMerchant({guildId:interaction.guildId,countryId:country.id,characterId:interaction.options.getString("tuccar",true)});
      await interaction.editReply("✅ Tüccar görevi sona erdirildi.");
      return true;
    }
    const task = interaction.options.getString("gorev",true) as MerchantTask;
    const targetSettlementId = interaction.options.getString("hedef-sehir");
    if (!targetSettlementId) throw new GameError("Bu Tüccar görevi için hedef yerleşke seçilmelidir.");
    const targetName = interaction.options.getString("hedef-ulke");
    const targetCountry = targetName ? await gameService.countryByName(interaction.guildId,targetName) : null;
    if (targetName && !targetCountry) throw new GameError("Hedef devlet bulunamadı.");
    const result = await characterService.startMerchant({
      guildId:interaction.guildId,actorId:interaction.user.id,countryId:country.id,
      characterId:interaction.options.getString("tuccar",true),task,targetCountryId:targetCountry?.id,
      targetSettlementId,
      homeSettlementId:interaction.options.getString("gelir-sehri")??undefined,
      purchaseCategory:(interaction.options.getString("alim-kategorisi") as "UNITS"|"SHIPS"|"BUILDING"|"SIEGE"|null)??undefined
    });
    const response = result.status === "PENDING_ACCEPTANCE"
      ? "📨 Ticari imtiyaz teklifi hedef devlete kaydedildi; kabul edilmeden Tüccar yola çıkmaz."
      : result.arrivalTurn ? "✅ Tüccar görevlendirildi; Tur " + result.arrivalTurn + " başında göreve ulaşacak."
      : "✅ Satın alma temsilciliği bir sonraki uygun sipariş için hazırlandı.";
    await interaction.editReply(response);
    return true;
  }
  if (sub === "gorev-bitir") {
    await characterService.endDiplomat({guildId:interaction.guildId,countryId:country.id,characterId:interaction.options.getString("diplomat",true)});
    await interaction.editReply("✅ Diplomat görevi sona erdirildi.");
    return true;
  }
  if (sub === "savunma-ata") {
    await characterService.assignDiplomatDefense({countryId:country.id,characterId:interaction.options.getString("diplomat",true),settlementId:interaction.options.getString("sehir")??undefined});
    await interaction.editReply("🛡️ Diplomat diplomatik savunmaya atandı.");
    return true;
  }
  const task = interaction.options.getString("gorev",true) as DiplomatTask;
  const targetName = interaction.options.getString("hedef-ulke");
  const targetCountry = targetName ? await gameService.countryByName(interaction.guildId,targetName) : null;
  if (targetName && !targetCountry) throw new GameError("Hedef devlet bulunamadı.");
  const result = await characterService.startDiplomat({
    guildId:interaction.guildId,actorId:interaction.user.id,countryId:country.id,
    characterId:interaction.options.getString("diplomat",true),task,targetCountryId:targetCountry?.id,
    targetSettlementId:interaction.options.getString("hedef-sehir")??undefined,
    targetEventType:interaction.options.getString("olay")??undefined,
    targetCultureGroup:interaction.options.getString("kultur")??undefined
  });
  await interaction.editReply("✅ Diplomat görevlendirildi; Tur " + result.arrivalTurn + " başında göreve ulaşacak. Hedef ilerleme: " + result.goal + ".");
  return true;
}

export async function handleCharacterAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  if (!interaction.guildId || !["komutan","tuccar","diplomat"].includes(interaction.commandName)) return false;
  const country = await gameService.countryForUser(interaction.guildId,interaction.user.id);
  if (!country) { await interaction.respond([]); return true; }
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value).toLocaleLowerCase("tr-TR");
  if (["komutan","tuccar","diplomat"].includes(focused.name)) {
    const role = focused.name === "komutan" ? "COMMANDER" : focused.name === "tuccar" ? "MERCHANT" : "DIPLOMAT";
    const sub = interaction.options.getSubcommand(false);
    let characters = (await characterService.list(country.id)).filter((item) => item.role === role);
    if (sub === "gorev-baslat" || sub === "savunma-ata") characters = characters.filter((item) => item.assignment === "NONE");
    await interaction.respond(characters.filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25)
      .map((item) => ({name:(item.name + " (+" + item.skill_bonus + ") • " + (assignmentLabels[item.assignment]??item.assignment)).slice(0,100),value:item.id})));
    return true;
  }
  if (focused.name === "teklif") {
    const offers = await characterService.pendingConcessions(country.id);
    await interaction.respond(offers.filter((item) => !query || (item.country_name+" "+item.merchant_name).toLocaleLowerCase("tr-TR").includes(query)).slice(0,25)
      .map((item) => ({name:(item.country_name+" • "+item.merchant_name+" → "+item.settlement_name).slice(0,100),value:item.id})));
    return true;
  }
  if (focused.name === "savas") {
    const battles = await characterService.activeBattlesForCountry(interaction.guildId,country.id);
    await interaction.respond(battles.filter((item) => !query || item.label.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((item) => ({name:item.label.slice(0,100),value:item.id})));
    return true;
  }
  if (focused.name === "hedef-ulke") {
    const countries = (await gameService.listCountries(interaction.guildId)).filter((item) => item.id !== country.id);
    await interaction.respond(countries.filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item) => ({name:item.name,value:item.name})));
    return true;
  }
  if (focused.name === "kultur") {
    const cultures = Object.entries((await import("../domain/cultures.js")).CULTURE_GROUPS)
      .filter(([value]) => value !== "UNASSIGNED");
    await interaction.respond(cultures.filter(([,item]) => !query || item.label.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map(([value,item]) => ({name:item.label,value})));
    return true;
  }
  if (["hedef-sehir","gelir-sehri","sehir"].includes(focused.name)) {
    const targetName = focused.name === "hedef-sehir" ? interaction.options.getString("hedef-ulke") : null;
    const target = targetName ? await gameService.countryByName(interaction.guildId,targetName) : country;
    const settlements = target ? await gameService.listSettlements(target.id) : [];
    await interaction.respond(settlements.filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item) => ({name:item.name,value:item.id})));
    return true;
  }
  await interaction.respond([]);
  return true;
}
