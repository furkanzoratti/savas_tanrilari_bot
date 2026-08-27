import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type Client,
  type Interaction, type ModalSubmitInteraction, type StringSelectMenuInteraction
} from "discord.js";
import { BUILDING_CATEGORIES, BUILDINGS, CITY_POLICIES, MOBILIZATION_RULES, SHIPS, SIEGE_ASSETS, UNITS } from "../domain/catalog.js";
import { gold, number } from "../domain/format.js";
import { CULTURE_GROUPS, type CultureGroup } from "../domain/cultures.js";
import { garrisonComposition } from "../domain/garrison.js";
import type { Mobilization, UnitStatus } from "../domain/types.js";
import { TRADE_ROUTE_LABELS, type TradeRoute } from "../domain/trade.js";
import { RESOURCES, shipCostMultiplier, unitCostMultiplier, type ResourceType } from "../domain/resources.js";
import { buildingPurchaseTerms, gameService, GameError } from "../services/game-service.js";
import { cityService } from "../services/city-service.js";
import { commandLogService } from "../services/command-log-service.js";
import { roleReportService } from "../services/role-report-service.js";
import { DEFAULT_WELCOME_MESSAGE, renderWelcomeMessage, welcomeService } from "../services/welcome-service.js";
import { tradeService } from "../services/trade-service.js";
import { assertCountryAccess, isGameMaster, requireGameMaster, resolveCountry } from "./auth.js";
import { buildingChoices, shipChoices, unitChoices } from "./commands.js";
import { renderDocument } from "./document.js";
import { BRAND_BANNER_PATH, BRAND_BANNER_NAME, TEMPLE_BANNER_PATH, TEMPLE_BANNER_NAME } from "./assets.js";
import { turnAnnouncement } from "./turn-announcements.js";
import { handleBattleButton, handleBattleCommand, refreshActiveBattleCards } from "./battle-ui.js";
import { handleCityButton, handleCityCommand, handleCityModal } from "./city-ui.js";
import { addCountryRoleToMember, deleteCountryRole, ensureCountryRole, removeCountryRoleFromMember } from "./country-roles.js";
import { handleDiplomacyButton, handleDiplomacyCommand } from "./diplomacy-ui.js";
import { handleWarDeclarationButton, handleWarDeclarationCommand, handleWarDeclarationModal } from "./war-declaration-ui.js";

function settlementSelect(customId: string, settlements: Array<{ id: string; name: string; population: number }>, placeholder: string) {
  if (!settlements.length) throw new GameError("Bu ülkeye ait yerleşke bulunmuyor.");
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder)
      .addOptions(settlements.slice(0, 25).map((s) => ({ label: s.name.slice(0, 100), description: `${number(s.population)} nüfus`, value: s.id })))
  );
}

async function sendDocument(interaction: ChatInputCommandInteraction, countryId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const embeds = renderDocument(await gameService.document(countryId));
  const batches: EmbedBuilder[][] = [];
  for (let index = 0; index < embeds.length; index += 10) batches.push(embeds.slice(index, index + 10));
  await interaction.editReply({ embeds: batches[0] ?? [], files: [new AttachmentBuilder(TEMPLE_BANNER_PATH, { name: TEMPLE_BANNER_NAME })] });
  for (const batch of batches.slice(1)) await interaction.followUp({ embeds: batch, files: [new AttachmentBuilder(TEMPLE_BANNER_PATH, { name: TEMPLE_BANNER_NAME })], ephemeral: true });
}

async function startPurchase(interaction: ChatInputCommandInteraction, kind: "build" | "unit" | "ship"): Promise<void> {
  const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
  const settlements = await gameService.listSettlements(country.id);
  const prefix = kind === "build" ? "bs" : kind === "unit" ? "us" : "ss";
  const label = kind === "build" ? "Bina kurulacak yerleşkeyi seç" : kind === "unit" ? "Asker eğitilecek yerleşkeyi seç" : "Geminin üretileceği yerleşkeyi seç";
  await interaction.reply({ content: `**${country.name}** — ${label}`, components: [settlementSelect(`${prefix}|${country.id}`, settlements, label)], ephemeral: true });
}

async function findSettlement(countryId: string, name: string) {
  const settlements = await gameService.listSettlements(countryId);
  const settlement = settlements.find((item) => item.name.toLocaleLowerCase("tr-TR") === name.trim().toLocaleLowerCase("tr-TR"));
  if (!settlement) throw new GameError("Yerleşke bulunamadı. Adı belgede göründüğü biçimde yazın.");
  return settlement;
}

async function handleTrade(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
  const sub = interaction.options.getSubcommand();

  if (sub === "teklif") {
    await interaction.deferReply();
    const receiver = await gameService.countryByName(interaction.guildId, interaction.options.getString("hedef-ulke", true));
    if (!receiver) throw new GameError("Hedef ülke bulunamadı.");
    const proposerSettlement = await findSettlement(country.id, interaction.options.getString("kendi-yerlesken", true));
    const receiverSettlement = await findSettlement(receiver.id, interaction.options.getString("hedef-yerleske", true));
    const agreement = await tradeService.createOffer({
      guildId: interaction.guildId, actorId: interaction.user.id,
      proposerCountryId: country.id, receiverCountryId: receiver.id,
      proposerSettlementId: proposerSettlement.id, receiverSettlementId: receiverSettlement.id,
      route: interaction.options.getString("tur", true) as TradeRoute
    });
    const players = await gameService.playerIds(receiver.id);
    const mentions = players.length ? players.map((id) => `<@${id}>`).join(" ") : `**${receiver.name} yöneticileri**`;
    const embed = new EmbedBuilder()
      .setColor(0xc59b45)
      .setTitle("🤝 Yeni Hammadde Ticaret Teklifi")
      .setDescription(`**${country.name}**, **${receiver.name}** ülkesine ticaret teklif ediyor.`)
      .addFields(
        { name: "📤 Gönderen", value: `**${agreement.proposer_country_name}**\n${agreement.proposer_settlement_name} • **${RESOURCES[agreement.proposer_resource].label}**`, inline: true },
        { name: "📥 Hedef", value: `**${agreement.receiver_country_name}**\n${agreement.receiver_settlement_name} • **${RESOURCES[agreement.receiver_resource].label}**`, inline: true },
        { name: "🛤️ Güzergâh", value: TRADE_ROUTE_LABELS[agreement.route], inline: true },
        { name: "Kaynak Paylaşımı", value: `Kabul edilirse ${agreement.proposer_settlement_name}, **${RESOURCES[agreement.receiver_resource].label}** etkilerini; ${agreement.receiver_settlement_name} ise **${RESOURCES[agreement.proposer_resource].label}** etkilerini kazanır.` }
      )
      .setFooter({ text: "Hedef ülkenin oyuncularından biri teklifi yalnızca bir kez sonuçlandırabilir." });
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`trade_accept|${agreement.id}`).setLabel("Kabul Et").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`trade_reject|${agreement.id}`).setLabel("Reddet").setEmoji("❌").setStyle(ButtonStyle.Danger)
    );
    await interaction.editReply({ content: mentions, embeds: [embed], components: [buttons], allowedMentions: { users: players } });
  } else if (sub === "liste") {
    await interaction.deferReply({ ephemeral: true });
    const agreements = await tradeService.list(country.id);
    const lines = agreements.map((agreement) => {
      const partner = agreement.proposer_country_id === country.id ? agreement.receiver_country_name : agreement.proposer_country_name;
      const direction = agreement.status === "PENDING" && agreement.receiver_country_id === country.id ? "📥 Gelen" : agreement.status === "PENDING" ? "📤 Gönderilen" : agreement.status === "ACTIVE" ? "✅ Aktif" : "⛔ Sona ermiş";
      return `${direction} • **${partner}** • ${TRADE_ROUTE_LABELS[agreement.route]}\n${agreement.proposer_settlement_name} (${RESOURCES[agreement.proposer_resource].label}) ⇄ ${agreement.receiver_settlement_name} (${RESOURCES[agreement.receiver_resource].label})`;
    });
    await interaction.editReply(lines.length ? lines.join("\n\n") : "Bu ülkeye ait ticaret teklifi veya antlaşması bulunmuyor.");
  } else if (sub === "feshet") {
    await interaction.deferReply({ ephemeral: true });
    const agreements = (await tradeService.list(country.id)).filter((agreement) => agreement.status === "ACTIVE");
    if (!agreements.length) throw new GameError("Feshedilebilecek aktif ticaret antlaşması yok.");
    const menu = new StringSelectMenuBuilder().setCustomId(`trade_end|${country.id}`).setPlaceholder("Feshedilecek antlaşmayı seç")
      .addOptions(agreements.map((agreement) => ({
        label: `${agreement.proposer_country_name} ⇄ ${agreement.receiver_country_name}`.slice(0, 100),
        description: `${RESOURCES[agreement.proposer_resource].label} ⇄ ${RESOURCES[agreement.receiver_resource].label} • ${TRADE_ROUTE_LABELS[agreement.route]}`.slice(0, 100),
        value: agreement.id
      })));
    await interaction.editReply({ content: "Sona erdirmek istediğin aktif ticaret antlaşmasını seç:", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
  }
}
function commandText(interaction: ChatInputCommandInteraction): string {
  const flatten = (options: readonly any[]): string[] => options.flatMap((option) => {
    if (option.options?.length) return [option.name, ...flatten(option.options)];
    if (option.value === undefined) return [option.name];
    return [`${option.name}:${String(option.value)}`];
  });
  return [`/${interaction.commandName}`, ...flatten(interaction.options.data)].join(" ").slice(0, 1_500);
}

async function publishCommandLog(interaction: ChatInputCommandInteraction, channelId: string | null, success: boolean): Promise<void> {
  if (!channelId) return;
  try {
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    await channel.send({ embeds: [new EmbedBuilder()
      .setColor(success ? 0x3f7f5f : 0x8b1e1e)
      .setTitle(success ? "✅ Oyuncu Komutu" : "❌ Başarısız Oyuncu Komutu")
      .setDescription(`Oyuncu: <@${interaction.user.id}>\nKomut: \`${commandText(interaction).replaceAll("`", "ˋ")}\``)
      .setTimestamp()] });
  } catch (error) {
    console.error("Komut log kanalı bildirimi gönderilemedi", error);
  }
}

async function handleTurn(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGameMaster(interaction);
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply();
  let embed: EmbedBuilder;
  if (sub === "atla") {
    const result = await gameService.advanceTurn(interaction.guildId, interaction.user.id);
    await refreshActiveBattleCards(interaction.client, interaction.guildId);
    embed = turnAnnouncement({
      kind: "ADVANCE", turn: result.turn, acquisition: result.acquisition,
      completedBuildings: result.completedBuildings, recruitmentArrivals: result.recruitmentArrivals,
      completedShips: result.completedShips, completedSiegeAssets: result.completedSiegeAssets, garrisonUpgrades: result.garrisonUpgrades,
      completedBuildingDetails: result.completedBuildingDetails,
      recruitmentArrivalDetails: result.recruitmentArrivalDetails,
      completedShipDetails: result.completedShipDetails,
      completedSiegeDetails: result.completedSiegeDetails,
      garrisonUpgradeDetails: result.garrisonUpgradeDetails,
      activatedPolicyDetails: result.activatedPolicyDetails,
      unrestDetails: result.unrestDetails,
      starvationDetails: result.starvationDetails,
      pantheonLoanDetails: result.pantheonLoanDetails
    });
  } else {
    const phase = sub === "ac" ? "OPEN" : sub === "durdur" ? "RESOLVING" : "CLOSED";
    await gameService.setTurnPhase(interaction.guildId, interaction.user.id, phase);
    const guild = await gameService.guildState(interaction.guildId);
    embed = turnAnnouncement({ kind: sub === "ac" ? "OPEN" : sub === "durdur" ? "PAUSE" : "CLOSE", turn: guild.current_turn });
  }
  await interaction.editReply({ embeds: [embed], files: [new AttachmentBuilder(BRAND_BANNER_PATH, { name: BRAND_BANNER_NAME })] });
}

async function handleWelcomeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGameMaster(interaction);
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  await interaction.deferReply({ ephemeral: true });
  const operation = interaction.options.getString("islem", true);
  if (operation === "clear") {
    await welcomeService.clearConfig(interaction.guildId);
    await interaction.editReply("✅ Otomatik hoş geldin mesajları kapatıldı.");
    return;
  }
  const channel = interaction.options.getChannel("kanal");
  if (!channel) throw new GameError("Hoş geldin sistemini ayarlamak için bir metin kanalı seçmelisiniz.");
  const message = interaction.options.getString("mesaj")?.trim() || DEFAULT_WELCOME_MESSAGE;
  await welcomeService.setConfig(interaction.guildId, channel.id, message);
  const preview = renderWelcomeMessage(message, interaction.user.toString(), interaction.guild?.name ?? "Sunucu");
  await interaction.editReply(`✅ Yeni üyeler ${channel} kanalında karşılanacak.\n\n**Mesaj önizlemesi**\n${preview}`);
}
async function handleCountryRoles(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGameMaster(interaction);
  if (!interaction.guildId || !interaction.guild) throw new GameError("Sunucu bulunamadı.");
  await interaction.deferReply({ ephemeral: true });

  const countries = await gameService.listCountries(interaction.guildId);
  if (!countries.length) throw new GameError("Rolü oluşturulacak kayıtlı devlet bulunmuyor.");

  await interaction.guild.roles.fetch();
  let created = 0;
  let linked = 0;
  let assigned = 0;
  let absentMembers = 0;
  const failures: string[] = [];

  for (let index = 0; index < countries.length; index += 1) {
    const country = countries[index]!;
    try {
      const result = await ensureCountryRole(interaction.guild, country, interaction.user.id, true);
      if (result.created) created += 1;
      if (result.linked) linked += 1;

      const playerIds = await gameService.playerIds(country.id);
      for (const playerId of playerIds) {
        try {
          if (await addCountryRoleToMember(interaction.guild, playerId, result.role)) assigned += 1;
        } catch {
          absentMembers += 1;
        }
      }
    } catch (error) {
      failures.push(`${country.name}: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`);
    }

    if ((index + 1) % 10 === 0 && index + 1 < countries.length) {
      await interaction.editReply(`🏛️ Devlet rolleri hazırlanıyor: **${index + 1}/${countries.length}**`);
    }
  }

  const summary = [
    "✅ **Devlet rolü eşitlemesi tamamlandı.**",
    `• İncelenen devlet: **${countries.length}**`,
    `• Yeni oluşturulan rol: **${created}**`,
    `• Veritabanına yeni bağlanan rol: **${linked}**`,
    `• Oyunculara yeni verilen rol: **${assigned}**`,
    `• Sunucuda bulunamadığı için atlanan oyuncu: **${absentMembers}**`,
    "• Roller Discord hiyerarşisinde **Bot** rolünün altında oluşturuldu."
  ];
  if (failures.length) {
    summary.push(`\n⚠️ **Tamamlanamayan ${failures.length} devlet**\n${failures.slice(0, 10).map((failure) => `• ${failure}`).join("\n")}`);
  }
  await interaction.editReply(summary.join("\n"));
}
async function handleAdmin(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGameMaster(interaction);
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (sub === "ulke-olustur") {
    const country = await gameService.createCountry(interaction.guildId, interaction.user.id, interaction.options.getString("ad", true), interaction.options.getInteger("hazine", true));
    try {
      if (!interaction.guild) throw new GameError("Sunucu bulunamadı.");
      const result = await ensureCountryRole(interaction.guild, country, interaction.user.id);
      await interaction.editReply(`✅ **${country.name}** oluşturuldu ve ${result.role} devlet rolü hazırlandı.`);
    } catch {
      await interaction.editReply(`⚠️ **${country.name}** oluşturuldu; ancak Discord rolü hazırlanamadı. **/devlet-rolleri** komutunu çalıştırarak tekrar deneyin.`);
    }
  } else if (sub === "ulkeleri-listele") {
    const countries = await gameService.listCountries(interaction.guildId);
    if (!countries.length) {
      await interaction.editReply("Oyunda kayıtlı aktif devlet bulunmuyor.");
    } else {
      const rows = await Promise.all(countries.map(async (country) => {
        const [settlements, players] = await Promise.all([gameService.listSettlements(country.id), gameService.playerIds(country.id)]);
        return `• **${country.name}** — ${settlements.length} yerleşke • ${players.length ? players.map((id) => `<@${id}>`).join(" ") : "Oyuncu yok"}`;
      }));
      const pages: string[] = [];
      for (let index = 0; index < rows.length; index += 20) pages.push(rows.slice(index, index + 20).join("\n"));
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xc59b45).setTitle(`🌍 Aktif Devletler — ${countries.length}`).setDescription(pages[0]!)] });
      for (let index = 1; index < pages.length; index += 1) await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0xc59b45).setTitle(`🌍 Aktif Devletler — Devam ${index + 1}`).setDescription(pages[index]!)], ephemeral: true });
    }
  } else if (sub === "devlet-belgeleri") {
    const countries = await gameService.listCountries(interaction.guildId);
    if (!countries.length) {
      await interaction.editReply("Oyunda kayıtlı aktif devlet bulunmuyor.");
    } else {
      let firstBatch = true;
      for (const country of countries) {
        const embeds = renderDocument(await gameService.document(country.id));
        for (let index = 0; index < embeds.length; index += 10) {
          const payload = { embeds: embeds.slice(index, index + 10), files: [new AttachmentBuilder(TEMPLE_BANNER_PATH, { name: TEMPLE_BANNER_NAME })] };
          if (firstBatch) { await interaction.editReply(payload); firstBatch = false; }
          else await interaction.followUp({ ...payload, ephemeral: true });
        }
      }
    }
  } else if (sub === "ulke-sil") {
    if (interaction.options.getString("onay", true) !== "SIL") throw new GameError("Ülke silme iptal edildi. Onay alanına tam olarak **SIL** yazmalısınız.");
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const result = await gameService.deleteCountry({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id });
    let roleNote = "";
    if (interaction.guild && result.discordRoleId) {
      try {
        if (await deleteCountryRole(interaction.guild, result.discordRoleId, `Devlet silindi • Yönetici: ${interaction.user.id}`)) roleNote = "\n🏛️ Bağlı Discord rolü de silindi.";
      } catch {
        roleNote = "\n⚠️ Bağlı Discord rolü silinemedi; sunucu rollerinden elle kaldırılmalıdır.";
      }
    }
    await interaction.editReply(`🗑️ **${result.name}** kalıcı olarak silindi. ${result.settlements} yerleşke ve ${result.battles} bağlı savaş kaydı kaldırıldı.${roleNote}`);
  } else if (sub === "yerleske-sil") {
    if (interaction.options.getString("onay", true) !== "SIL") throw new GameError("Yerleşke silme iptal edildi. Onay alanına tam olarak **SIL** yazmalısınız.");
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const result = await gameService.deleteSettlement({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id });
    await interaction.editReply(`🗑️ **${result.name}**, **${country.name}** devletinden kalıcı olarak silindi. Bağlı bina, birlik, emir ve ticaret kayıtları da kaldırıldı.`);
  } else if (sub === "nufus-sil") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const populationType = interaction.options.getString("nufus-turu", true) as "FREE" | "SLAVE";
    const amount = interaction.options.getInteger("miktar", true);
    const result = await gameService.reduceSettlementPopulation({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, populationType, amount });
    await interaction.editReply(`✅ **${settlement.name}** yerleşkesinden ${number(amount)} ${populationType === "FREE" ? "özgür" : "köle"} nüfus silindi. Kalan: **${number(result.remaining)}**.`);
  } else if (sub === "yerleske-devret") {
    const source = await gameService.countryByName(interaction.guildId, interaction.options.getString("kaynak-ulke", true));
    const target = await gameService.countryByName(interaction.guildId, interaction.options.getString("hedef-ulke", true));
    if (!source || !target) throw new GameError("Kaynak veya hedef ülke bulunamadı.");
    const settlement = await findSettlement(source.id, interaction.options.getString("yerleske", true));
    const result = await gameService.transferSettlement({ guildId: interaction.guildId, actorId: interaction.user.id, sourceCountryId: source.id, targetCountryId: target.id, settlementId: settlement.id });
    await interaction.editReply(`🏳️ **${result.settlementName}**, **${result.sourceName}** devletinden **${result.targetName}** devletine aktarıldı ve **Fethedilmiş** olarak işaretlendi.\n⚔️ İptal edilen aktif asker alımı: **${result.cancelledRecruitmentOrders}**\n🤝 Feshedilen/bekleyen ticaret: **${result.endedTrades}**`);
  } else if (sub === "oyuncu-ata") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    if (!interaction.guild) throw new GameError("Sunucu bulunamadı.");
    const user = interaction.options.getUser("oyuncu", true);
    const ensured = await ensureCountryRole(interaction.guild, country, interaction.user.id);
    let roleAdded = false;
    try {
      roleAdded = await addCountryRoleToMember(interaction.guild, user.id, ensured.role);
      await gameService.assignPlayer(interaction.guildId, interaction.user.id, country.id, user.id);
    } catch (error) {
      if (roleAdded) await removeCountryRoleFromMember(interaction.guild, user.id, ensured.role.id).catch(() => undefined);
      throw error;
    }
    await interaction.editReply(`✅ ${user} → **${country.name}** ataması yapıldı ve ${ensured.role} rolü verildi.`);
  } else if (sub === "oyuncu-cikar") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    if (!interaction.guild) throw new GameError("Sunucu bulunamadı.");
    const user = interaction.options.getUser("oyuncu", true);
    const linkedRole = country.discord_role_id ? await interaction.guild.roles.fetch(country.discord_role_id).catch(() => null) : null;
    let roleRemoved = false;
    if (linkedRole) roleRemoved = await removeCountryRoleFromMember(interaction.guild, user.id, linkedRole.id);
    try {
      await gameService.removePlayer(interaction.guildId, interaction.user.id, country.id, user.id);
    } catch (error) {
      if (roleRemoved && linkedRole) {
        await addCountryRoleToMember(interaction.guild, user.id, linkedRole).catch(() => undefined);
      }
      throw error;
    }
    await interaction.editReply(`✅ ${user} oyuncusunun **${country.name}** ülke ataması ve Discord rolü kaldırıldı.`);
  } else if (sub === "yerleske-ekle") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const cultureGroup = interaction.options.getString("kultur", true) as CultureGroup;
    if (!CULTURE_GROUPS[cultureGroup] || cultureGroup === "UNASSIGNED") throw new GameError("Geçerli bir kültür grubu seçmelisiniz.");
    const settlement = await gameService.createSettlement({
      guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id,
      name: interaction.options.getString("ad", true), population: interaction.options.getInteger("nufus", true),
      slaves: interaction.options.getInteger("kole", true),
      totalIncome: interaction.options.getInteger("gelir", true),
      basePopulationGrowth: interaction.options.getInteger("nufus-artisi", true),
      resourceType: interaction.options.getString("hammadde", true) as ResourceType,
      cultureGroup,
      isCoastal: interaction.options.getBoolean("kiyi") ?? false
    });
    const garrison = garrisonComposition(settlement.population);
    await interaction.editReply(`✅ **${settlement.name}**, **${country.name}** ülkesine eklendi.
🏺 Kültür: **${CULTURE_GROUPS[settlement.culture_group].label}** • 📦 Hammadde: **${RESOURCES[settlement.resource_type].label}**
💰 Başlangıç geliri: **${gold(settlement.base_land_trade_income + Math.floor(settlement.population * 0.03))}** • Halk Vergisi: **${gold(Math.floor(settlement.population * 0.03))}** • Kara Ticareti: **${gold(settlement.base_land_trade_income)}**
🛡️ Sabit garnizon: **${number(garrison.lightInfantry)} Hafif Piyade, ${number(garrison.spears)} Mızraklı, ${number(garrison.archers)} Okçu**`);
  } else if (sub === "kiyi-ayarla") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const coastal = interaction.options.getBoolean("kiyi", true);
    await cityService.setCoastal({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, coastal });
    await interaction.editReply(`✅ **${settlement.name}** artık **${coastal ? "kıyı yerleşkesi" : "iç bölge yerleşkesi"}** olarak kayıtlı.`);
  } else if (sub === "kultur-ayarla") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const cultureGroup = interaction.options.getString("kultur", true) as CultureGroup;
    if (!CULTURE_GROUPS[cultureGroup] || cultureGroup === "UNASSIGNED") throw new GameError("Geçerli bir kültür grubu seçmelisiniz.");
    await gameService.setSettlementCulture({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, cultureGroup });
    await interaction.editReply(`✅ **${settlement.name}** kültürü **${CULTURE_GROUPS[cultureGroup].label}** olarak değiştirildi.`);
  } else if (sub === "asimilasyon-tamamla") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    await gameService.assimilateSettlement({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id });
    await interaction.editReply(`✅ **${settlement.name}** asimile edildi. Nüfusu artık askerî personel ve eğitim kapasitesi hesaplarına katılır; asker ve gemi üretimi açıldı.`);
  } else if (sub === "hammadde-ayarla") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const resourceType = interaction.options.getString("hammadde", true) as ResourceType;
    await gameService.setSettlementResource({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, resourceType });
    await interaction.editReply(`✅ **${settlement.name}** artık **${RESOURCES[resourceType].label}** üretiyor.`);
  } else if (sub === "tur-ilerlet") {
    const result = await gameService.advanceTurn(interaction.guildId, interaction.user.id);
    await refreshActiveBattleCards(interaction.client, interaction.guildId);
    await interaction.editReply({ embeds: [turnAnnouncement({
      kind: "ADVANCE", turn: result.turn, acquisition: result.acquisition,
      completedBuildings: result.completedBuildings, recruitmentArrivals: result.recruitmentArrivals,
      completedShips: result.completedShips, completedSiegeAssets: result.completedSiegeAssets, garrisonUpgrades: result.garrisonUpgrades,
      completedBuildingDetails: result.completedBuildingDetails,
      recruitmentArrivalDetails: result.recruitmentArrivalDetails,
      completedShipDetails: result.completedShipDetails,
      completedSiegeDetails: result.completedSiegeDetails,
      garrisonUpgradeDetails: result.garrisonUpgradeDetails,
      activatedPolicyDetails: result.activatedPolicyDetails,
      unrestDetails: result.unrestDetails,
      starvationDetails: result.starvationDetails,
      pantheonLoanDetails: result.pantheonLoanDetails
    })], files: [new AttachmentBuilder(BRAND_BANNER_PATH, { name: BRAND_BANNER_NAME })] });
  } else if (sub === "tur-durumu") {
    const phase = interaction.options.getString("durum", true) as "OPEN" | "CLOSED" | "RESOLVING";
    await gameService.setTurnPhase(interaction.guildId, interaction.user.id, phase);
    await interaction.editReply(`✅ Tur durumu **${phase}** olarak değiştirildi.`);
  } else if (sub === "yerleske-hazinesi") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const amount = interaction.options.getInteger("miktar", true);
    const result = await gameService.adjustSettlementTreasury({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, amount, reason: interaction.options.getString("neden", true) });
    await interaction.editReply(`✅ **${settlement.name}** yerel hazinesi ${amount >= 0 ? "+" : ""}${gold(amount)} değiştirildi. Yeni bakiye: **${gold(result.balance)}**.`);
  } else if (sub === "hazine") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const amount = interaction.options.getInteger("miktar", true);
    await gameService.adjustTreasury({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, amount, reason: interaction.options.getString("neden", true) });
    await interaction.editReply(`✅ **${country.name}** hazinesi ${amount >= 0 ? "+" : ""}${gold(amount)} değiştirildi.`);
  } else if (sub === "harap") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlements = await gameService.listSettlements(country.id);
    const settlementName = interaction.options.getString("yerleske", true);
    const settlement = settlements.find((s) => s.name.toLocaleLowerCase("tr-TR") === settlementName.toLocaleLowerCase("tr-TR"));
    if (!settlement) throw new GameError("Yerleşke bulunamadı.");
    const ruined = interaction.options.getBoolean("harap", true);
    await gameService.setRuin({ guildId: interaction.guildId, actorId: interaction.user.id, settlementId: settlement.id, ruined });
    await interaction.editReply(`✅ **${settlement.name}** ${ruined ? "Harap durumuna getirildi" : "normal duruma döndürüldü"}.`);
  } else if (sub === "oyunu-sifirla") {
    const confirmation = interaction.options.getString("onay", true);
    if (confirmation !== "SIFIRLA") throw new GameError("İşlem iptal edildi. Onay alanına tam olarak **SIFIRLA** yazmalısınız.");
    const result = await gameService.resetGame(interaction.guildId, interaction.user.id);
    await interaction.editReply(`🧹 Oyun sıfırlandı. **${result.deletedCountries} ülke** ve bunlara bağlı bütün oyun kayıtları silindi. Tur **0 / Kapalı** durumuna döndürüldü. Rol istatistikleri korundu.`);
  } else if (sub === "komut-log-kanali") {
    const operation = interaction.options.getString("islem", true);
    const channel = interaction.options.getChannel("kanal");
    if (operation === "set" && !channel) throw new GameError("Komut kayıt kanalını ayarlamak için bir kanal seçmelisiniz.");
    await commandLogService.setChannel(interaction.guildId, operation === "set" ? channel!.id : null);
    await interaction.editReply(operation === "set" ? `✅ Oyuncu bot komutları ${channel} kanalına aktarılacak.` : "✅ Oyuncu komut kanalı bildirimi kapatıldı; veritabanı geçmişi tutulmaya devam edecek.");
  } else if (sub === "komut-gecmisi") {
    const rows = await commandLogService.recent(interaction.guildId, interaction.options.getInteger("adet") ?? 15);
    const text = rows.length ? rows.map((row) => {
      const state = row.success === true ? "✅" : row.success === false ? "❌" : "⏳";
      const timestamp = Math.floor(new Date(row.created_at).getTime() / 1_000);
      return `${state} <@${row.discord_user_id}> • <t:${timestamp}:R>\n\`${row.command_text.replaceAll("`", "ˋ")}\``;
    }).join("\n\n") : "Henüz oyuncu komutu kaydedilmemiş.";
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🧾 Oyuncu Komut Geçmişi").setDescription(text.slice(0, 4_000))] });
  } else if (sub === "mesaj-sil") {
    const amount = interaction.options.getInteger("miktar", true);
    const channel = interaction.channel;
    if (!channel || !("bulkDelete" in channel)) throw new GameError("Bu kanalda toplu mesaj silme kullanılamıyor.");
    const deleted = await channel.bulkDelete(amount, true);
    await interaction.editReply(`🧹 **${deleted.size}/${amount}** mesaj silindi.${deleted.size < amount ? " İki haftadan eski veya silinemeyen mesajlar atlandı." : ""}`);
  } else if (sub === "rol-rapor-kanali") {
    const operation = interaction.options.getString("islem", true);
    const channel = interaction.options.getChannel("kanal");
    if (operation === "set" && !channel) throw new GameError("Rapor kanalını ayarlamak için bir kanal seçmelisiniz.");
    await roleReportService.setReportChannel(interaction.guildId, operation === "set" ? channel!.id : null);
    await interaction.editReply(operation === "set" ? `✅ Günlük rol sıralaması ${channel} kanalına gönderilecek.` : "✅ Otomatik günlük rol raporu kapatıldı.");
  } else if (sub === "rol-kanali") {
    const channel = interaction.options.getChannel("kanal", true);
    const operation = interaction.options.getString("islem", true);
    if (operation === "add") await gameService.addRoleChannel(interaction.guildId, channel.id);
    else await gameService.removeRoleChannel(interaction.guildId, channel.id);
    await interaction.editReply(`✅ ${channel} rol sayım listesine ${operation === "add" ? "eklendi" : "listeden kaldırıldı"}.`);
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (await handleWarDeclarationCommand(interaction)) return;
  if (await handleDiplomacyCommand(interaction)) return;
  if (await handleCityCommand(interaction)) return;
  if (interaction.commandName === "belge") {
    const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
    await sendDocument(interaction, country.id);
  } else if (interaction.commandName === "alim") {
    await startPurchase(interaction, "build");
  } else if (interaction.commandName === "asker-alimi") {
    await startPurchase(interaction, "unit");
  } else if (interaction.commandName === "asker-terhis") {
    const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const unitType = interaction.options.getString("birim", true) as keyof typeof UNITS;
    const quantity = interaction.options.getInteger("miktar", true);
    const result = await gameService.disbandUnits({
      guildId: interaction.guildId!, actorId: interaction.user.id, countryId: country.id,
      settlementId: settlement.id, unitType,
      status: interaction.options.getString("durum", true) as UnitStatus, quantity
    });
    await interaction.reply({ content: `✅ ${number(quantity)} **${UNITS[unitType].name}** terhis edildi. Birlikte kalan: **${number(result.remaining)}**. Terhis kalıcıdır ve ücret iadesi sağlamaz.`, ephemeral: true });
  } else if (interaction.commandName === "gemi-alimi") {
    await startPurchase(interaction, "ship");
  } else if (interaction.commandName === "gozcu-alimi") {
    const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const result = await gameService.purchaseObserver({ guildId: interaction.guildId!, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id });
    await interaction.reply({ content: `✅ **${settlement.name}** için Gözcü Birliği alındı. **${gold(result.cost)}** ödendi; **Tur ${result.dueTurn}** hazır olacak.`, ephemeral: true });
  } else if (interaction.commandName === "kusatma-uretimi") {
    const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const assetType = interaction.options.getString("alet", true) as keyof typeof SIEGE_ASSETS;
    const quantity = interaction.options.getInteger("miktar", true);
    const result = await gameService.purchaseSiegeAsset({ guildId: interaction.guildId!, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, assetType, quantity });
    await interaction.reply({ content: `✅ ${quantity} **${SIEGE_ASSETS[assetType].name}** üretime alındı. **${gold(result.cost)}** ödendi; ${result.slots} atölye slotu kullanıldı ve **Tur ${result.completionTurn}** tamamlanacak.`, ephemeral: true });
  } else if (interaction.commandName === "seferberlik") {
    const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
    await gameService.setMobilization({ guildId: interaction.guildId!, actorId: interaction.user.id, countryId: country.id, mobilization: interaction.options.getString("seviye", true) as Mobilization });
    await interaction.reply({ content: `✅ **${country.name}** artık **${MOBILIZATION_RULES[interaction.options.getString("seviye", true) as Mobilization].label}** durumunda.`, ephemeral: true });
  } else if (interaction.commandName === "ticaret") {
    await handleTrade(interaction);
  } else if (interaction.commandName === "tur") {
    await handleTurn(interaction);
  } else if (interaction.commandName === "zar") {
    const count = interaction.options.getInteger("adet", true);
    const sides = interaction.options.getInteger("yuz", true);
    const bonus = interaction.options.getInteger("bonus") ?? 0;
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((sum, roll) => sum + roll, 0) + bonus;
    await interaction.reply({ content: `🎲 **${count}d${sides}${bonus ? bonus > 0 ? `+${bonus}` : bonus : ""}** → [${rolls.join(", ")}]${bonus ? ` ${bonus > 0 ? "+" : ""}${bonus}` : ""} = **${total}**`, ephemeral: interaction.options.getBoolean("gizli") ?? false });
  } else if (interaction.commandName === "rol-siralama") {
    if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
    const period = interaction.options.getString("donem", true) as "daily" | "weekly";
    const rows = await gameService.leaderboard(interaction.guildId, period);
    const text = rows.length ? rows.map((row, index) => `**${index + 1}.** <@${row.discord_user_id}> — ${number(row.words)} kelime / ${row.messages} mesaj`).join("\n") : "Bu dönem için kayıt bulunmuyor.";
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(period === "daily" ? "📊 Günlük Rol Sıralaması" : "📊 Haftalık Rol Sıralaması").setDescription(text)] });
  } else if (interaction.commandName === "savas") {
    await handleBattleCommand(interaction);
  } else if (interaction.commandName === "hos-geldin") {
    await handleWelcomeCommand(interaction);
  } else if (interaction.commandName === "devlet-rolleri") {
    await handleCountryRoles(interaction);
  } else if (interaction.commandName === "yonetim") {
    await handleAdmin(interaction);
  }
}

async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [kind, countryId, settlementIdFromId] = interaction.customId.split("|");
  if (!countryId) throw new GameError("Etkileşim bilgisi bozuk.");
  await assertCountryAccess(interaction, countryId);
  if (kind === "trade_end") {
    await tradeService.end({ guildId: interaction.guildId!, actorId: interaction.user.id, countryId, agreementId: interaction.values[0]! });
    await interaction.update({ content: "✅ Ticaret antlaşması sona erdirildi; kaynak etkileri iki yerleşkeden de kaldırıldı.", components: [] });
  } else if (kind === "bs") {
    const settlementId = interaction.values[0]!;
    const doc = await gameService.document(countryId);
    const settlement = doc.settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new GameError("Yerleşke bulunamadı.");
    const activePolicies = settlement.policies.filter((policy) => policy.status === "ACTIVE").map((policy) => policy.policy_key);
    const occupiedSlots = settlement.buildings.filter((building) => building.level > 0 || building.status === "BUILDING").length;
    const hasPort = settlement.buildings.some((building) => building.building_type === "port" && building.status === "ACTIVE" && building.level >= 1);
    const options = buildingChoices.flatMap((building) => {
      const current = settlement.buildings.find((item) => item.building_type === building.key);
      const next = (current?.level ?? 0) + 1;
      if (next > building.maxLevel || current?.status === "BUILDING") return [];
      if (!current && occupiedSlots >= settlement.slotLimit) return [];
      if (building.key === "port" && !settlement.is_coastal) return [];
      if (building.key === "shipyard" && !hasPort) return [];
      const terms = buildingPurchaseTerms(building.key, next, settlement.effectiveResources, activePolicies);
      return [{
        label: `${building.name} Sv${next}`.slice(0, 100),
        description: `${BUILDING_CATEGORIES[building.category].label} • ${gold(terms.cost)} • ${terms.duration} tur`.slice(0, 100),
        value: building.key,
        default: false
      }];
    });
    if (!options.length) throw new GameError("Bu yerleşkede alınabilecek bina kalmadı.");
    await interaction.update({ content: `**${settlement.name}** için binayı seç:`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`bc|${countryId}|${settlementId}`).setPlaceholder("Bina seç").addOptions(options.slice(0, 25)))] });
  } else if (kind === "bc" && settlementIdFromId) {
    const buildingType = interaction.values[0]!;
    const building = BUILDINGS[buildingType];
    if (!building) throw new GameError("Bina bulunamadı.");
    await interaction.update({ content: `**${building.name}** alımını onaylıyor musun? Kesin seviye, fiyat ve süre onay anında yeniden kontrol edilir.`, components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`bx|${countryId}|${settlementIdFromId}|${buildingType}`).setLabel("Satın Al").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("cancel").setLabel("İptal").setStyle(ButtonStyle.Secondary))] });
  } else if (kind === "us") {
    const settlementId = interaction.values[0]!;
    const settlement = (await gameService.document(countryId)).settlements.find((item) => item.id === settlementId);
    if (!settlement) throw new GameError("Yerleşke bulunamadı.");
    await interaction.update({ content: `Alınacak birim türünü seç:\n🎖️ Ordu Limiti: **${number(settlement.militaryUsed)}/${number(settlement.militaryLimit)}**\n🏋️ Bu Alım Turu Eğitim Kapasitesi: **${number(settlement.trainingUsed)}/${number(settlement.trainingCapacity)}** • Kalan: **${number(settlement.trainingRemaining)}**`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`uc|${countryId}|${settlementId}`).setPlaceholder("Birim seç").addOptions(unitChoices.map(([key, unit]) => ({ label: unit.name, description: `${gold(Math.ceil(unit.price * unitCostMultiplier(key, settlement.effectiveResources)))} / 1.000`, value: key }))))] });
  } else if (kind === "uc" && settlementIdFromId) {
    const unitType = interaction.values[0]!;
    const modal = new ModalBuilder().setCustomId(`um|${countryId}|${settlementIdFromId}|${unitType}`).setTitle("Asker Alımı");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("quantity").setLabel("Asker sayısı — 1.000'in katı").setPlaceholder("Örn. 2000").setStyle(TextInputStyle.Short).setRequired(true)));
    await interaction.showModal(modal);
  } else if (kind === "ss") {
    const settlementId = interaction.values[0]!;
    const settlement = (await gameService.document(countryId)).settlements.find((item) => item.id === settlementId);
    if (!settlement) throw new GameError("Yerleşke bulunamadı.");
    const productionPoints: Record<keyof typeof SHIPS, number> = { kerkouros: 1, trireme: 2, quinquereme: 4 };
    await interaction.update({ content: "Üretilecek gemi türünü seç:", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`sc|${countryId}|${settlementId}`).setPlaceholder("Gemi seç").addOptions(shipChoices.map(([key, ship]) => ({ label: ship.name, description: `${gold(Math.ceil(ship.price * shipCostMultiplier(settlement.effectiveResources)))} • ${ship.manpower} mürettebat • ${productionPoints[key as keyof typeof SHIPS]} puan`, value: key }))))] });
  } else if (kind === "sc" && settlementIdFromId) {
    const shipType = interaction.values[0]!;
    const modal = new ModalBuilder().setCustomId(`sm|${countryId}|${settlementIdFromId}|${shipType}`).setTitle("Gemi Alımı");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("quantity").setLabel("Gemi sayısı").setPlaceholder("Örn. 2").setStyle(TextInputStyle.Short).setRequired(true)));
    await interaction.showModal(modal);
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  if (await handleWarDeclarationButton(interaction)) return;
  if (await handleDiplomacyButton(interaction)) return;
  if (await handleBattleButton(interaction)) return;
  if (await handleCityButton(interaction)) return;
  if (interaction.customId.startsWith("trade_accept|") || interaction.customId.startsWith("trade_reject|")) {
    if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
    const [action, agreementId] = interaction.customId.split("|");
    const agreement = await tradeService.get(agreementId!);
    if (!agreement) throw new GameError("Ticaret teklifi bulunamadı.");
    if (!isGameMaster(interaction)) {
      const playerCountry = await gameService.countryForUser(interaction.guildId, interaction.user.id);
      if (!playerCountry || playerCountry.id !== agreement.receiver_country_id) throw new GameError("Bu teklifi yalnızca hedef ülkenin oyuncuları yanıtlayabilir.");
    }
    await interaction.deferUpdate();
    const accepted = action === "trade_accept";
    const result = await tradeService.respond({ guildId: interaction.guildId, actorId: interaction.user.id, receiverCountryId: agreement.receiver_country_id, agreementId: agreement.id, accept: accepted });
    const embed = EmbedBuilder.from(interaction.message.embeds[0]!).setColor(accepted ? 0x2e8b57 : 0xb22222).setTitle(accepted ? "✅ Hammadde Ticareti Kabul Edildi" : "❌ Hammadde Ticareti Reddedildi").setFooter({ text: `${interaction.user.username} tarafından sonuçlandırıldı.` });
    await interaction.editReply({ content: accepted ? `✅ **${result.proposer_country_name}** ile **${result.receiver_country_name}** arasındaki kaynak paylaşımı etkinleşti.` : `❌ **${result.receiver_country_name}** ticaret teklifini reddetti.`, embeds: [embed], components: [] });
    return;
  }
  if (interaction.customId === "cancel") {
    await interaction.update({ content: "İşlem iptal edildi.", components: [] });
    return;
  }
  const [kind, countryId, settlementId, buildingType] = interaction.customId.split("|");
  if (kind !== "bx" || !countryId || !settlementId || !buildingType || !interaction.guildId) return;
  await assertCountryAccess(interaction, countryId);
  await interaction.deferUpdate();
  const result = await gameService.purchaseBuilding({ guildId: interaction.guildId, actorId: interaction.user.id, countryId, settlementId, buildingType });
  await interaction.editReply({ content: `✅ **${BUILDINGS[buildingType]!.name} Sv${result.targetLevel}** satın alındı. ${gold(result.cost)} ödendi; **Tur ${result.completionTurn}** tamamlanacak.`, components: [] });
}

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (await handleWarDeclarationModal(interaction)) return;
  if (await handleCityModal(interaction)) return;
  const [kind, countryId, settlementId, itemType] = interaction.customId.split("|");
  if (!countryId || !settlementId || !itemType || !interaction.guildId) throw new GameError("Form bilgisi bozuk.");
  await assertCountryAccess(interaction, countryId);
  const quantity = Number(interaction.fields.getTextInputValue("quantity").replaceAll(".", "").replaceAll(",", ""));
  if (!Number.isSafeInteger(quantity)) throw new GameError("Geçerli bir tam sayı girilmelidir.");
  await interaction.deferReply({ ephemeral: true });
  if (kind === "um") {
    const result = await gameService.purchaseUnits({ guildId: interaction.guildId, actorId: interaction.user.id, countryId, settlementId, unitType: itemType as keyof typeof UNITS, quantity });
    await interaction.editReply(`✅ ${number(quantity)} **${UNITS[itemType as keyof typeof UNITS].name}** için ${gold(result.cost)} ödendi.\n${result.waves.map((wave) => `• Tur ${wave.dueTurn}: ${number(wave.quantity)}`).join("\n")}`);
  } else if (kind === "sm") {
    const result = await gameService.purchaseShips({ guildId: interaction.guildId, actorId: interaction.user.id, countryId, settlementId, shipType: itemType as keyof typeof SHIPS, quantity });
    await interaction.editReply(`✅ ${quantity} **${SHIPS[itemType as keyof typeof SHIPS].name}** için ${gold(result.cost)} ödendi. **Tur ${result.completionTurn}** tamamlanacak.`);
  }
}

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (interaction.commandName !== "yonetim" || interaction.options.getFocused(true).name !== "kultur") {
    await interaction.respond([]);
    return;
  }
  const query = String(interaction.options.getFocused()).toLocaleLowerCase("tr-TR").trim();
  const choices = Object.entries(CULTURE_GROUPS)
    .filter(([key, value]) => key !== "UNASSIGNED" && (!query || key.toLocaleLowerCase("tr-TR").includes(query) || value.label.toLocaleLowerCase("tr-TR").includes(query)))
    .slice(0, 25)
    .map(([value, culture]) => ({ name: culture.label, value }));
  await interaction.respond(choices);
}

async function reportError(interaction: Interaction, error: unknown): Promise<void> {
  const message = error instanceof GameError ? error.message : "Beklenmeyen bir hata oluştu. İşlem kaydedilmedi.";
  const payload = { content: `❌ ${message}`, components: [] as ActionRowBuilder<any>[], ephemeral: true };
  if (!interaction.isRepliable()) return;
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
  if (!(error instanceof GameError)) console.error(error);
}

export function attachInteractionHandler(client: Client): void {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isAutocomplete()) await handleAutocomplete(interaction);
      else if (interaction.isChatInputCommand()) {
        let playerLog: { id: string; channelId: string | null } | null = null;
        if (interaction.guildId && !isGameMaster(interaction)) {
          try {
            playerLog = await commandLogService.record({
              guildId: interaction.guildId, userId: interaction.user.id,
              commandName: interaction.commandName, commandText: commandText(interaction)
            });
          } catch (error) {
            console.error("Oyuncu komutu kaydedilemedi", error);
          }
        }
        try {
          await handleCommand(interaction);
          if (playerLog) {
            await commandLogService.markResult(playerLog.id, true);
            await publishCommandLog(interaction, playerLog.channelId, true);
          }
        } catch (error) {
          if (playerLog) {
            await commandLogService.markResult(playerLog.id, false).catch(() => undefined);
            await publishCommandLog(interaction, playerLog.channelId, false);
          }
          throw error;
        }
      }
      else if (interaction.isStringSelectMenu()) await handleSelect(interaction);
      else if (interaction.isButton()) await handleButton(interaction);
      else if (interaction.isModalSubmit()) await handleModal(interaction);
    } catch (error) {
      await reportError(interaction, error);
    }
  });
}
