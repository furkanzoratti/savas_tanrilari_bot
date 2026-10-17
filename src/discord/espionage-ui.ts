import { resolve } from "node:path";
import { AttachmentBuilder, EmbedBuilder, MessageFlags, type AutocompleteInteraction, type ChatInputCommandInteraction, type Client } from "discord.js";
import {
  ESPIONAGE_PREPARATIONS, ESPIONAGE_SEVERITY_LABELS, ESPIONAGE_TARGETS,
  isAssassinationTarget, isCharacterPersonalTarget, isKidnappingTarget, isNoblePersonalTarget, isPlayerEspionageTarget,
  type EspionagePreparation, type EspionageTarget
} from "../domain/espionage.js";
import {
  espionagePublicDetectionImage,
  espionagePublicDetectionDisclosure,
  renderEspionagePublication,
  type EspionagePublicationImageKey,
  type EspionagePublicationOutcome
} from "../domain/espionage-publications.js";
import { gold } from "../domain/format.js";
import { espionageService, isSpyDefenseAssignment, type EspionageOperationView } from "../services/espionage-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { characterService } from "../services/character-service.js";
import { isGameMaster, requireGameMaster, resolveCountry } from "./auth.js";
import { queueCharacterLog } from "./character-ui.js";
import { CHARACTER_SPECIALIZATIONS, type CharacterSpecialization } from "../domain/characters.js";
import { logger } from "../logger.js";

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

export function resolveEspionageChoice<T extends { id: string; name: string }>(
  choices: readonly T[],
  rawValue: string,
  label: string
): T {
  const normalized = rawValue.trim().toLocaleLowerCase("tr-TR");
  const choice = choices.find((item) => item.id === rawValue || item.name.trim().toLocaleLowerCase("tr-TR") === normalized);
  if (!choice) throw new GameError(`${label} bulunamadı. Açılır listeden geçerli bir seçim yapın.`);
  return choice;
}

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
  const attackBonus = Number(operation.attack_total??0)-Number(operation.attack_roll??0);
  const defenseBonus = Number(operation.defense_total??0)-Number(operation.defense_roll??0);
  const detectionBonus = Number(operation.detection_total??0)-Number(operation.detection_roll??0);
  const validTargetDetail = operation.target_building_name ?? operation.target_building_type;
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
      `**Geçerli Hedef:** ${operation.valid_target ? `Evet${validTargetDetail ? ` • ${validTargetDetail}` : ""}` : "Hayır"}`,
      `**Başarı Zarı:** 1d20 **${operation.attack_roll}** + toplam bonus **${attackBonus}** = **${operation.attack_total}**`,
      `**Savunma Zarı:** 1d20 **${operation.defense_roll}** + toplam bonus **${defenseBonus}** = **${operation.defense_total}**`,
      `**Fark / Sonuç:** ${operation.margin} • **${ESPIONAGE_SEVERITY_LABELS[operation.severity ?? "NONE"]}**`,
      `**Mekanik Etki:** ${operation.effect_text ?? "Yok"}`,
      "",
      `**Tespit Zarı:** 1d20 **${operation.detection_roll}** + toplam bonus/ceza **${detectionBonus}** = **${operation.detection_total}**`,
      `**Tespit Sonucu:** ${detectionText(operation.detection_level, operation.captured)}`,
      operation.captured && isAssassinationTarget(operation.target_type) ? "**Sonuç:** Yakalanan Suikastçı kalıcı olarak kaybedildi." : operation.captured ? `**Esaret:** Casus Tur ${operation.return_turn + 2} başında yeniden kullanılabilir.` : `**Dönüş:** Tur ${operation.return_turn} başında yeniden kullanılabilir.`
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

function espionageEventAsset(imageKey: EspionagePublicationImageKey, attachmentName: string): AttachmentBuilder {
  return new AttachmentBuilder(resolve(process.cwd(),"assets","espionage-events",imageKey),{ name:attachmentName });
}

function publicTargetName(operation: EspionageOperationView): string {
  return operation.target_character_name
    ?? operation.target_army_name
    ?? operation.target_building_name
    ?? operation.target_building_type
    ?? "şehir ve görevlileri";
}

export async function publishPendingEspionagePublications(
  client: Client,
  guildId: string
): Promise<{ published:number; failed:number }> {
  let published=0;
  let failed=0;
  const channels=new Map<string,Awaited<ReturnType<Client["channels"]["fetch"]>>>();
  for (const operation of await espionageService.pendingPublications(guildId)) {
    if (!isPlayerEspionageTarget(operation.target_type)) {
      await espionageService.markPublicSkipped(operation.id,"Bu eski görev türü oyuncu olay yayınına açık değil.");
      continue;
    }
    const outcome:EspionagePublicationOutcome=operation.severity && operation.severity!=="NONE" ? "SUCCESS" : "FAILURE";
    try {
      const template=await espionageService.publicTemplate(guildId,operation.target_type,outcome);
      if (!template?.enabled) {
        await espionageService.markPublicSkipped(operation.id,"Bu görev sonucunun olay şablonu panelden kapatılmış.");
        continue;
      }
      const channelId=operation.target_event_channel_id;
      if (!channelId) {
        await espionageService.markPublicFailed(operation.id,"Hedef yerleşkenin olay kanalı eşleştirilmemiş.");
        failed+=1;
        continue;
      }
      let channel=channels.get(channelId);
      if (channel===undefined) {
        channel=await client.channels.fetch(channelId).catch(()=>null);
        channels.set(channelId,channel);
      }
      if (!channel?.isTextBased() || channel.isDMBased()) throw new Error("Yerleşke olay kanalı bulunamadı veya metin kanalı değil.");

      const disclosure=espionagePublicDetectionDisclosure({
        detectionLevel:operation.detection_level,
        captured:operation.captured,
        attackerCountryName:operation.attacker_country_name,
        spyName:operation.spy_name
      });
      const variables={
        yerleske:operation.target_settlement_name,
        ulke:operation.target_country_name,
        gorev:ESPIONAGE_TARGETS[operation.target_type].label,
        hedef:publicTargetName(operation),
        etki:operation.effect_text??"Kalıcı bir etki oluşmadı.",
        tur:operation.resolve_turn,
        tespit:disclosure
      };
      const files:AttachmentBuilder[]=[];
      const resultEmbed=new EmbedBuilder()
        .setColor(outcome==="SUCCESS"?0x8b5a3c:0x4b5563)
        .setTitle(renderEspionagePublication(template.titleTemplate,variables).slice(0,256))
        .setDescription(renderEspionagePublication(template.bodyTemplate,variables).slice(0,4096))
        .setFooter({text:`${operation.target_settlement_name} • Tur ${operation.resolve_turn}`});
      if (template.imageKey) {
        const name=`mission-${operation.id}.png`;
        files.push(espionageEventAsset(template.imageKey,name));
        resultEmbed.setImage(`attachment://${name}`);
      }

      const embeds=[resultEmbed];
      if (disclosure) {
        const fateImage=espionagePublicDetectionImage(operation.detection_level,operation.captured);
        const fateName=`fate-${operation.id}.png`;
        files.push(espionageEventAsset(fateImage,fateName));
        embeds.push(new EmbedBuilder()
          .setColor(operation.captured?0x7f1d1d:operation.detection_level===2?0x9a6b31:0x263857)
          .setTitle("🕵️ Casusun Akıbeti")
          .setDescription(disclosure)
          .setImage(`attachment://${fateName}`));
      }

      await channel.send({embeds,files});
      await espionageService.markPublicPosted(operation.id);
      published+=1;
    } catch (error) {
      failed+=1;
      const message=error instanceof Error?error.message:String(error);
      await espionageService.markPublicFailed(operation.id,message).catch(()=>undefined);
      logger.error({error,guildId,operationId:operation.id},"Casusluk oyuncu olayı yayımlanamadı");
    }
  }
  return {published,failed};
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const country = await resolveCountry(interaction);
    if (sub === "gorev-baslat") {
      const targetCountry = resolveEspionageChoice(
        (await gameService.listCountries(interaction.guildId)).filter((item) => item.id !== country.id),
        interaction.options.getString("hedef-ulke", true),
        "Hedef ülke"
      );
      const spy = resolveEspionageChoice(
        (await espionageService.spies(country.id)).filter((item) => item.assignment === "NONE"),
        interaction.options.getString("casus", true),
        "Casus"
      );
      const targetSettlement = resolveEspionageChoice(
        await gameService.listSettlements(targetCountry.id),
        interaction.options.getString("hedef-sehir", true),
        "Hedef şehir"
      );
      const targetType = interaction.options.getString("hedef", true) as EspionageTarget;
      const rawSpecialTarget = interaction.options.getString("ozel-hedef");
      const personalTargetRows = isCharacterPersonalTarget(targetType)
        ? await espionageService.characterPersonalTargets(targetCountry.id,isKidnappingTarget(targetType))
        : isNoblePersonalTarget(targetType)
          ? await espionageService.noblePersonalTargets(targetCountry.id,isKidnappingTarget(targetType))
          : [];
      const personalTarget=(isCharacterPersonalTarget(targetType)||isNoblePersonalTarget(targetType))&&rawSpecialTarget
        ?resolveEspionageChoice(personalTargetRows,rawSpecialTarget,isKidnappingTarget(targetType)?"Kaçırma hedefi":"Suikast hedefi")
        :null;
      const [targetKind,targetId]=personalTarget?.id.split(":",2)??[null,null];
      const operation = await espionageService.startOperation({
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        attackerCountryId: country.id,
        spyCharacterId: spy.id,
        targetCountryId: targetCountry.id,
        targetSettlementId: targetSettlement.id,
        targetType,
        preparation: interaction.options.getString("hazirlik", true) as EspionagePreparation,
        targetCharacterId: targetKind === "ACADEMY" ? targetId??null : null,
        targetNobleType:targetKind==="DYNASTY"?"DYNASTY":targetKind==="ROMAN"?"ROMAN_FAMILY":null,
        targetNobleId:["DYNASTY","ROMAN"].includes(targetKind??"")?targetId??null:null,
        targetNobleFamilyId:targetKind==="DYNASTY"&&targetId
          ?(await espionageService.nobleFamily("DYNASTY",targetId)):targetKind==="ROMAN"&&targetId
            ?(await espionageService.nobleFamily("ROMAN_FAMILY",targetId)):null,
        targetArmyId: null
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
      const text = spies.length ? spies.map((spy) => `• **${spy.name}** (+${spy.skill_bonus}) — ${assignmentLabels[spy.assignment] ?? spy.assignment}${spy.specialization ? ` • ${CHARACTER_SPECIALIZATIONS[spy.specialization].label}` : spy.specialization_progress>0 ? ` • Uzmanlık ilerlemesi ${spy.specialization_progress}/3` : ""}${spy.country_name && spy.settlement_name ? `\n↳ ${spy.country_name} • ${spy.settlement_name}` : ""}`).join("\n\n") : "Akademide yetişmiş casus bulunmuyor.";
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x4b4d52).setTitle(`🕵️ ${country.name} • Casuslar`).setDescription(text.slice(0, 4_000))] });
      await logEspionageCommand(interaction,country.name,"Casus listesini görüntüledi.");
      return true;
    }
    if (sub === "uzmanlik-sec") {
      const characterId=interaction.options.getString("casus",true);
      const specialization=interaction.options.getString("uzmanlik",true) as CharacterSpecialization;
      const spy=(await espionageService.spies(country.id)).find((item)=>item.id===characterId);
      const progress=await characterService.setCharacterSpecialization({countryId:country.id,characterId,role:"SPY",specialization});
      await interaction.editReply("✅ Casusun kalıcı uzmanlığı **"+CHARACTER_SPECIALIZATIONS[specialization].label+"** olarak seçildi (Sv"+Math.min(3,Math.floor(progress/3))+").");
      await logEspionageCommand(interaction,country.name,"Casus **"+(spy?.name??"Bilinmeyen Casus")+"** için kalıcı uzmanlık **"+CHARACTER_SPECIALIZATIONS[specialization].label+"** seçildi.");
      return true;
    }
    if (sub === "savunma-ata") {
      const scope = interaction.options.getString("kapsam", true) as "COUNTRY" | "SETTLEMENT" | "CHARACTER";
      const settlementId = interaction.options.getString("sehir");
      if (scope === "SETTLEMENT" && !settlementId) throw new GameError("Şehir karşı casusluğu için bir şehir seçmelisiniz.");
      const protectionTarget = interaction.options.getString("korunan-hedef");
      if (scope === "CHARACTER" && !protectionTarget) throw new GameError("Şahsi koruma için korunacak karakteri veya aileyi seçmelisiniz.");
      await espionageService.assignDefense({ guildId: interaction.guildId, countryId: country.id, spyCharacterId: interaction.options.getString("casus", true), scope, settlementId,protectionTarget });
      await interaction.editReply({ content: `🛡️ Casus karşı casusluk görevine gönderildi; **bir sonraki tur başında** göreve başlayacak: **${scope === "COUNTRY" ? `${country.name} geneli` : scope === "SETTLEMENT" ? "seçilen şehir" : "seçilen karakter"}**.` });
      await logEspionageCommand(interaction,country.name,"Casus karşı casusluk görevine atandı • **"+scope+"**.");
      return true;
    }
    if (sub === "savunma-kaldir") {
      const changed = await espionageService.removeDefense({ guildId: interaction.guildId, countryId: country.id, spyCharacterId: interaction.options.getString("casus", true) });
      await interaction.editReply({ content: changed ? "✅ Casusun karşı casusluk görevi kaldırıldı; casus hemen yeniden görevlendirilebilir." : "ℹ️ Casus zaten müsait durumda." });
      await logEspionageCommand(interaction,country.name,changed ? "Casusun karşı casusluk görevi kaldırıldı; aynı turda yeniden kullanılabilir." : "Zaten müsait olan casus için savunma kaldırma denendi.");
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
    if (sub === "idam-et") {
      const result=await espionageService.executeCapturedSpy({
        guildId:interaction.guildId,characterId:interaction.options.getString("casus",true),actorId:interaction.user.id
      });
      await interaction.editReply(
        "☠️ **"+result.name+"** kalıcı olarak idam edildi. Casus artık **"+result.origin_country_name+"** devletine dönmeyecek.\n"+
        "Yakalayan devlet: **"+result.captor_country_name+"** • Gözaltı yeri: **"+result.captured_settlement_name+"**"
      );
      await queueCharacterLog({
        client:interaction.client,guildId:interaction.guildId,interactionId:interaction.id,
        actorUserId:interaction.user.id,title:"Casusluk Yönetimi",source:"CAPTURED_SPY_EXECUTION",
        entry:"☠️ <@"+interaction.user.id+"> tarafından **"+result.name+"** idam edildi.\n↳ Köken: **"+result.origin_country_name+"** • Yakalayan: **"+result.captor_country_name+"** • Yer: **"+result.captured_settlement_name+"**"
      }).catch(()=>undefined);
      return true;
    }
    if(sub==="esir-serbest-birak"||sub==="esir-infaz-et"){
      const execute=sub==="esir-infaz-et";
      const result=await espionageService.resolveKidnapping({
        guildId:interaction.guildId,captivityId:interaction.options.getString("tutsak",true),
        actorId:interaction.user.id,decision:execute?"EXECUTE":"RELEASE"
      });
      await interaction.editReply(
        (execute?"☠️":"🕊️")+" **"+result.name+"** "+(execute?"kalıcı olarak infaz edildi.":"serbest bırakıldı.")+"\n"+
        "Köken: **"+result.origin_country_name+"** • Kaçıran: **"+result.captor_country_name+"** • Yer: **"+result.captured_settlement_name+"**"
      );
      await queueCharacterLog({
        client:interaction.client,guildId:interaction.guildId,interactionId:interaction.id,
        actorUserId:interaction.user.id,title:"Kaçırma Yönetimi",source:execute?"KIDNAP_EXECUTION":"KIDNAP_RELEASE",
        entry:(execute?"☠️":"🕊️")+" <@"+interaction.user.id+"> tarafından **"+result.name+"** "+(execute?"infaz edildi.":"serbest bırakıldı.")+"\n"+
          "↳ Köken: **"+result.origin_country_name+"** • Kaçıran: **"+result.captor_country_name+"** • Yer: **"+result.captured_settlement_name+"**"
      }).catch(()=>undefined);
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
  if (interaction.commandName === "casusluk-yonetim" && focused.name === "casus") {
    if (!isGameMaster(interaction)) { await interaction.respond([]); return true; }
    const spies=await espionageService.capturedSpies(interaction.guildId);
    await interaction.respond(spies
      .filter((spy)=>!query||`${spy.name} ${spy.origin_country_name} ${spy.captor_country_name}`.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25)
      .map((spy)=>({
        name:(spy.name+" • "+spy.origin_country_name+" → "+spy.captor_country_name+" • dönüş Tur "+spy.automatic_return_turn).slice(0,100),
        value:spy.id
      })));
    return true;
  }
  if(interaction.commandName==="casusluk-yonetim"&&focused.name==="tutsak"){
    if(!isGameMaster(interaction)){await interaction.respond([]);return true;}
    const captives=await espionageService.kidnappedPeople(interaction.guildId);
    await interaction.respond(captives
      .filter((captive)=>!query||`${captive.name} ${captive.origin_country_name} ${captive.captor_country_name}`.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25)
      .map((captive)=>({
        name:(captive.name+" • "+captive.origin_country_name+" → "+captive.captor_country_name+" • Tur "+captive.captured_turn).slice(0,100),
        value:captive.id
      })));
    return true;
  }
  const own = await gameService.countryForUser(interaction.guildId, interaction.user.id);
  if (!own) { await interaction.respond([]); return true; }
  if (focused.name === "uzmanlik") {
    const selectedId=interaction.options.getString("casus");
    const character=selectedId ? (await characterService.list(own.id)).find((item)=>item.id===selectedId) : null;
    if (!character || character.role!=="SPY" || character.specialization) { await interaction.respond([]); return true; }
    const trackEntries=Object.entries(character.specialization_tracks??{});
    const legacyCredit=Number(character.specialization_choice_credit??0);
    const unlocked=trackEntries.length
      ? trackEntries.filter(([,progress])=>Number(progress)+legacyCredit>=3).map(([key])=>key as CharacterSpecialization)
      : legacyCredit>=3
        ? (Object.keys(CHARACTER_SPECIALIZATIONS) as CharacterSpecialization[]).filter((key)=>CHARACTER_SPECIALIZATIONS[key].role==="SPY")
        : [];
    await interaction.respond(unlocked
      .filter((key)=>!query||CHARACTER_SPECIALIZATIONS[key].label.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25).map((key)=>({name:CHARACTER_SPECIALIZATIONS[key].label,value:key})));
    return true;
  }
  if (focused.name === "casus") {
    const spies = await espionageService.spies(own.id);
    const sub = interaction.options.getSubcommand(false);
    const filtered = sub === "gorev-baslat" ? spies.filter((spy) => spy.assignment === "NONE")
      : sub === "savunma-ata" ? spies.filter((spy) => spy.assignment === "NONE" || isSpyDefenseAssignment(spy.assignment))
      : sub === "savunma-kaldir" ? spies.filter((spy) => isSpyDefenseAssignment(spy.assignment))
      : sub === "uzmanlik-sec" ? spies.filter((spy) => spy.assignment === "NONE" && !spy.specialization && spy.specialization_progress>=3)
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
    const targetType = interaction.options.getString("hedef") as EspionageTarget|null;
    const settlements = target ? (await gameService.listSettlements(target.id))
      .filter((item)=>!targetType||!isNoblePersonalTarget(targetType)||item.id===target.capital_settlement_id) : [];
    await interaction.respond(settlements.filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item) => ({ name: item.name, value: item.id })));
    return true;
  }
  if (focused.name === "ozel-hedef") {
    const targetType = interaction.options.getString("hedef") as EspionageTarget|null;
    const name = interaction.options.getString("hedef-ulke");
    const target = name ? await gameService.countryByName(interaction.guildId,name) : null;
    if (!target || !targetType) { await interaction.respond([]); return true; }
    const rows = isCharacterPersonalTarget(targetType)
      ? await espionageService.characterPersonalTargets(target.id,isKidnappingTarget(targetType))
      : isNoblePersonalTarget(targetType)
        ? await espionageService.noblePersonalTargets(target.id,isKidnappingTarget(targetType))
        : [];
    await interaction.respond(rows.filter((item)=>!query||item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item)=>({name:item.name.slice(0,100),value:item.id})));
    return true;
  }
  if (focused.name === "korunan-hedef") {
    const rows=(await espionageService.defenseTargets(own.id)).filter((item)=>item.id!=="ACADEMY:"+interaction.options.getString("casus"));
    await interaction.respond(rows.filter((item)=>!query||item.name.toLocaleLowerCase("tr-TR").includes(query)).slice(0,25).map((item)=>({name:item.name.slice(0,100),value:item.id})));
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
