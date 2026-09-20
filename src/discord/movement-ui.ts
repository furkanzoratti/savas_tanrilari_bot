import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction,
  type StringSelectMenuInteraction } from "discord.js";
import { number } from "../domain/format.js";
import { parseManualHexRoute } from "../domain/manual-hex-route.js";
import { formatHexCoordinate, parseHexCoordinate, type FormationKind, type MovementOrderStatus } from "../domain/movement.js";
import { armyService } from "../services/army-service.js";
import { fleetService } from "../services/fleet-service.js";
import { GameError } from "../services/game-service.js";
import { movementService } from "../services/movement-service.js";
import { movementTransportService } from "../services/movement-transport-service.js";
import { observerCoverageForCountry } from "../services/movement-observer-service.js";
import { countryIntelligenceReports } from "../services/movement-recon-service.js";
import { gameService } from "../services/game-service.js";
import { assertCountryAccess, resolveCountry } from "./auth.js";

const STATUS: Record<MovementOrderStatus, string> = {
  DRAFT: "Taslak", SUBMITTED: "Bekliyor", IN_PROGRESS: "Yolda", BLOCKED: "Yönetici kararı bekliyor",
  COMPLETED: "Vardı", CANCELLED: "İptal", FAILED: "Başarısız"
};

function safe(value: string): string { return value.replaceAll("@", "＠").replaceAll("`", "ˋ"); }

function routeText(coordinates: readonly string[]): string {
  if (coordinates.length <= 30) return coordinates.join(" → ");
  return `${coordinates.slice(0, 16).join(" → ")} → … → ${coordinates.slice(-10).join(" → ")}`;
}

function coordinate(value: string): string {
  try { return formatHexCoordinate(parseHexCoordinate(value)); }
  catch { throw new GameError("Hex koordinatı A12 veya AA12 biçiminde olmalıdır."); }
}

export async function handleMovementCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) throw new GameError("Hareket komutları yalnızca bir sunucuda kullanılabilir.");
  await interaction.deferReply({ ephemeral: true });
  const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
  const sub = interaction.options.getSubcommand();

  if(sub==="panel"){
    const positions=await movementService.countryPositions(interaction.guildId,country.id);
    const shown=positions.slice(0,12).map((item)=>
      `${item.formationKind==="ARMY"?"⚔️":"⛵"} **${safe(item.formationName)}** • ${item.coordinate??"Konumlandırılmadı"}`+
      (item.activeOrderStatus?` • ${STATUS[item.activeOrderStatus]}`:""));
    const embed=new EmbedBuilder().setColor(0x536d9b).setTitle(`🗺️ ${safe(country.name)} • Hareket Paneli`)
      .setDescription(`${shown.join("\n")||"Henüz ordu veya filo yok."}\n\n`+
        "Önce birlik türünü seçin; ardından hedef Hex'i forma yazın. İsterseniz tüm ara Hex'leri manuel rota olarak girebilirsiniz.")
      .setFooter({text:"Emirler /tur durdur aşamasında çözülür. Rota önizlemesi emir oluşturmaz."});
    const buttons=new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`mv|order|ARMY|${country.id}|0`).setLabel("⚔️ Ordu emri").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`mv|order|FLEET|${country.id}|0`).setLabel("⛵ Filo emri").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`mv|preview|ARMY|${country.id}|0`).setLabel("Ordu rotası").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`mv|preview|FLEET|${country.id}|0`).setLabel("Filo rotası").setStyle(ButtonStyle.Secondary));
    await interaction.editReply({embeds:[embed],components:[buttons]});
    return;
  }

  if (sub === "gozcu-alani") {
    const posts = await observerCoverageForCountry(interaction.guildId, country.id);
    const page = interaction.options.getInteger("sayfa") ?? 1;
    const selected = posts.slice((page-1)*5,page*5);
    await interaction.editReply(selected.length
      ? `👁️ **${safe(country.name)} • Gözcü Kapsaması** • Sayfa ${page}/${Math.ceil(posts.length/5)}\n${selected.map((post) =>
          `• **${safe(post.settlement)}** (${post.center}) • ${post.status === "ACTIVE" ? "Etkin" : "Geçici etkisiz"}\n  ${post.covered.join(", ")}`).join("\n")}`
      : posts.length ? "Bu sayfada gözcü bulunmuyor." : "Henüz haritaya bağlanmış etkin Gözcü Birliği bulunmuyor.");
    return;
  }

  if (sub === "istihbarat") {
    const guild = await gameService.guildState(interaction.guildId);
    const page = interaction.options.getInteger("sayfa") ?? 1;
    const reports = await countryIntelligenceReports(interaction.guildId,country.id,guild.current_turn,page);
    if (!reports.length) {
      await interaction.editReply("Bu devlete ulaşmış keşif raporu bulunmuyor.");
      return;
    }
    const lines = reports.map((report) => {
      const item = report.payload;
      if(item.manualNote)return `• **Tur ${report.available_turn} • Yönetici İstihbaratı** (${safe(String(item.hex??"?"))}): ${safe(String(item.manualNote))}`;
      const types = Array.isArray(item.mainUnitTypes) ? ` • Türler: ${item.mainUnitTypes.map(String).map(safe).join(", ")}` : "";
      const siege = Array.isArray(item.siegeTypes) && item.siegeTypes.length ? ` • Araçlar: ${item.siegeTypes.map(String).map(safe).join(", ")}` : "";
      const composition = Array.isArray(item.composition) ?
        ` • Dağılım: ${item.composition.map((unit: any) => `${safe(String(unit.type))} ${number(Number(unit.quantity))}`).join(", ")}` : "";
      const count = item.soldiers ?? item.approximateSoldiers ?? item.sizeBand;
      return `• **Tur ${report.available_turn} • ${safe(String(item.label ?? "Keşif"))}**: ${safe(String(item.direction ?? "Yön bilinmiyor"))}` +
        ` • Asker: ${safe(String(count ?? "Bilinmiyor"))}` +
        (item.hex ? ` • Konum: ${safe(String(item.hex))}` : "") + types + siege + composition;
    });
    await interaction.editReply(`🕵️ **${safe(country.name)} • Gizli İstihbarat** • Sayfa ${page}\n${lines.join("\n")}`.slice(0,1950));
    return;
  }

  if (sub === "konumlar") {
    const positions = await movementService.countryPositions(interaction.guildId, country.id);
    if (!positions.length) throw new GameError("Bu ülkeye ait kurulu ordu veya filo bulunmuyor.");
    const page = interaction.options.getInteger("sayfa") ?? 1;
    const rows = positions.slice((page - 1) * 12, page * 12).map((item) =>
      `${item.formationKind === "ARMY" ? "⚔️" : "⛵"} **${safe(item.formationName)}** — ` +
      `${item.coordinate ?? "Henüz konumlandırılmadı"}` +
      (item.activeOrderStatus ? ` • ${STATUS[item.activeOrderStatus]}` : "")
    );
    if (!rows.length) throw new GameError("Bu sayfada ordu veya filo bulunmuyor.");
    await interaction.editReply(
      `🗺️ **${safe(country.name)} • Birlik Konumları** • Sayfa ${page}/${Math.ceil(positions.length / 12)}\n${rows.join("\n")}`
    );
    return;
  }

  if (sub === "kesif-ata") {
    const army = await armyService.get(country.id, interaction.options.getString("ordu", true));
    const result = await movementService.setScoutDetachment({
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, armyId: army.id,
      lightCavalry: interaction.options.getInteger("hafif-suvari", true),
      horseArchers: interaction.options.getInteger("atli-okcu", true),
      heavyCavalry: interaction.options.getInteger("agir-suvari", true)
    });
    await interaction.editReply(`🕵️ **${safe(army.name)}** keşif birliği: **${number(result.effectiveStrength)}** etkin süvari • Zar bonusu **+${result.rollBonus}**.`);
    return;
  }

  if (sub === "filo-yuku" || sub === "gemiye-bin") {
    const fleet = await fleetService.get(country.id, interaction.options.getString("filo", true));
    if (sub === "gemiye-bin") {
      const army = await armyService.get(country.id, interaction.options.getString("ordu", true));
      await movementTransportService.embark({ guildId: interaction.guildId, countryId: country.id,
        actorId: interaction.user.id, armyId: army.id, fleetId: fleet.id });
    }
    const cargo = await movementTransportService.cargo(interaction.guildId, country.id, fleet.id);
    await interaction.editReply(`⛵ **${safe(cargo.fleet)} • Deniz Yükü**\n` +
      `Asker: **${number(cargo.capacity.occupiedSoldiers)}/${number(cargo.capacity.soldiers)}** • ` +
      `Kuşatma: **${number(cargo.capacity.occupiedSiegeLoads)}/${number(cargo.capacity.siegeLoads)} yük**\n` +
      `Birleşik doluluk: **%${number(Math.round(cargo.capacity.utilization * 100))}**\n` +
      `Taşınan ordular: ${cargo.armies.map(safe).join(", ") || "Yok"}`);
    return;
  }

  if (sub === "karaya-cik") {
    const army = await armyService.get(country.id, interaction.options.getString("ordu", true));
    const destination = coordinate(interaction.options.getString("hex", true));
    await movementTransportService.disembark({ guildId: interaction.guildId, countryId: country.id,
      actorId: interaction.user.id, armyId: army.id, coordinate: destination });
    await interaction.editReply(`✅ **${safe(army.name)}** ordusu **${destination}** kıyısına çıktı.`);
    return;
  }

  if (sub === "emirler") {
    const page = interaction.options.getInteger("sayfa") ?? 1;
    const result = await movementService.countryOrdersPage(country.id, page);
    if (!result.total) throw new GameError("Bu ülkeye ait kayıtlı hareket emri bulunmuyor.");
    const rows = result.orders.map((order) =>
      `• **${safe(order.formationName)}** • ${STATUS[order.status]} • ${order.start} → ${order.destination}` +
      ` • Adım ${order.currentStep}/${order.route.length}\n  ID: \`${order.id}\`` +
      (order.blockedReason ? `\n  ⚠️ ${safe(order.blockedReason).slice(0, 120)}` : "") +
      (order.note ? `\n  📝 ${safe(order.note).slice(0, 120)}` : "")
    );
    if (!rows.length) throw new GameError("Bu sayfada hareket emri bulunmuyor.");
    await interaction.editReply(`📜 **${safe(country.name)} • Hareket Emirleri** • Sayfa ${page}/${Math.ceil(result.total / 5)}\n${rows.join("\n")}`);
    return;
  }

  if (sub === "iptal") {
    const orderId = interaction.options.getString("emir-id", true).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      throw new GameError("Emir ID'si tam UUID biçiminde olmalıdır; /hareket emirler listesinden kopyalayın.");
    }
    const order = await movementService.cancelOrder({
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, orderId
    });
    await interaction.editReply(`✅ **${safe(order.formationName)}** hareket emri iptal edildi. Birlik bulunduğu Hex'te kalır.`);
    return;
  }

  const kind = interaction.options.getString("tur", true) as FormationKind;
  const formationName = interaction.options.getString("birim", true);
  const formation = kind === "ARMY"
    ? await armyService.get(country.id, formationName)
    : await fleetService.get(country.id, formationName);
  const destination = coordinate(interaction.options.getString("hedef-hex", true));
  let manualRoute: string[] | null;
  try { manualRoute = parseManualHexRoute(interaction.options.getString("rota"), destination); }
  catch (error) { throw new GameError(error instanceof Error ? error.message : "Manuel rota geçersiz."); }

  if (sub === "rota") {
    const input = { guildId: interaction.guildId, countryId: country.id, formationKind: kind, formationId: formation.id };
    const route = manualRoute
      ? await movementService.previewManualRoute({ ...input, route: manualRoute })
      : await movementService.planRoute({ ...input, destination });
    await interaction.editReply(
      `🧭 **${safe(formation.name)} • ${manualRoute ? "Manuel" : "En kısa"} Rota Önizlemesi**\n` +
      `Başlangıç: **${route.coordinates[0]}** • Hedef: **${route.coordinates.at(-1)}**\n` +
      `Mesafe: **${number(route.costs.length)} Hex** • Toplam geçiş maliyeti: **${number(route.totalCost)}**\n` +
      `Rota: ${routeText(route.coordinates)}\n` +
      "Bu önizleme emir vermez; karşılaşma ve geçiş izinleri tur çözümünde ayrıca incelenir."
    );
    return;
  }

  if (sub === "emir-ver") {
    const settings = await movementService.settings(interaction.guildId);
    if (!settings.enabled) throw new GameError("Hareket emirleri henüz açılmadı; /hareket rota ile önizleme yapabilirsiniz.");
    const input = {
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id,
      formationKind: kind, formationId: formation.id, mode: "NORMAL" as const,
      dedupeKey: `discord:${interaction.id}`,
      metadata: { source: "DISCORD_COMMAND", note: interaction.options.getString("not")?.trim() || null }
    };
    const order = manualRoute
      ? await movementService.submitOrder({ ...input, route: manualRoute })
      : await movementService.submitPlannedOrder({ ...input, destination });
    await interaction.editReply(
      `✅ **${safe(order.formationName)}** için hareket emri kaydedildi.\n` +
      `Rota: **${order.start} → ${order.destination}** • ${order.route.length} adım • Tur hareket hakkı: **${number(order.effectiveAllowance)}**\n` +
      `Emir ID: \`${order.id}\`\n` +
      "Bu emir /tur durdur aşamasında çözülecek. Yabancı bölge veya düşman teması otomatik geçilmez."
    );
    return;
  }

  throw new GameError("Bilinmeyen hareket işlemi.");
}

export async function handleMovementButton(interaction:ButtonInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("mv|"))return false;
  const [,mode,kind,countryId,pageText]=interaction.customId.split("|");
  if(!interaction.guildId||!countryId||!(["order","preview"].includes(mode??""))||!(["ARMY","FLEET"].includes(kind??"")))
    throw new GameError("Hareket formu geçersiz; /hareket panel komutunu yeniden açın.");
  await assertCountryAccess(interaction,countryId);
  const page=Math.max(0,Math.min(100,Number(pageText)||0));
  const positions=(await movementService.countryPositions(interaction.guildId,countryId)).filter((item)=>
    item.formationKind===kind&&item.coordinate&&!item.coordinate.startsWith("Gemide:")&&
    (mode==="preview"||!item.activeOrderStatus));
  const items=positions.slice(page*25,(page+1)*25);
  if(!items.length)throw new GameError("Bu türde konumlandırılmış ve işlem yapılabilir birlik bulunmuyor.");
  const select=new StringSelectMenuBuilder().setCustomId(`mvs|${mode}|${kind}|${countryId}`)
    .setPlaceholder("Birliği seçin; hedef Hex formu açılacak")
    .addOptions(items.map((item)=>({label:item.formationName.slice(0,100),
      description:`${item.coordinate}${item.activeOrderStatus?` • ${STATUS[item.activeOrderStatus]}`:""}`.slice(0,100),
      value:item.formationId})));
  const controls=new ActionRowBuilder<ButtonBuilder>();
  if(page>0)controls.addComponents(new ButtonBuilder().setCustomId(`mv|${mode}|${kind}|${countryId}|${page-1}`).setLabel("Önceki").setStyle(ButtonStyle.Secondary));
  if((page+1)*25<positions.length)controls.addComponents(new ButtonBuilder().setCustomId(`mv|${mode}|${kind}|${countryId}|${page+1}`).setLabel("Sonraki").setStyle(ButtonStyle.Secondary));
  await interaction.update({content:`🧭 **${kind==="ARMY"?"Ordu":"Filo"} ${mode==="order"?"Hareket Emri":"Rota Önizlemesi"}** • Sayfa ${page+1}/${Math.ceil(positions.length/25)}`,
    embeds:[],components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),...(controls.components.length?[controls]:[])]});
  return true;
}

export async function handleMovementSelect(interaction:StringSelectMenuInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("mvs|"))return false;
  const [,mode,kind,countryId]=interaction.customId.split("|");
  if(!interaction.guildId||!countryId||!(["order","preview"].includes(mode??""))||!(["ARMY","FLEET"].includes(kind??"")))
    throw new GameError("Hareket seçimi geçersiz.");
  await assertCountryAccess(interaction,countryId);
  const formationId=interaction.values[0];
  if(!formationId)throw new GameError("Birlik seçilmedi.");
  const formation=kind==="ARMY"?await armyService.get(countryId,formationId):await fleetService.get(countryId,formationId);
  const modal=new ModalBuilder().setCustomId(`mvm|${mode}|${kind}|${countryId}|${formation.id}`)
    .setTitle(`${mode==="order"?"Hareket Emri":"Rota Önizlemesi"} • ${formation.name}`.slice(0,45));
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("destination")
      .setLabel("Hedef Hex").setPlaceholder("Örnek: AA12").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("route")
      .setLabel("Manuel rota (isteğe bağlı)").setPlaceholder("A12 B12 C13 ... Hedef dahil; boşsa en kısa rota")
      .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)));
  if(mode==="order")modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId("note").setLabel("Yöneticiye özel hamle notu (isteğe bağlı)")
      .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)));
  await interaction.showModal(modal);
  return true;
}

export async function handleMovementModal(interaction:ModalSubmitInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("mvm|"))return false;
  const [,mode,kind,countryId,formationId]=interaction.customId.split("|");
  if(!interaction.guildId||!countryId||!formationId||!(["order","preview"].includes(mode??""))||!(["ARMY","FLEET"].includes(kind??"")))
    throw new GameError("Hareket formu geçersiz.");
  await interaction.deferReply({ephemeral:true});
  await assertCountryAccess(interaction,countryId);
  const formation=kind==="ARMY"?await armyService.get(countryId,formationId):await fleetService.get(countryId,formationId);
  const destination=coordinate(interaction.fields.getTextInputValue("destination"));
  let manualRoute:string[]|null;
  try{manualRoute=parseManualHexRoute(interaction.fields.getTextInputValue("route"),destination);}
  catch(error){throw new GameError(error instanceof Error?error.message:"Manuel rota geçersiz.");}
  const base={guildId:interaction.guildId,countryId,formationKind:kind as FormationKind,formationId};
  if(mode==="preview"){
    const route=manualRoute?await movementService.previewManualRoute({...base,route:manualRoute})
      :await movementService.planRoute({...base,destination});
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x536d9b)
      .setTitle(`🧭 ${safe(formation.name)} • Rota Önizlemesi`)
      .setDescription(`**Başlangıç:** ${route.coordinates[0]}\n**Hedef:** ${route.coordinates.at(-1)}\n`+
        `**Mesafe:** ${route.costs.length} Hex • **Geçiş maliyeti:** ${number(route.totalCost)}\n`+
        `**Rota:** ${routeText(route.coordinates)}\n\nBu önizleme emir vermez.`)]});
    return true;
  }
  const settings=await movementService.settings(interaction.guildId);
  if(!settings.enabled)throw new GameError("Hareket henüz açılmadı; rota önizlemesini kullanabilirsiniz.");
  const input={...base,actorId:interaction.user.id,mode:"NORMAL" as const,
    dedupeKey:`discord:${interaction.id}`,metadata:{source:"DISCORD_MODAL",note:interaction.fields.getTextInputValue("note").trim()||null}};
  const order=manualRoute?await movementService.submitOrder({...input,route:manualRoute})
    :await movementService.submitPlannedOrder({...input,destination});
  await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x4d9b65)
    .setTitle(`✅ ${safe(formation.name)} • Hareket Emri`)
    .setDescription(`**Rota:** ${order.start} → ${order.destination}\n**Adım:** ${order.route.length} • `+
      `**Tur hareket hakkı:** ${number(order.effectiveAllowance)}\n**Durum:** ${STATUS[order.status]}\n`+
      `**Emir ID:** \`${order.id}\`\n\n/tur durdur aşamasında çözülecek.`)]});
  return true;
}
