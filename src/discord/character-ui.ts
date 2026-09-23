import { EmbedBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type Client } from "discord.js";
import { CHARACTER_ROLES } from "../domain/catalog.js";
import {
  ADMIRAL_DOCTRINES, ADMIRAL_SPECIALIZATIONS, CHARACTER_SPECIALIZATIONS, COMMANDER_DOCTRINES, DIPLOMAT_TASK_LABELS, MERCHANT_TASK_LABELS,
  type AdmiralDoctrine, type AdmiralSpecialization, type CharacterSpecialization, type CommanderDoctrine, type DiplomatTask, type MerchantTask
} from "../domain/characters.js";
import { ESPIONAGE_TARGETS, type EspionageTarget } from "../domain/espionage.js";
import { CULTURE_GROUPS, type CultureGroup } from "../domain/cultures.js";
import { characterService, type CharacterView } from "../services/character-service.js";
import { cityService } from "../services/city-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { logger } from "../logger.js";
import { requireGameMaster, resolveCountry } from "./auth.js";

const assignmentLabels: Record<string,string> = {
  NONE: "Görev bekliyor", CURIA: "Curia", AGORA: "Agora / Forum", ARMY: "Ordu komutanı", FLEET: "Filo komutanı",
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

const eventLabels:Record<string,string> = {
  BLACK_MARKET:"Karaborsa", EPIDEMIC:"Salgın", UNREST:"Huzursuzluk", REBELLION:"İsyan"
};

const purchaseCategoryLabels:Record<string,string> = {
  UNITS:"Asker", SHIPS:"Gemi", BUILDING:"Bina", SIEGE:"Kuşatma Aleti"
};

const DIPLOMAT_TASK_BY_SUBCOMMAND: Partial<Record<string,DiplomatTask>> = {
  "halkla-uzlas":"RECONCILIATION",
  "kultur-degistir":"CULTURE_CHANGE",
  "vassallastir":"VASSALIZE",
  "vassal-entegre-et":"VASSAL_INTEGRATION"
};

const MERCHANT_TASK_BY_SUBCOMMAND: Partial<Record<string,MerchantTask>> = {
  "yerel-ticaret":"LOCAL_TRADE",
  "ticari-imtiyaz":"FOREIGN_CONCESSION",
  "satin-alma-temsilciligi":"PURCHASE_AGENT",
  "karaborsa-tasfiyesi":"BLACK_MARKET"
};

export function characterAvailableForCommand(
  character: Pick<CharacterView,"role"|"assignment"|"operation_status"|"character_status"|"doctrine"|"commander_victories"|"specialization"|"specialization_progress"|"is_admiral"|"admiral_doctrine"|"admiral_specialization"|"admiral_victories">,
  commandName: string,
  subcommand: string
): boolean {
  if (character.character_status !== "ACTIVE") return false;
  if (commandName === "komutan") {
    if (character.role !== "COMMANDER" || character.is_admiral) return false;
    if (subcommand === "doktrin-sec") return character.doctrine === null;
    if (subcommand === "uzmanlik-sec") return character.specialization === null && character.commander_victories >= 3;
    if (subcommand === "amirale-donustur") return !character.is_admiral && character.assignment === "NONE";
    return subcommand !== "baskomutan-sec" || character.assignment === "ARMY";
  }
  if (commandName === "amiral") {
    if (character.role !== "COMMANDER" || !character.is_admiral) return false;
    if (subcommand === "doktrin-sec") return !character.admiral_doctrine;
    if (subcommand === "uzmanlik-sec") return !character.admiral_specialization && Number(character.admiral_victories??0)>=3;
    return true;
  }
  if (commandName === "tuccar") {
    if (character.role !== "MERCHANT") return false;
    if (subcommand === "uzmanlik-sec") return character.specialization === null && character.specialization_progress >= 3;
    if (MERCHANT_TASK_BY_SUBCOMMAND[subcommand]) return character.assignment === "NONE" && !character.operation_status;
    if (subcommand === "gorev-bitir") return character.assignment.startsWith("MERCHANT_") || Boolean(character.operation_status);
    return true;
  }
  if (commandName === "diplomat") {
    if (character.role !== "DIPLOMAT") return false;
    if (subcommand === "uzmanlik-sec") return character.specialization === null && character.specialization_progress >= 3;
    if (DIPLOMAT_TASK_BY_SUBCOMMAND[subcommand] || subcommand === "asimilasyon") return character.assignment === "NONE" && !character.operation_status;
    if (subcommand === "savunma-ata") return ["NONE","DIPLOMAT_DEFENSE"].includes(character.assignment) && !character.operation_status;
    if (subcommand === "gorev-bitir") return character.assignment.startsWith("DIPLOMAT_") || Boolean(character.operation_status);
  }
  return true;
}

async function characterForLog(countryId:string,characterId:string):Promise<CharacterView|null> {
  return (await characterService.list(countryId)).find((character)=>character.id===characterId)??null;
}

async function settlementNameForLog(countryId:string,settlementId:string|null):Promise<string|null> {
  if (!settlementId) return null;
  return (await gameService.listSettlements(countryId)).find((settlement)=>settlement.id===settlementId)?.name??null;
}

function characterLocation(character: CharacterView): string | null {
  if (character.target_country_name || character.target_settlement_name) {
    return [character.target_country_name,character.target_settlement_name].filter(Boolean).join(" • ");
  }
  if (character.assigned_country_name || character.assigned_settlement_name) {
    return [character.assigned_country_name,character.assigned_settlement_name].filter(Boolean).join(" • ");
  }
  return character.assigned_army_name ?? character.assigned_fleet_name ?? null;
}

function characterLine(character: CharacterView): string {
  const role = CHARACTER_ROLES[character.role];
  const roleLabel = character.role === "COMMANDER" && character.is_admiral ? "Amiral" : role.label;
  const roleEmoji = character.role === "COMMANDER" && character.is_admiral ? "⚓" : role.emoji;
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
  const details: string[] = [character.character_status === "DEAD" ? "Öldü" : character.character_status === "DISMISSED" ? "Kalıcı görevden alındı" : task];
  const place = characterLocation(character);
  if (place) details.push(place);
  if (character.assignment_ready_turn !== null) details.push("Tur " + character.assignment_ready_turn);
  if (character.operation_progress !== null && character.operation_goal !== null) {
    details.push("İlerleme " + character.operation_progress + "/" + character.operation_goal);
  }
  if (character.role === "COMMANDER" && character.is_admiral) {
    details.push("Deniz zaferi " + Number(character.admiral_victories??0) + "/9");
    if (character.admiral_doctrine) details.push(ADMIRAL_DOCTRINES[character.admiral_doctrine].label);
    if (character.admiral_specialization) details.push(
      ADMIRAL_SPECIALIZATIONS[character.admiral_specialization].label + " Sv" + Number(character.admiral_specialization_level??0)
    );
  } else if (character.role === "COMMANDER") {
    details.push("Zafer " + character.commander_victories + "/9");
    if (character.doctrine) details.push(COMMANDER_DOCTRINES[character.doctrine].label);
    if (character.specialization) details.push(CHARACTER_SPECIALIZATIONS[character.specialization].label + " Sv" + character.specialization_level);
  } else if (character.specialization) {
    details.push(CHARACTER_SPECIALIZATIONS[character.specialization].label + " Sv" + character.specialization_level);
  } else if (character.specialization_progress > 0) {
    const tracks = Object.entries(character.specialization_tracks??{})
      .filter(([key,value]) => CHARACTER_SPECIALIZATIONS[key as CharacterSpecialization]?.role===character.role && Number(value)>0)
      .map(([key,value]) => CHARACTER_SPECIALIZATIONS[key as CharacterSpecialization].label+" "+value+"/3");
    details.push(tracks.length ? tracks.join(" • ")+(Number(character.specialization_choice_credit??0)>0?" • Eski kredi +"+character.specialization_choice_credit:"") : "Eski uzmanlık kredisi " + character.specialization_progress + "/3");
  }
  if (character.unavailable_until_turn !== null) details.push("Tur " + character.unavailable_until_turn + " sonuna dek kullanılamaz");
  return roleEmoji + " **" + character.name + "** — " + roleLabel + " (+" + character.skill_bonus + ")\n↳ " + details.join(" • ");
}

function deadCharacterLine(character: CharacterView): string {
  const role = CHARACTER_ROLES[character.role];
  const roleLabel = character.role === "COMMANDER" && character.is_admiral ? "Amiral" : role.label;
  const deathPlace = character.death_settlement_name ?? "Bilinmiyor";
  return "💀 **" + character.name + "** — " + roleLabel + " (+" + character.skill_bonus + ")\n↳ Öldüğü şehir: **" + deathPlace + "**";
}

export interface CharacterCapacitySummary {
  academies: number;
  characters: number;
  pending: number;
  capacity: number;
}

export function charactersEmbed(
  countryName: string,
  characters: CharacterView[],
  capacity?: CharacterCapacitySummary
): EmbedBuilder {
  const livingCharacters = characters.filter((character) => character.character_status !== "DEAD");
  const sections = (Object.keys(CHARACTER_ROLES) as Array<keyof typeof CHARACTER_ROLES>)
    .map((role) => {
      const rows = livingCharacters.filter((character) => character.role === role).map(characterLine);
      return rows.length ? "**" + CHARACTER_ROLES[role].emoji + " " + CHARACTER_ROLES[role].label + "ler**\n" + rows.join("\n\n") : null;
    }).filter((item): item is string => Boolean(item));
  const deadCharacters = characters
    .filter((character) => character.character_status === "DEAD")
    .sort((left,right) => {
      const dateDifference = new Date(right.died_at ?? 0).getTime() - new Date(left.died_at ?? 0).getTime();
      return dateDifference || left.name.localeCompare(right.name,"tr");
    });
  const description: string[] = [];
  if (capacity) {
    description.push(
      "**🏛️ Akademi Kapasitesi**\n"+
      "Akademi: **"+capacity.academies+"** • Barındırılabilir karakter: **"+capacity.capacity+"**\n"+
      "Mevcut karakter: **"+capacity.characters+"/"+capacity.capacity+"**"+
      (capacity.pending>0 ? " • Eğitimde/bekleyen: **"+capacity.pending+"**" : "")
    );
  }
  if (sections.length) description.push(...sections);
  else description.push("Akademide etkin veya görevden alınmış karakteriniz bulunmuyor.");
  if (deadCharacters.length) {
    description.push("**💀 Ölü Karakterler**\n"+deadCharacters.map(deadCharacterLine).join("\n\n"));
  }
  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle("🎓 " + countryName + " • Karakterlerim")
    .setDescription(description.join("\n\n").slice(0,4000))
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
    const [characters,capacity] = await Promise.all([
      characterService.list(country.id),cityService.academyCapacity(country.id)
    ]);
    await interaction.editReply({ embeds: [charactersEmbed(country.name,characters,capacity)] });
    await logCharacterCommand(interaction,country.name,"Karakter listesini görüntüledi.");
    return true;
  }
  if (interaction.commandName === "karakter-yonetim") {
    requireGameMaster(interaction);
    await interaction.deferReply({ ephemeral: true });
    const sub=interaction.options.getSubcommand();
    if(sub==="casus-ekle"){
      const country=await gameService.countryByName(interaction.guildId,interaction.options.getString("ulke",true));
      if(!country)throw new GameError("Ülke bulunamadı.");
      const character=await characterService.createManualSpy({
        guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
        name:interaction.options.getString("ad",true),skillBonus:interaction.options.getInteger("bonus",true)
      });
      await interaction.editReply(`✅ **${country.name}** devletine **${character.name} (+${character.skillBonus})** casusu eklendi.`);
      await logCharacterCommand(interaction,country.name,`Yönetici tarafından **${character.name} (+${character.skillBonus})** casusu eklendi.`);
      return true;
    }
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
  if (!["komutan","amiral","tuccar","diplomat"].includes(interaction.commandName)) return false;
  await interaction.deferReply({ ephemeral: true });
  const country = await resolveCountry(interaction);
  const sub = interaction.options.getSubcommand();
  if (interaction.commandName === "amiral") {
    const characterId = interaction.options.getString("amiral",true);
    const admiral = await characterForLog(country.id,characterId);
    const admiralText = "⚓ Amiral: **"+(admiral?.name??"Bilinmeyen Amiral")+"** (+"+(admiral?.skill_bonus??0)+") • Devlet: **"+country.name+"**";
    if (sub === "doktrin-sec") {
      const doctrine = interaction.options.getString("doktrin",true) as AdmiralDoctrine;
      await characterService.setAdmiralDoctrine({countryId:country.id,characterId,doctrine});
      await interaction.editReply("✅ Amiralin kalıcı doktrini **"+ADMIRAL_DOCTRINES[doctrine].label+"** olarak belirlendi.");
      await logCharacterCommand(interaction,country.name,
        admiralText+"\n↳ Kalıcı Amiral doktrini: **"+ADMIRAL_DOCTRINES[doctrine].label+"**\n↳ Etki: "+ADMIRAL_DOCTRINES[doctrine].description
      );
    } else {
      const specialization = interaction.options.getString("uzmanlik",true) as AdmiralSpecialization;
      await characterService.setAdmiralSpecialization({countryId:country.id,characterId,specialization});
      const level = Math.min(3,Math.floor(Number(admiral?.admiral_victories??0)/3));
      await interaction.editReply("✅ Amiralin kalıcı uzmanlığı **"+ADMIRAL_SPECIALIZATIONS[specialization].label+"** olarak belirlendi (Sv"+level+").");
      await logCharacterCommand(interaction,country.name,
        admiralText+"\n↳ Kalıcı Amiral uzmanlığı: **"+ADMIRAL_SPECIALIZATIONS[specialization].label+"** • Deniz zaferi: **"+Number(admiral?.admiral_victories??0)+"/9** • Sv"+level
      );
    }
    return true;
  }
  if (interaction.commandName === "komutan") {
    const characterId = interaction.options.getString("komutan",true);
    const commander = await characterForLog(country.id,characterId);
    const commanderText = "⚔️ Komutan: **"+(commander?.name??"Bilinmeyen Komutan")+"** (+"+(commander?.skill_bonus??0)+") • Devlet: **"+country.name+"**";
    if (sub === "doktrin-sec") {
      const doctrine = interaction.options.getString("doktrin",true) as CommanderDoctrine;
      await characterService.setCommanderDoctrine({countryId:country.id,characterId,doctrine});
      await interaction.editReply("✅ Komutanın kalıcı doktrini **" + COMMANDER_DOCTRINES[doctrine].label + "** olarak belirlendi.");
      await logCharacterCommand(interaction,country.name,
        commanderText+"\n↳ İşlem: Kalıcı doktrin **"+COMMANDER_DOCTRINES[doctrine].label+"** olarak seçildi.\n"+
        "↳ Etki: "+COMMANDER_DOCTRINES[doctrine].description+" • Bu seçim değiştirilemez."
      );
    } else if (sub === "uzmanlik-sec") {
      const specialization = interaction.options.getString("uzmanlik",true) as CharacterSpecialization;
      await characterService.setCommanderSpecialization({countryId:country.id,characterId,specialization});
      await interaction.editReply("✅ Komutanın kalıcı uzmanlığı **" + CHARACTER_SPECIALIZATIONS[specialization].label + "** olarak belirlendi.");
      await logCharacterCommand(interaction,country.name,
        commanderText+"\n↳ İşlem: Kalıcı uzmanlık **"+CHARACTER_SPECIALIZATIONS[specialization].label+"** olarak seçildi.\n"+
        "↳ Kayıt anındaki zafer: **"+(commander?.commander_victories??0)+"** • Uzmanlık seviyesi: **"+Math.min(3,Math.floor((commander?.commander_victories??0)/3))+"**"
      );
    } else if (sub === "amirale-donustur") {
      const result = await characterService.promoteCommanderToAdmiral({
        guildId:interaction.guildId,actorId:interaction.user.id,countryId:country.id,characterId
      });
      await interaction.editReply("⚓ **"+result.name+"** kalıcı olarak **Amirale** dönüştürüldü. Artık kara ordularına değil, yalnızca filolara atanabilir.");
      await logCharacterCommand(interaction,country.name,
        "⚓ **"+result.name+"** kalıcı olarak Amirale dönüştürüldü.\n↳ Artık yalnızca filolara komuta edebilir; bu işlem geri alınamaz."
      );
    } else {
      const battleId = interaction.options.getString("savas",true);
      const battle = (await characterService.activeBattlesForCountry(interaction.guildId,country.id)).find((item)=>item.id===battleId);
      await characterService.setBattleChief({
        guildId:interaction.guildId,countryId:country.id,characterId,
        battleId
      });
      await interaction.editReply("✅ Seçilen Komutan bu savaşta tarafın **Başkomutanı** oldu.");
      await logCharacterCommand(interaction,country.name,
        commanderText+"\n↳ İşlem: Etkin savaşın Başkomutanı olarak atandı.\n↳ Savaş: **"+(battle?.label??battleId)+"**"
      );
    }
    return true;
  }
  if (interaction.commandName === "tuccar") {
    if (sub === "uzmanlik-sec") {
      const characterId = interaction.options.getString("tuccar",true);
      const specialization = interaction.options.getString("uzmanlik",true) as CharacterSpecialization;
      const merchant = await characterForLog(country.id,characterId);
      const progress = await characterService.setCharacterSpecialization({countryId:country.id,characterId,role:"MERCHANT",specialization});
      await interaction.editReply("✅ Tüccarın kalıcı uzmanlığı **"+CHARACTER_SPECIALIZATIONS[specialization].label+"** olarak seçildi (Sv"+Math.min(3,Math.floor(progress/3))+").");
      await logCharacterCommand(interaction,country.name,"🪙 Tüccar: **"+(merchant?.name??"Bilinmeyen Tüccar")+"**\n↳ Kalıcı uzmanlık: **"+CHARACTER_SPECIALIZATIONS[specialization].label+"** • İlerleme: **"+progress+"**");
      return true;
    }
    if (sub === "imtiyaz-yanit") {
      const accept = interaction.options.getBoolean("kabul",true);
      const operationId = interaction.options.getString("teklif",true);
      const offer = (await characterService.pendingConcessions(country.id)).find((item)=>item.id===operationId);
      await characterService.respondConcession({
        guildId:interaction.guildId,actorId:interaction.user.id,targetCountryId:country.id,
        operationId,accept
      });
      await interaction.editReply(accept ? "✅ Ticari imtiyaz kabul edildi; Tüccar bir tur sonra göreve başlayacak." : "❌ Ticari imtiyaz reddedildi.");
      await logCharacterCommand(interaction,country.name,
        "🪙 Tüccar: **"+(offer?.merchant_name??"Bilinmeyen Tüccar")+"** • Gönderen devlet: **"+(offer?.country_name??"Bilinmeyen devlet")+"**\n"+
        "↳ Hedef: **"+country.name+" / "+(offer?.settlement_name??"Bilinmeyen yerleşke")+"**\n"+
        "↳ Ticari imtiyaz teklifi **"+(accept?"kabul edildi":"reddedildi")+"**."+
        (accept?" Tüccar bir tur yolculuğun ardından göreve başlayacak.":" Tüccar gönderen devlette yeniden kullanılabilir hale geldi.")
      );
      return true;
    }
    if (sub === "gorev-bitir") {
      const characterId = interaction.options.getString("tuccar",true);
      const merchant = await characterForLog(country.id,characterId);
      const changed = await characterService.endMerchant({guildId:interaction.guildId,countryId:country.id,characterId});
      await interaction.editReply(changed ? "✅ Tüccar görevi sona erdirildi; Tüccar aynı turda yeniden görevlendirilebilir." : "ℹ️ Tüccar zaten müsait durumda.");
      await logCharacterCommand(interaction,country.name,
        "🪙 Tüccar: **"+(merchant?.name??"Bilinmeyen Tüccar")+"** • Devlet: **"+country.name+"**\n"+
        "↳ Sonlandırılan görev: **"+(MERCHANT_TASK_LABELS[merchant?.operation_type as MerchantTask]??assignmentLabels[merchant?.assignment??""]??"Etkin Tüccar görevi")+"**\n"+
        "↳ Önceki görev yeri: **"+([merchant?.target_country_name,merchant?.target_settlement_name].filter(Boolean).join(" / ")||"Kayıtlı hedef yok")+"**"
      );
      return true;
    }
    const task = MERCHANT_TASK_BY_SUBCOMMAND[sub];
    if (!task) throw new GameError("Bilinmeyen Tüccar görevi.");
    const characterId = interaction.options.getString("tuccar",true);
    const merchant = await characterForLog(country.id,characterId);
    const targetSettlementId = interaction.options.getString("hedef-sehir");
    if (!targetSettlementId) throw new GameError("Bu Tüccar görevi için hedef yerleşke seçilmelidir.");
    const targetName = interaction.options.getString("hedef-ulke");
    const targetCountry = targetName ? await gameService.countryByName(interaction.guildId,targetName) : null;
    if (targetName && !targetCountry) throw new GameError("Hedef devlet bulunamadı.");
    const effectiveTargetCountry = task === "FOREIGN_CONCESSION" ? targetCountry : country;
    const targetSettlementName = effectiveTargetCountry
      ? await settlementNameForLog(effectiveTargetCountry.id,targetSettlementId)
      : null;
    const homeSettlementId = interaction.options.getString("gelir-sehri");
    const homeSettlementName = await settlementNameForLog(country.id,homeSettlementId);
    const purchaseCategory = (interaction.options.getString("alim-kategorisi") as "UNITS"|"SHIPS"|"BUILDING"|"SIEGE"|null)??undefined;
    const result = await characterService.startMerchant({
      guildId:interaction.guildId,actorId:interaction.user.id,countryId:country.id,
      characterId,task,targetCountryId:targetCountry?.id,
      targetSettlementId,
      homeSettlementId:homeSettlementId??undefined,
      purchaseCategory
    });
    const response = result.status === "PENDING_ACCEPTANCE"
      ? "📨 Ticari imtiyaz teklifi hedef devlete kaydedildi; kabul edilmeden Tüccar yola çıkmaz."
      : result.arrivalTurn ? "✅ Tüccar görevlendirildi; Tur " + result.arrivalTurn + " başında göreve ulaşacak."
      : "✅ Satın alma temsilciliği bir sonraki uygun sipariş için hazırlandı.";
    await interaction.editReply(response);
    const taskState = result.status === "PENDING_ACCEPTANCE"
      ? "Hedef devletin onayı bekleniyor; Tüccar henüz yola çıkmadı."
      : result.arrivalTurn
        ? "Yolculuk başladı; **Tur "+result.arrivalTurn+"** başında göreve ulaşacak."
        : "Görev hemen etkinleştirildi.";
    await logCharacterCommand(interaction,country.name,
      "🪙 Tüccar: **"+(merchant?.name??"Bilinmeyen Tüccar")+"** (+"+(merchant?.skill_bonus??0)+") • Gönderen devlet: **"+country.name+"**\n"+
      "↳ Görev: **"+(MERCHANT_TASK_LABELS[task]??task)+"**\n"+
      "↳ Hedef: **"+(effectiveTargetCountry?.name??country.name)+" / "+(targetSettlementName??"Bilinmeyen yerleşke")+"**"+
      (homeSettlementName?" • Gelir merkezi: **"+homeSettlementName+"**":"")+"\n"+
      (purchaseCategory?"↳ Alım kategorisi: **"+purchaseCategoryLabels[purchaseCategory]+"**\n":"")+
      "↳ Durum: "+taskState
    );
    return true;
  }
  if (sub === "uzmanlik-sec") {
    const characterId = interaction.options.getString("diplomat",true);
    const specialization = interaction.options.getString("uzmanlik",true) as CharacterSpecialization;
    const diplomat = await characterForLog(country.id,characterId);
    const progress = await characterService.setCharacterSpecialization({countryId:country.id,characterId,role:"DIPLOMAT",specialization});
    await interaction.editReply("✅ Diplomatın kalıcı uzmanlığı **"+CHARACTER_SPECIALIZATIONS[specialization].label+"** olarak seçildi (Sv"+Math.min(3,Math.floor(progress/3))+").");
    await logCharacterCommand(interaction,country.name,"🤝 Diplomat: **"+(diplomat?.name??"Bilinmeyen Diplomat")+"**\n↳ Kalıcı uzmanlık: **"+CHARACTER_SPECIALIZATIONS[specialization].label+"** • İlerleme: **"+progress+"**");
    return true;
  }
  if (sub === "gorev-bitir") {
    const characterId = interaction.options.getString("diplomat",true);
    const diplomat = await characterForLog(country.id,characterId);
    const changed = await characterService.endDiplomat({guildId:interaction.guildId,countryId:country.id,characterId});
    await interaction.editReply(changed ? "✅ Diplomat görevi sona erdirildi; Diplomat aynı turda yeniden görevlendirilebilir." : "ℹ️ Diplomat zaten müsait durumda.");
    await logCharacterCommand(interaction,country.name,
      "🤝 Diplomat: **"+(diplomat?.name??"Bilinmeyen Diplomat")+"** • Devlet: **"+country.name+"**\n"+
      "↳ Sonlandırılan görev: **"+(DIPLOMAT_TASK_LABELS[diplomat?.operation_type as DiplomatTask]??assignmentLabels[diplomat?.assignment??""]??"Etkin Diplomat görevi")+"**\n"+
      "↳ Önceki görev yeri: **"+([diplomat?.target_country_name,diplomat?.target_settlement_name].filter(Boolean).join(" / ")||"Ülke geneli")+"**"
    );
    return true;
  }
  if (sub === "savunma-ata") {
    const characterId = interaction.options.getString("diplomat",true);
    const settlementId = interaction.options.getString("sehir");
    const diplomat = await characterForLog(country.id,characterId);
    const settlementName = await settlementNameForLog(country.id,settlementId);
    await characterService.assignDiplomatDefense({countryId:country.id,characterId,settlementId:settlementId??undefined});
    await interaction.editReply("🛡️ Diplomat diplomatik savunmaya atandı.");
    await logCharacterCommand(interaction,country.name,
      "🤝 Diplomat: **"+(diplomat?.name??"Bilinmeyen Diplomat")+"** (+"+(diplomat?.skill_bonus??0)+") • Devlet: **"+country.name+"**\n"+
      "↳ Görev: **Diplomatik Savunma** • Kapsam: **"+(settlementName?country.name+" / "+settlementName:country.name+" geneli")+"**"
    );
    return true;
  }
  if (sub === "asimilasyon") {
    const characterId = interaction.options.getString("diplomat",true);
    const diplomat = await characterForLog(country.id,characterId);
    if (!diplomat) throw new GameError("Seçilen Diplomat bulunamadı.");
    const settlementId = interaction.options.getString("hedef-sehir",true);
    const result = await cityService.assignDiplomatToAssimilation({
      guildId:interaction.guildId,actorId:interaction.user.id,countryId:country.id,
      characterName:diplomat.name,settlementId
    });
    await interaction.editReply(`🤝 **${result.characterName}**, **${result.settlementName}** asimilasyonuna gönderildi. Yerleşke **Tur ${result.completionTurn}** başında otomatik asimile edilecek.`);
    await logCharacterCommand(interaction,country.name,
      `🤝 Diplomat: **${result.characterName}** (+${diplomat.skill_bonus}) • Devlet: **${country.name}**\n`+
      `↳ Görev: **Asimilasyon** • Hedef: **${result.settlementName}** • Tamamlanma: **Tur ${result.completionTurn}**`
    );
    return true;
  }
  const task = DIPLOMAT_TASK_BY_SUBCOMMAND[sub];
  if (!task) throw new GameError("Bilinmeyen Diplomat görevi.");
  const characterId = interaction.options.getString("diplomat",true);
  const diplomat = await characterForLog(country.id,characterId);
  const targetName = interaction.options.getString("hedef-ulke");
  const targetCountry = targetName ? await gameService.countryByName(interaction.guildId,targetName) : null;
  if (targetName && !targetCountry) throw new GameError("Hedef devlet bulunamadı.");
  const targetSettlementId = interaction.options.getString("hedef-sehir");
  const targetSettlementOwner = targetCountry??country;
  const targetSettlementName = await settlementNameForLog(targetSettlementOwner.id,targetSettlementId);
  const targetEventType = interaction.options.getString("olay");
  const targetCultureGroup = interaction.options.getString("kultur");
  const result = await characterService.startDiplomat({
    guildId:interaction.guildId,actorId:interaction.user.id,countryId:country.id,
    characterId,task,targetCountryId:targetCountry?.id,
    targetSettlementId:targetSettlementId??undefined,
    targetEventType:targetEventType??undefined,
    targetCultureGroup:targetCultureGroup??undefined
  });
  await interaction.editReply("✅ Diplomat görevlendirildi; Tur " + result.arrivalTurn + " başında göreve ulaşacak. Hedef ilerleme: " + result.goal + ".");
  await logCharacterCommand(interaction,country.name,
    "🤝 Diplomat: **"+(diplomat?.name??"Bilinmeyen Diplomat")+"** (+"+(diplomat?.skill_bonus??0)+") • Gönderen devlet: **"+country.name+"**\n"+
    "↳ Görev: **"+(DIPLOMAT_TASK_LABELS[task]??task)+"**\n"+
    "↳ Hedef: **"+(targetCountry?.name??country.name)+(targetSettlementName?" / "+targetSettlementName:"")+"**"+
    (targetEventType?" • Olay: **"+(eventLabels[targetEventType]??targetEventType)+"**":"")+
    (targetCultureGroup?" • Hedef kültür: **"+(CULTURE_GROUPS[targetCultureGroup as CultureGroup]?.label??targetCultureGroup)+"**":"")+"\n"+
    "↳ Yolculuk: Tur "+result.arrivalTurn+" başında tamamlanacak • Hedef ilerleme: **"+result.goal+"**"
  );
  return true;
}

export async function handleCharacterAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  if (!interaction.guildId || !["komutan","amiral","tuccar","diplomat"].includes(interaction.commandName)) return false;
  const country = await gameService.countryForUser(interaction.guildId,interaction.user.id);
  if (!country) { await interaction.respond([]); return true; }
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value).toLocaleLowerCase("tr-TR");
  const sub = interaction.options.getSubcommand(false);
  if (focused.name === "uzmanlik" && ["tuccar","diplomat"].includes(interaction.commandName)) {
    const optionName = interaction.commandName === "tuccar" ? "tuccar" : "diplomat";
    const selectedId = interaction.options.getString(optionName);
    const character = selectedId ? (await characterService.list(country.id)).find((item)=>item.id===selectedId) : null;
    if (!character || character.specialization) { await interaction.respond([]); return true; }
    const trackEntries = Object.entries(character.specialization_tracks??{});
    const legacyCredit=Number(character.specialization_choice_credit??0);
    const unlocked = trackEntries.length
      ? trackEntries.filter(([,progress])=>Number(progress)+legacyCredit>=3).map(([key])=>key as CharacterSpecialization)
      : legacyCredit>=3
        ? (Object.keys(CHARACTER_SPECIALIZATIONS) as CharacterSpecialization[]).filter((key)=>CHARACTER_SPECIALIZATIONS[key].role===character.role)
        : [];
    await interaction.respond(unlocked
      .filter((key)=>!query||CHARACTER_SPECIALIZATIONS[key].label.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((key)=>({name:CHARACTER_SPECIALIZATIONS[key].label,value:key})));
    return true;
  }
  if (["komutan","amiral","tuccar","diplomat"].includes(focused.name)) {
    const role = ["komutan","amiral"].includes(focused.name) ? "COMMANDER" : focused.name === "tuccar" ? "MERCHANT" : "DIPLOMAT";
    const characters = (await characterService.list(country.id))
      .filter((item) => item.role === role && characterAvailableForCommand(item,interaction.commandName,sub ?? ""));
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
    let settlements = target ? await gameService.listSettlements(target.id) : [];
    if (interaction.commandName === "diplomat" && sub === "asimilasyon") {
      settlements = settlements.filter((item) => item.is_conquered);
    } else if (interaction.commandName === "diplomat" && sub === "kultur-degistir") {
      settlements = settlements.filter((item) => !item.is_conquered && !item.unrest_active && !item.rebellion_active);
    } else if (interaction.commandName === "diplomat" && sub === "halkla-uzlas") {
      const event = interaction.options.getString("olay");
      if (event === "BLACK_MARKET") settlements = settlements.filter((item) => item.black_market_active);
      if (event === "EPIDEMIC") settlements = settlements.filter((item) => item.epidemic_active);
      if (event === "UNREST") settlements = settlements.filter((item) => item.unrest_active);
      if (event === "REBELLION") settlements = settlements.filter((item) => item.rebellion_active);
    } else if (interaction.commandName === "tuccar" && sub === "karaborsa-tasfiyesi") {
      settlements = settlements.filter((item) => item.black_market_active);
    }
    await interaction.respond(settlements.filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item) => ({name:item.name,value:item.id})));
    return true;
  }
  await interaction.respond([]);
  return true;
}
