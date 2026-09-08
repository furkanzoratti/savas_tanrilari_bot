import { EmbedBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type Client } from "discord.js";
import { CHARACTER_ROLES } from "../domain/catalog.js";
import {
  CHARACTER_SPECIALIZATIONS, COMMANDER_DOCTRINES, DIPLOMAT_TASK_LABELS, MERCHANT_TASK_LABELS,
  type CharacterSpecialization, type CommanderDoctrine, type DiplomatTask, type MerchantTask
} from "../domain/characters.js";
import { ESPIONAGE_TARGETS, type EspionageTarget } from "../domain/espionage.js";
import { characterService, type CharacterView } from "../services/character-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { logger } from "../logger.js";
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
  const operationLabel = character.role === "MERCHANT"
    ? MERCHANT_TASK_LABELS[character.operation_type as MerchantTask]
    : character.role === "DIPLOMAT"
      ? DIPLOMAT_TASK_LABELS[character.operation_type as DiplomatTask]
      : character.role === "SPY"
        ? ESPIONAGE_TARGETS[character.operation_type as EspionageTarget]?.label
        : undefined;
  const task = character.operation_type
    ? operationLabel ?? assignmentLabels[character.assignment] ?? "Tanımsız görev"
    : assignmentLabels[character.assignment] ?? "Tanımsız görev";
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

export type CharacterLogPublishState = "NO_LOGS" | "NO_CHANNEL" | "CHANNEL_UNAVAILABLE" | "PUBLISHED" | "FAILED";

export interface CharacterLogPublishResult {
  state: CharacterLogPublishState;
  channelId: string | null;
  publishedBatches: number;
  publishedEntries: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function publishCharacterTurnLogs(client: Client, guildId: string, logs: string[]): Promise<CharacterLogPublishResult> {
  const batches = await characterService.pendingLogBatches(guildId);
  const publishable = batches.length
    ? batches
    : logs.length
      ? [{id:"",game_turn:0,entries:logs,publish_attempts:0,source:"TURN_RESULT",title:"Akademi Görev Sonuçları"}]
      : [];
  if (!publishable.length) return {state:"NO_LOGS",channelId:null,publishedBatches:0,publishedEntries:0};
  const channelId = await characterService.logChannel(guildId);
  if (!channelId) {
    logger.warn({guildId,pendingBatches:publishable.length},"Akademi karakter log kanalı ayarlı değil; sonuçlar kuyrukta tutuluyor");
    return {state:"NO_CHANNEL",channelId:null,publishedBatches:0,publishedEntries:0};
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) {
    logger.warn({guildId,channelId},"Akademi karakter log kanalı bulunamadı veya metin kanalı değil");
    return {state:"CHANNEL_UNAVAILABLE",channelId,publishedBatches:0,publishedEntries:0};
  }
  let publishedBatches = 0;
  let publishedEntries = 0;
  for (const batch of publishable) {
    try {
      for (let index=0; index<batch.entries.length; index+=12) {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🎓 "+batch.title+(batch.game_turn ? " • Tur "+batch.game_turn : ""))
            .setDescription(batch.entries.slice(index,index+12).join("\n\n").slice(0,4000))]
        });
      }
      if (batch.id) await characterService.markLogBatchPublished(batch.id);
      publishedBatches += 1;
      publishedEntries += batch.entries.length;
    } catch (error) {
      if (batch.id) await characterService.markLogBatchFailed(batch.id,errorMessage(error)).catch(() => undefined);
      logger.error({error,guildId,channelId,batchId:batch.id||undefined},"Akademi karakter logu gönderilemedi; sonuç kuyrukta tutuluyor");
      return {state:"FAILED",channelId,publishedBatches,publishedEntries};
    }
  }
  return {state:"PUBLISHED",channelId,publishedBatches,publishedEntries};
}

export async function queueCharacterLog(input: {
  client: Client; guildId: string; interactionId: string; actorUserId: string;
  title: string; entry: string; source?: string;
}): Promise<void> {
  await characterService.enqueueLog({
    guildId:input.guildId,
    source:input.source??"COMMAND",
    title:input.title,
    entries:[input.entry],
    actorUserId:input.actorUserId,
    dedupeKey:(input.source??"COMMAND")+":"+input.interactionId
  });
  await publishCharacterTurnLogs(input.client,input.guildId,[]);
}

async function logCharacterCommand(
  interaction: ChatInputCommandInteraction,
  countryName: string,
  entry: string
): Promise<void> {
  try {
    await queueCharacterLog({
      client:interaction.client,guildId:interaction.guildId!,interactionId:interaction.id,
      actorUserId:interaction.user.id,title:"Karakter Komutu",
      entry:"👤 <@"+interaction.user.id+"> • **"+countryName+"**\n↳ "+entry
    });
  } catch (error) {
    logger.error({error,interactionId:interaction.id},"Karakter komutu Akademi log kuyruğuna yazılamadı");
  }
}

export async function handleCharacterCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (interaction.commandName === "karakterlerim") {
    await interaction.deferReply({ ephemeral: true });
    const country = await resolveCountry(interaction);
    await interaction.editReply({ embeds: [charactersEmbed(country.name,await characterService.list(country.id))] });
    await logCharacterCommand(interaction,country.name,"Karakter listesini görüntüledi.");
    return true;
  }
  if (interaction.commandName === "karakter-yonetim") {
    requireGameMaster(interaction);
    await interaction.deferReply({ ephemeral: true });
    const operation = interaction.options.getString("islem",true);
    const channel = interaction.options.getChannel("kanal");
    if (operation === "set" && !channel) throw new GameError("Bir log kanalı seçmelisiniz.");
    if (operation === "set") {
      await characterService.setLogChannel(interaction.guildId,channel!.id);
      const publication = await publishCharacterTurnLogs(interaction.client,interaction.guildId,[]);
      await interaction.editReply(
        "✅ Akademi komutları, bütün karakter görevleri ve casusluk sonuçları " + String(channel) + " kanalına gönderilecek."+
        (publication.state === "PUBLISHED" ? " Kuyrukta bekleyen "+publication.publishedEntries+" sonuç da gönderildi." : "")
      );
      return true;
    }
    if (operation === "clear") {
      await characterService.setLogChannel(interaction.guildId,null);
      await interaction.editReply("✅ Karakter etkinlik log kanalı kapatıldı. Yeni kayıtlar kanal ayarlanana kadar kaybolmadan kuyrukta bekler.");
      return true;
    }
    const status = await characterService.logStatus(interaction.guildId);
    const configuredChannel = status.channelId
      ? await interaction.client.channels.fetch(status.channelId).catch(() => null)
      : null;
    const available = Boolean(configuredChannel?.isTextBased() && !configuredChannel.isDMBased());
    if (operation === "test") {
      if (!configuredChannel?.isTextBased() || configuredChannel.isDMBased()) {
        throw new GameError("Akademi log kanalı ayarlı değil veya bot kanala erişemiyor.");
      }
      await configuredChannel.send({embeds:[new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🎓 Akademi Log Testi")
        .setDescription("Karakter görev sonuç kanalı çalışıyor. Kuyrukta bekleyen sonuçlar şimdi kontrol ediliyor.")
      ]});
      const publication = await publishCharacterTurnLogs(interaction.client,interaction.guildId,[]);
      await interaction.editReply("✅ Test mesajı gönderildi."+(publication.state === "PUBLISHED" ? " Bekleyen "+publication.publishedEntries+" sonuç da yayımlandı." : ""));
      return true;
    }
    await interaction.editReply(
      "🎓 **Akademi Log Durumu**\n"+
      "Kanal: "+(status.channelId ? "<#"+status.channelId+">" : "Ayarlanmamış")+"\n"+
      "Erişim: "+(available ? "✅ Kullanılabilir" : "❌ Kullanılamıyor")+"\n"+
      "Bekleyen: **"+status.pendingBatches+" kayıt grubu / "+status.pendingEntries+" etkinlik**"
    );
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
      await logCharacterCommand(interaction,country.name,"Komutan doktrini **"+COMMANDER_DOCTRINES[doctrine].label+"** olarak seçildi.");
    } else if (sub === "uzmanlik-sec") {
      const specialization = interaction.options.getString("uzmanlik",true) as CharacterSpecialization;
      await characterService.setCommanderSpecialization({countryId:country.id,characterId,specialization});
      await interaction.editReply("✅ Komutanın kalıcı uzmanlığı **" + CHARACTER_SPECIALIZATIONS[specialization].label + "** olarak belirlendi.");
      await logCharacterCommand(interaction,country.name,"Komutan uzmanlığı **"+CHARACTER_SPECIALIZATIONS[specialization].label+"** olarak seçildi.");
    } else {
      await characterService.setBattleChief({
        guildId:interaction.guildId,countryId:country.id,characterId,
        battleId:interaction.options.getString("savas",true)
      });
      await interaction.editReply("✅ Seçilen Komutan bu savaşta tarafın **Başkomutanı** oldu.");
      await logCharacterCommand(interaction,country.name,"Etkin savaş için Başkomutan atandı.");
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
      await logCharacterCommand(interaction,country.name,"Ticari imtiyaz teklifi **"+(accept?"kabul edildi":"reddedildi")+"**.");
      return true;
    }
    if (sub === "gorev-bitir") {
      await characterService.endMerchant({guildId:interaction.guildId,countryId:country.id,characterId:interaction.options.getString("tuccar",true)});
      await interaction.editReply("✅ Tüccar görevi sona erdirildi.");
      await logCharacterCommand(interaction,country.name,"Tüccar görevi sonlandırıldı.");
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
    await logCharacterCommand(interaction,country.name,"Tüccar görevi başlatıldı: **"+(MERCHANT_TASK_LABELS[task]??task)+"**.");
    return true;
  }
  if (sub === "gorev-bitir") {
    await characterService.endDiplomat({guildId:interaction.guildId,countryId:country.id,characterId:interaction.options.getString("diplomat",true)});
    await interaction.editReply("✅ Diplomat görevi sona erdirildi.");
    await logCharacterCommand(interaction,country.name,"Diplomat görevi sonlandırıldı.");
    return true;
  }
  if (sub === "savunma-ata") {
    await characterService.assignDiplomatDefense({countryId:country.id,characterId:interaction.options.getString("diplomat",true),settlementId:interaction.options.getString("sehir")??undefined});
    await interaction.editReply("🛡️ Diplomat diplomatik savunmaya atandı.");
    await logCharacterCommand(interaction,country.name,"Diplomat diplomatik savunmaya atandı.");
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
  await logCharacterCommand(interaction,country.name,"Diplomat görevi başlatıldı: **"+(DIPLOMAT_TASK_LABELS[task]??task)+"** • Varış Tur "+result.arrivalTurn+".");
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
