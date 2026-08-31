import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type Client,
  type Interaction, type ModalSubmitInteraction, type StringSelectMenuInteraction
} from "discord.js";
import { config } from "../config.js";
import { BUILDING_CATEGORIES, BUILDINGS, CITY_POLICIES, MOBILIZATION_RULES, SHIPS, SIEGE_ASSETS, UNITS } from "../domain/catalog.js";
import { gold, number } from "../domain/format.js";
import { CULTURE_GROUPS, type CultureGroup } from "../domain/cultures.js";
import { garrisonComposition } from "../domain/garrison.js";
import { currentLocalDate } from "../domain/great-power.js";
import type { Mobilization, UnitStatus } from "../domain/types.js";
import { TRADE_ROUTE_LABELS, type TradeRoute } from "../domain/trade.js";
import { MERCENARY_COMPANIES, type MercenaryCompanyKey } from "../domain/mercenaries.js";
import { NPC_AUTO_PURCHASE_DOCTRINES, type NpcAutoPurchaseDoctrine } from "../domain/npc-auto-purchase.js";
import { SPECIAL_UNITS, isSpecialUnitType, type SpecialUnitType } from "../domain/special-units.js";
import { FORMABLE_COUNTRIES, formableModifiers } from "../domain/formable-countries.js";
import { RESOURCES, shipCostMultiplier, type ResourceType } from "../domain/resources.js";
import { buildingPurchaseTerms, unitPurchaseCost, gameService, GameError } from "../services/game-service.js";
import { cityService } from "../services/city-service.js";
import { commandLogService } from "../services/command-log-service.js";
import { greatPowerService } from "../services/great-power-service.js";
import { roleReportService, type RoleReportPeriod } from "../services/role-report-service.js";
import { npcAutoPurchaseService, type NpcAutoPurchaseScope, type NpcCountryOverrideStatus } from "../services/npc-auto-purchase-service.js";
import { warDeclarationService } from "../services/war-declaration-service.js";
import { DEFAULT_WELCOME_MESSAGE, renderWelcomeMessage, welcomeService } from "../services/welcome-service.js";
import { tradeService } from "../services/trade-service.js";
import { assertCountryAccess, isGameMaster, requireGameMaster, resolveCountry } from "./auth.js";
import { buildingChoices, shipChoices, unitChoices } from "./commands.js";
import { batchDocumentEmbeds, renderDocument } from "./document.js";
import { publishGreatPowerRanking } from "./great-power-ui.js";
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
  const batches = batchDocumentEmbeds(embeds);
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

async function handleMercenaryCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGameMaster(interaction);
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const sub = interaction.options.getSubcommand();
  const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
  if (!country) throw new GameError("Ülke bulunamadı.");
  await interaction.deferReply({ ephemeral: true });

  if (sub === "kirala") {
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const companyKey = interaction.options.getString("sirket", true) as MercenaryCompanyKey;
    const result = await gameService.hireMercenary({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, companyKey });
    await interaction.editReply(`✅ **${result.contract.companyName}**, **${country.name}** adına kiralandı. **${gold(result.cost)}** ödendi. Birlik **Tur ${result.contract.arrival_turn}** başında ${settlement.name} yerleşkesine ulaşacak ve ilk **${gold(result.contract.turn_upkeep)}** bakımı aynı tur ilerletmesinde tahsil edilecek.`);
    return;
  }


  if (sub === "ucretsiz-ekle") {
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const companyKey = interaction.options.getString("sirket", true) as MercenaryCompanyKey;
    const contract = await gameService.importMercenary({
      guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id,
      settlementId: settlement.id, companyKey
    });
    await interaction.editReply(`✅ **${contract.companyName}**, daha önce ücreti alınmış sözleşme olarak **${country.name} / ${settlement.name}** kaydına ücretsiz eklendi. Kiralama bedeli kesilmedi; ilk otomatik bakım **Tur ${contract.last_upkeep_turn! + 1}** ilerletmesinde **${gold(contract.turn_upkeep)}** olarak tahsil edilecek.`);
    return;
  }

  if (sub === "listele") {
    const contracts = await gameService.listMercenaryContracts(country.id);
    const text = contracts.length ? contracts.map((contract) => {
      const status = contract.status === "PENDING" ? `Yolda • Tur ${contract.arrival_turn}` : contract.status === "UNPAID" ? "Bakımı ödenmedi • hareketsiz" : `Aktif • son Tur ${contract.end_turn}`;
      return `• **${contract.companyName}** — ${contract.settlement_name}\n  ${status} • Bakım **${gold(contract.turn_upkeep)}**`;
    }).join("\n") : "Canlı paralı asker sözleşmesi bulunmuyor.";
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xc59b45).setTitle(`🪙 ${country.name} • Paralı Askerler`).setDescription(text)] });
    return;
  }

  const companyKey = interaction.options.getString("sirket", true) as MercenaryCompanyKey;
  if (sub === "uzat") {
    const result = await gameService.extendMercenary({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, companyKey });
    await interaction.editReply(`✅ Sözleşme **Tur ${result.endTurn}** sonuna kadar uzatıldı; **${gold(result.cost)}** ödendi.`);
  } else if (sub === "bakim-ode") {
    const amount = await gameService.payMercenaryUpkeep({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, companyKey });
    await interaction.editReply(`✅ Gecikmiş **${gold(amount)}** bakım ödendi; şirket yeniden etkinleşti.`);
  } else if (sub === "feshet") {
    const compensation = await gameService.endMercenary({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, companyKey });
    await interaction.editReply(`✅ Sözleşme sona erdirildi.${compensation ? ` Erken fesih bedeli **${gold(compensation)}** ödendi.` : ""}`);
  } else if (sub === "tasi") {
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const name = await gameService.moveMercenary({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, companyKey, settlementId: settlement.id });
    await interaction.editReply(`✅ Paralı asker grubu **${name}** yerleşkesine taşındı.`);
  } else if (sub === "kayip-ekle") {
    const unitType = interaction.options.getString("kalem", true) as keyof typeof UNITS;
    const quantity = interaction.options.getInteger("miktar", true);
    const result = await gameService.addMercenaryLoss({
      guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id,
      companyKey, unitType, quantity
    });
    const companyName = MERCENARY_COMPANIES[companyKey]?.name ?? companyKey;
    await interaction.editReply(`✅ **${companyName}** kampanyasından **${number(quantity)} ${UNITS[unitType]?.name ?? unitType}** kayıp düşüldü. Kalan: **${number(result.remaining)}**.${result.destroyed ? "\n💀 Şirketin savaş personeli kalmadığı için sözleşme **Yok Edildi** durumuna geçti." : ""}`);
  } else if (sub === "mevcut-duzelt") {
    const kind = interaction.options.getString("tur", true) as "UNIT" | "SHIP" | "ASSET";
    const itemType = interaction.options.getString("kalem", true);
    const quantity = interaction.options.getInteger("miktar", true);
    await gameService.adjustMercenaryQuantity({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, companyKey, kind, itemType, quantity });
    await interaction.editReply(`✅ Şirket mevcudu güncellendi: **${itemType} = ${number(quantity)}**.`);
  }
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
      garrisonReplenishmentStartedDetails: result.garrisonReplenishmentStartedDetails,
      garrisonReplenishmentCompletedDetails: result.garrisonReplenishmentCompletedDetails,
      activatedPolicyDetails: result.activatedPolicyDetails,
      unrestDetails: result.unrestDetails,
      starvationDetails: result.starvationDetails,
      pantheonLoanDetails: result.pantheonLoanDetails,
      incomePenaltyDetails: result.incomePenaltyDetails,
      mercenaryArrivalDetails: result.mercenaryArrivalDetails,
      mercenaryUpkeepDetails: result.mercenaryUpkeepDetails,
      mercenaryUnpaidDetails: result.mercenaryUnpaidDetails,
      mercenaryEndedDetails: result.mercenaryEndedDetails
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
  let colorApplied = 0;
  let colorUnavailable = 0;
  let assigned = 0;
  let absentMembers = 0;
  const failures: string[] = [];

  for (let index = 0; index < countries.length; index += 1) {
    const country = countries[index]!;
    try {
      const result = await ensureCountryRole(interaction.guild, country, interaction.user.id, true);
      if (result.created) created += 1;
      if (result.linked) linked += 1;
      if (result.colorApplied) colorApplied += 1;
      if (!result.colorAvailable) colorUnavailable += 1;

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
    `• Harita rengi uygulanan rol: **${colorApplied}**`,
    `• Renk eşleşmesi bulunamayan rol: **${colorUnavailable}**`,
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
  } else if (sub === "ulke-yok-et") {
    if (interaction.options.getString("onay", true) !== "YOK_ET") throw new GameError("Ülkeyi yok etme işlemi iptal edildi. Onay alanına tam olarak **YOK_ET** yazmalısınız.");
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Aktif ülke bulunamadı.");
    const reason = interaction.options.getString("neden", true);
    const result = await gameService.destroyCountry({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, reason });
    let roleNote = "";
    if (interaction.guild && result.discordRoleId) {
      try {
        if (await deleteCountryRole(interaction.guild, result.discordRoleId, `Devlet yok edildi • Yönetici: ${interaction.user.id}`)) roleNote = "\n🏛️ Bağlı Discord rolü kaldırıldı.";
      } catch {
        roleNote = "\n⚠️ Bağlı Discord rolü kaldırılamadı; sunucu rollerinden elle silinmelidir.";
      }
    }
    await interaction.editReply(`🏴 **${result.name}**, Tur **${result.turn}** itibarıyla **YOK EDİLDİ** durumuna alındı. Veritabanı ve tarihsel kayıtları korundu.\n📜 ${reason}${roleNote}`);
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
    await interaction.editReply(`🏳️ **${result.settlementName}**, **${result.sourceName}** devletinden **${result.targetName}** devletine aktarıldı ve **Fethedilmiş** olarak işaretlendi.\n⛓️ Köleleştirilen eski garnizon: **${number(result.enslavedGarrison)}**\n🛡️ Yeni garnizon emri: **${number(result.newGarrisonPersonnel)} asker** • **${number(result.newGarrisonCost)} Altın**${result.newGarrisonCompletionTurn ? ` • Tur **${result.newGarrisonCompletionTurn}**` : ""}\n⚔️ İptal edilen aktif asker alımı: **${result.cancelledRecruitmentOrders}**\n🤝 Feshedilen/bekleyen ticaret: **${result.endedTrades}**`);
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
      garrisonReplenishmentStartedDetails: result.garrisonReplenishmentStartedDetails,
      garrisonReplenishmentCompletedDetails: result.garrisonReplenishmentCompletedDetails,
      activatedPolicyDetails: result.activatedPolicyDetails,
      unrestDetails: result.unrestDetails,
      starvationDetails: result.starvationDetails,
      pantheonLoanDetails: result.pantheonLoanDetails,
      incomePenaltyDetails: result.incomePenaltyDetails,
      mercenaryArrivalDetails: result.mercenaryArrivalDetails,
      mercenaryUpkeepDetails: result.mercenaryUpkeepDetails,
      mercenaryUnpaidDetails: result.mercenaryUnpaidDetails,
      mercenaryEndedDetails: result.mercenaryEndedDetails
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

async function handleSpecialUnitAccess(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGameMaster(interaction);
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
  if (!country) throw new GameError("Ülke bulunamadı.");
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });
  if (sub === "listele") {
    const unlocks = await gameService.specialUnitUnlocks(country.id);
    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setColor(0xc59b45)
      .setTitle(`🛡️ ${country.name} • Özel Birlik Erişimi`)
      .setDescription(unlocks.length
        ? unlocks.map((unitType) => `• **${SPECIAL_UNITS[unitType].name}** — ${gold(SPECIAL_UNITS[unitType].price)} / 1.000`).join("\n")
        : "Bu ülkeye açılmış özel birlik bulunmuyor.")] });
    return;
  }
  const unitType = interaction.options.getString("birlik", true) as SpecialUnitType;
  const enabled = interaction.options.getString("islem", true) === "UNLOCK";
  await gameService.setSpecialUnitUnlock({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, unitType, enabled });
  await interaction.editReply(
    `${enabled ? "✅" : "🔒"} **${SPECIAL_UNITS[unitType].name}** erişimi **${country.name}** için ${enabled ? "açıldı" : "kaldırıldı"}.` +
    (!enabled ? " Mevcut birlikler silinmedi; yalnızca yeni alım kapatıldı." : "")
  );
}
function npcPlanLine(plan: { countryName: string; doctrine: NpcAutoPurchaseDoctrine; plannedCost: number; runNumber?: number; buildingActions: Array<{ buildingName: string; targetLevel: number }>; unitActions: Array<{ quantity: number }> }): string {
  const buildings = plan.buildingActions.length
    ? plan.buildingActions.map((action) => `${action.buildingName} Sv${action.targetLevel}`).join(", ")
    : "Bina yok";
  const personnel = plan.unitActions.reduce((sum, action) => sum + action.quantity, 0);
  const attempt = plan.runNumber ? ` • Ek alım #${plan.runNumber}` : "";
  return `• **${plan.countryName}** — ${NPC_AUTO_PURCHASE_DOCTRINES[plan.doctrine].label}${attempt}\n  🏗️ ${buildings} • ⚔️ ${number(personnel)} asker • 💰 ${gold(plan.plannedCost)}`;
}

async function sendNpcPages(interaction: ChatInputCommandInteraction, title: string, lines: string[], footer: string): Promise<void> {
  const pages: string[] = [];
  let current = "";
  for (const line of lines.length ? lines : ["Uygun oyuncusuz devlet bulunamadı."]) {
    if (current && current.length + line.length + 2 > 3_700) {
      pages.push(current);
      current = "";
    }
    current += `${current ? "\n\n" : ""}${line}`;
  }
  if (current) pages.push(current);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xc59b45).setTitle(title).setDescription(pages[0]!).setFooter({ text: footer })] });
  for (let index = 1; index < pages.length; index += 1) {
    await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0xc59b45).setTitle(`${title} • ${index + 1}/${pages.length}`).setDescription(pages[index]!)], ephemeral: true });
  }
}

async function handleNpcAutoPurchase(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGameMaster(interaction);
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });
  if (sub === "ayarla") {
    const config = await npcAutoPurchaseService.saveConfig({
      guildId: interaction.guildId,
      actorId: interaction.user.id,
      enabled: interaction.options.getBoolean("aktif", true),
      doctrine: interaction.options.getString("doktrin", true) as NpcAutoPurchaseDoctrine,
      budgetPercent: interaction.options.getInteger("butce-yuzdesi", true),
      targetFillPercent: interaction.options.getInteger("hedef-doluluk", true),
      minimumReserve: interaction.options.getInteger("asgari-hazine", true),
      scope: interaction.options.getString("kapsam", true) as NpcAutoPurchaseScope
    });
    await interaction.editReply(
      `✅ NPC otomatik alım sistemi **${config.enabled ? "açıldı" : "kapatıldı"}**.\n` +
      `🧭 Doktrin: **${NPC_AUTO_PURCHASE_DOCTRINES[config.doctrine].label}**\n` +
      `💰 Bütçe: **%${config.budgetPercent}**, rezerv: **${gold(config.minimumReserve)}**\n` +
      `⚔️ Hedef askerî doluluk: **%${config.targetFillPercent}**\n` +
      `🌐 Kapsam: **${config.scope === "ALL_PLAYERLESS" ? "Tüm oyuncusuz devletler" : "Yalnızca elle dahil edilenler"}**`
    );
    return;
  }
  if (sub === "ulke-ayarla") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const status = interaction.options.getString("durum", true) as NpcCountryOverrideStatus;
    const doctrine = interaction.options.getString("doktrin") as NpcAutoPurchaseDoctrine | null;
    await npcAutoPurchaseService.setCountryOverride({ guildId: interaction.guildId, countryId: country.id, status, doctrine, actorId: interaction.user.id });
    await interaction.editReply(
      `✅ **${country.name}** için NPC alım ayarı kaydedildi: **${status === "AUTO" ? "Genel ayar" : status === "INCLUDE" ? "Kapsama dahil" : "Kapsam dışı"}**` +
      `${doctrine ? ` • Doktrin: **${NPC_AUTO_PURCHASE_DOCTRINES[doctrine].label}**` : ""}.`
    );
    return;
  }
  if (sub === "durum") {
    const config = await npcAutoPurchaseService.config(interaction.guildId);
    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setColor(config.enabled ? 0x57f287 : 0xed4245)
      .setTitle("🤖 NPC Devlet Otomatik Alım")
      .setDescription(
        `Durum: **${config.enabled ? "Aktif" : "Kapalı"}**\n` +
        `Doktrin: **${NPC_AUTO_PURCHASE_DOCTRINES[config.doctrine].label}**\n` +
        `${NPC_AUTO_PURCHASE_DOCTRINES[config.doctrine].description}\n\n` +
        `Bütçe sınırı: **%${config.budgetPercent}**\nAsgari toplam rezerv: **${gold(config.minimumReserve)}**\n` +
        `Hedef askerî doluluk: **%${config.targetFillPercent}**\n` +
        `Kapsam: **${config.scope === "ALL_PLAYERLESS" ? "Tüm oyuncusuz devletler" : "Yalnızca elle dahil edilenler"}**\n\n` +
        "Alımlar tur ilerlerken kendiliğinden yapılmaz. `calistir` veya `ek-alim` aynı Alım Turunda tekrar kullanıldığında kalan hazine ve eğitim kapasitesiyle devam eder."
      )] });
    return;
  }
  if (sub === "onizle") {
    const plans = await npcAutoPurchaseService.preview(interaction.guildId);
    await sendNpcPages(interaction, "🔎 NPC Alım Önizlemesi", plans.map(npcPlanLine), `${plans.length} oyuncusuz devlet • Hiçbir ödeme veya emir oluşturulmadı`);
    return;
  }
  const results = await npcAutoPurchaseService.execute(interaction.guildId, interaction.user.id);
  const lines = results.map((result) => {
    const icon = result.status === "COMPLETE" ? "✅" : result.status === "PARTIAL" ? "⚠️" : "❌";
    const base = npcPlanLine(result).replace(/^• /, `${icon} `).replace(gold(result.plannedCost), gold(result.actualCost));
    return result.errors.length ? `${base}\n  _${result.errors.slice(0, 2).join(" | ")}_` : base;
  });
  const completed = results.filter((result) => result.status === "COMPLETE").length;
  const partial = results.filter((result) => result.status === "PARTIAL").length;
  const failed = results.filter((result) => result.status === "FAILED").length;
  const spent = results.reduce((sum, result) => sum + result.actualCost, 0);
  await sendNpcPages(interaction, "🤖 NPC Alımları Uygulandı", lines, `${completed} tamamlandı • ${partial} kısmi • ${failed} başarısız • Toplam ${gold(spent)}`);
}

async function handleGreatPowerCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGameMaster(interaction);
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (subcommand === "kanal") {
    const operation = interaction.options.getString("islem", true);
    const channel = interaction.options.getChannel("kanal");
    if (operation === "set" && !channel) throw new GameError("Büyük Güçler kanalını ayarlamak için bir metin kanalı seçmelisiniz.");
    await greatPowerService.setChannel(interaction.guildId, operation === "set" ? channel!.id : null);
    await interaction.editReply(operation === "set"
      ? `✅ Büyük Güçler sıralaması her gün saat **17.00**'da ${channel} kanalında yayımlanacak.`
      : "✅ Otomatik Büyük Güçler paylaşımı kapatıldı.");
    return;
  }

  const channelId = await greatPowerService.channel(interaction.guildId);
  if (!channelId) throw new GameError("Önce /buyuk-gucler kanal komutuyla paylaşım kanalını ayarlamalısınız.");
  const date = currentLocalDate(new Date(), config.TURN_TIMEZONE);
  const snapshot = await publishGreatPowerRanking(interaction.client, interaction.guildId, channelId, date);
  await interaction.editReply(`✅ Güncel **${snapshot.rows.length} devletlik Büyük Güçler sıralaması** <#${channelId}> kanalında paylaşıldı.`);
}
async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (await handleWarDeclarationCommand(interaction)) return;
  if (await handleDiplomacyCommand(interaction)) return;
  if (await handleCityCommand(interaction)) return;
  if (interaction.commandName === "buyuk-gucler") {
    await handleGreatPowerCommand(interaction);
  } else if (interaction.commandName === "parali-bakim-topla") {
    requireGameMaster(interaction);
    if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
    await interaction.deferReply({ ephemeral: true });
    const result = await gameService.collectAllMercenaryUpkeep({ guildId: interaction.guildId, actorId: interaction.user.id });
    const lines = [
      ...result.paid.map((item) => `✅ **${item.countryName}** • ${item.companyName} — ${gold(item.amount)} ödendi`),
      ...result.unpaid.map((item) => `❌ **${item.countryName}** • ${item.companyName} — ${gold(item.amount)} için hazine yetersiz`)
    ];
    if (!lines.length) lines.push("ℹ️ Bu tur için vadesi gelen veya ödenmemiş paralı asker bakımı bulunmuyor. Daha önce ödenen bakımlar yeniden kesilmedi.");
    const paidTotal = result.paid.reduce((sum, item) => sum + item.amount, 0);
    await sendNpcPages(
      interaction,
      `💰 Paralı Asker Bakımları • Tur ${result.turn}`,
      lines,
      `${result.paid.length} sözleşme ödendi • ${gold(paidTotal)} kesildi • ${result.unpaid.length} ödenemedi`
    );
  } else if (interaction.commandName === "parali-asker") {
    await handleMercenaryCommand(interaction);
  } else if (interaction.commandName === "ulke-formla") {
    requireGameMaster(interaction);
    if (!interaction.guildId || !interaction.guild) throw new GameError("Sunucu bulunamadı.");
    await interaction.deferReply({ ephemeral: true });
    const result = await gameService.formCountry({ guildId: interaction.guildId, actorId: interaction.user.id, currentCountryName: interaction.options.getString("mevcut-ulke", true), formableKeyInput: interaction.options.getString("formlanan-ulke", true) });
    const country = await gameService.countryByName(interaction.guildId, result.formedName);
    let roleText = "Bağlı devlet rolü bulunmadığı için yalnız belge adı güncellendi.";
    if (country) {
      try {
        const ensured = await ensureCountryRole(interaction.guild, country, interaction.user.id);
        roleText = `${ensured.role} rolü yeni devlet adıyla eşitlendi.`;
      } catch (error) {
        roleText = `Devlet ve belge güncellendi; Discord rolü güncellenemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`;
      }
    }
    await interaction.editReply(`✅ **${result.previousName}**, **${result.formedName}** olarak formlandı.\n${roleText}\n\n✨ **Etkin ülke bonusları**\n${result.buffs.map((buff) => `• ${buff}`).join("\n")}`);
  } else if (interaction.commandName === "belge") {
    const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
    await sendDocument(interaction, country.id);
  } else if (interaction.commandName === "hazine-tasi") {
    const country = await resolveCountry(interaction);
    const result = await gameService.transferSettlementTreasury({
      guildId: interaction.guildId!,
      actorId: interaction.user.id,
      countryId: country.id,
      sourceSettlementId: interaction.options.getString("kaynak-sehir", true),
      targetSettlementId: interaction.options.getString("hedef-sehir", true),
      amount: interaction.options.getInteger("miktar", true)
    });
    await interaction.reply({
      content:
        "✅ **" + gold(result.amount) + "**, **" + result.sourceName + "** şehrinden **" + result.targetName + "** şehrine taşındı.\n" +
        "Kaynak hazine: **" + gold(result.sourceBalance) + "** • Hedef hazine: **" + gold(result.targetBalance) + "**",
      ephemeral: true
    });
  } else if (interaction.commandName === "alim-iptal") {
    requireGameMaster(interaction);
    if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
    await interaction.deferReply({ ephemeral: true });
    const result = await gameService.cancelPendingPurchase({
      guildId: interaction.guildId,
      actorId: interaction.user.id,
      purchaseKey: interaction.options.getString("siparis", true)
    });
    await interaction.editReply(
      `✅ **${result.countryName} / ${result.settlementName}** — ${number(result.quantity)} **${result.itemName}** alımı iptal edildi.\n` +
      `💰 **${gold(result.refundableAmount)}** yerel hazineye iade edildi. Devlet hazinesi: **${gold(result.treasury)}**.\n` +
      `_${result.progressNote}_`
    );
  } else if (interaction.commandName === "gelir-cezasi") {
    requireGameMaster(interaction);
    if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
    const sub = interaction.options.getSubcommand();
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    await interaction.deferReply({ ephemeral: true });
    if (sub === "uygula") {
      const percent = interaction.options.getInteger("yuzde", true);
      const acquisitionTurns = interaction.options.getInteger("alim-turu", true);
      const result = await gameService.setSettlementIncomePenalty({
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        countryId: country.id,
        settlementId: settlement.id,
        percent,
        acquisitionTurns,
        reason: interaction.options.getString("neden", true)
      });
      await interaction.editReply(
        `✅ **${country.name} / ${settlement.name}** için **%${percent} gelir cezası**, **${acquisitionTurns} Alım Turu** süreyle ayarlandı.\n` +
        `İlk kesinti **Tur ${result.nextAcquisitionTurn}** gelirinde uygulanacak. Süre dolunca gelir otomatik olarak normale dönecek.`
      );
    } else {
      const removed = await gameService.clearSettlementIncomePenalty({
        guildId: interaction.guildId,
        actorId: interaction.user.id,
        countryId: country.id,
        settlementId: settlement.id
      });
      await interaction.editReply(
        `✅ **${country.name} / ${settlement.name}** üzerindeki **%${removed.percent} gelir cezası** kaldırıldı. Kalan süre **${removed.remainingAcquisitionTurns} Alım Turu** idi.`
      );
    }
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
    const period = interaction.options.getString("donem", true) as RoleReportPeriod;
    const rows = await roleReportService.currentLeaderboard(interaction.guildId, period, config.TURN_TIMEZONE);
    const text = rows.length ? rows.map((row, index) => period === "monthly"
      ? `**${index + 1}.** <@${row.discord_user_id}> — ${number(row.messages)} rol`
      : `**${index + 1}.** <@${row.discord_user_id}> — ${number(row.words)} kelime / ${row.messages} rol`).join("\n") : "Bu takvim döneminde kayıt bulunmuyor.";
    const titles: Record<RoleReportPeriod, string> = { daily: "📊 Günlük Rol Sıralaması", weekly: "📚 Haftalık Rol Sıralaması", monthly: "🏛️ Aylık Rol Sıralaması" };
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(titles[period]).setDescription(text)] });
  } else if (interaction.commandName === "savas") {
    await handleBattleCommand(interaction);
  } else if (interaction.commandName === "hos-geldin") {
    await handleWelcomeCommand(interaction);
  } else if (interaction.commandName === "devlet-rolleri") {
    await handleCountryRoles(interaction);
  } else if (interaction.commandName === "ozel-birlik-yetkisi") {
    await handleSpecialUnitAccess(interaction);
  } else if (interaction.commandName === "npc-devlet-oto-alim") {
    await handleNpcAutoPurchase(interaction);
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
      const terms = buildingPurchaseTerms(building.key, next, settlement.effectiveResources, activePolicies, doc.country.active_formable_key);
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
    const document = await gameService.document(countryId);
    const settlement = document.settlements.find((item) => item.id === settlementId);
    if (!settlement) throw new GameError("Yerleşke bulunamadı.");
    const availableUnits = unitChoices.filter(([key]) => !isSpecialUnitType(key) || (document.specialUnitUnlocks ?? []).includes(key));
    await interaction.update({ content: `Alınacak birim türünü seç:\n🎖️ Ordu Limiti: **${number(settlement.militaryUsed)}/${number(settlement.militaryLimit)}**\n🏋️ Bu Alım Turu Eğitim Kapasitesi: **${number(settlement.trainingUsed)}/${number(settlement.trainingCapacity)}** • Kalan: **${number(settlement.trainingRemaining)}**`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`uc|${countryId}|${settlementId}`).setPlaceholder("Birim seç").addOptions(availableUnits.map(([key, unit]) => ({ label: unit.name, description: `${gold(unitPurchaseCost(key as keyof typeof UNITS, 1_000, settlement.effectiveResources, settlement.policies.filter((policy) => policy.status === "ACTIVE").map((policy) => policy.policy_key), document.country.active_formable_key))} / 1.000${isSpecialUnitType(key) ? " • Özel Birlik" : ""}`, value: key }))))] });
  } else if (kind === "uc" && settlementIdFromId) {
    const unitType = interaction.values[0]!;
    const modal = new ModalBuilder().setCustomId(`um|${countryId}|${settlementIdFromId}|${unitType}`).setTitle("Asker Alımı");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("quantity").setLabel("Asker sayısı — 1.000'in katı").setPlaceholder("Örn. 2000").setStyle(TextInputStyle.Short).setRequired(true)));
    await interaction.showModal(modal);
  } else if (kind === "ss") {
    const settlementId = interaction.values[0]!;
    const document = await gameService.document(countryId);
    const settlement = document.settlements.find((item) => item.id === settlementId);
    if (!settlement) throw new GameError("Yerleşke bulunamadı.");
    const productionPoints: Record<keyof typeof SHIPS, number> = { kerkouros: 1, trireme: 2, quinquereme: 4 };
    await interaction.update({ content: "Üretilecek gemi türünü seç:", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`sc|${countryId}|${settlementId}`).setPlaceholder("Gemi seç").addOptions(shipChoices.map(([key, ship]) => ({ label: ship.name, description: `${gold(Math.ceil(ship.price * Math.max(0.5, shipCostMultiplier(settlement.effectiveResources) - (formableModifiers(document.country.active_formable_key).shipDiscount ?? 0))))} • ${ship.manpower} mürettebat • ${productionPoints[key as keyof typeof SHIPS]} puan`, value: key }))))] });
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
  const focused = interaction.options.getFocused(true);
  if (interaction.commandName === "hazine-tasi" && ["kaynak-sehir", "hedef-sehir"].includes(focused.name)) {
    if (!interaction.guildId) { await interaction.respond([]); return; }
    const country = await gameService.countryForUser(interaction.guildId, interaction.user.id);
    if (!country) { await interaction.respond([]); return; }
    const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
    const sourceId = focused.name === "hedef-sehir" ? interaction.options.getString("kaynak-sehir") : null;
    const settlements = await gameService.listSettlements(country.id);
    await interaction.respond(settlements
      .filter((settlement) => settlement.id !== sourceId)
      .filter((settlement) => !query || settlement.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0, 25)
      .map((settlement) => ({
        name: (settlement.name + " • Hazine " + gold(Number(settlement.local_treasury))).slice(0, 100),
        value: settlement.id
      })));
    return;
  }
  if (interaction.commandName === "ulke-formla" && focused.name === "formlanan-ulke") {
    if (!interaction.guildId || !isGameMaster(interaction)) { await interaction.respond([]); return; }
    const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
    await interaction.respond(Object.entries(FORMABLE_COUNTRIES)
      .filter(([key, country]) => !query || key.toLocaleLowerCase("tr-TR").includes(query) || country.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0, 25)
      .map(([value, country]) => ({ name: `${country.emoji} ${country.name}`, value })));
    return;
  }
  if (interaction.commandName === "savas-sonlandir" && focused.name === "kazanan") {
    if (!interaction.guildId || !isGameMaster(interaction)) { await interaction.respond([]); return; }
    const warId = interaction.options.getString("savas");
    const war = (await warDeclarationService.activeWars(interaction.guildId)).find((item) => item.id === warId);
    if (!war) { await interaction.respond([]); return; }
    const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
    const choices = [
      { name: `${war.attacker_country_name} kazandı`, value: war.attacker_country_id },
      { name: `${war.defender_country_name} kazandı`, value: war.defender_country_id },
      { name: "Beyaz Barış — kazanan yok", value: "WHITE_PEACE" }
    ];
    await interaction.respond(choices.filter((choice) => !query || choice.name.toLocaleLowerCase("tr-TR").includes(query)));
    return;
  }
  if (interaction.commandName === "savas-sonlandir" && focused.name === "savas") {
    if (!interaction.guildId || !isGameMaster(interaction)) { await interaction.respond([]); return; }
    const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
    const wars = await warDeclarationService.activeWars(interaction.guildId);
    await interaction.respond(wars
      .filter((war) => !query || `${war.attacker_country_name} ${war.defender_country_name}`.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0, 25)
      .map((war) => ({ name: `${war.attacker_country_name} — ${war.defender_country_name} • Tur ${war.started_turn}`.slice(0, 100), value: war.id })));
    return;
  }
  if ((interaction.commandName === "parali-asker" || interaction.commandName === "savas") && focused.name === "sirket") {
    if (!isGameMaster(interaction)) { await interaction.respond([]); return; }
    const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
    let companies = Object.entries(MERCENARY_COMPANIES) as Array<[MercenaryCompanyKey, (typeof MERCENARY_COMPANIES)[MercenaryCompanyKey]]>;
    let subcommand = "";
    try { subcommand = interaction.options.getSubcommand(false) ?? ""; } catch { subcommand = ""; }
    if (interaction.commandName === "parali-asker" && ["kirala", "ucretsiz-ekle"].includes(subcommand) && interaction.guildId) {
      const available = new Set(await gameService.availableMercenaryCompanyKeys(interaction.guildId));
      companies = companies.filter(([companyKey]) => available.has(companyKey));
    }
    await interaction.respond(companies
      .filter(([key, company]) => !query || key.includes(query) || company.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0, 25).map(([value, company]) => ({ name: `${company.name} • ${gold(company.hireCost)} / bakım ${gold(company.turnUpkeep)}`.slice(0, 100), value })));
    return;
  }
  if (interaction.commandName === "parali-asker" && focused.name === "kalem") {
    if (!isGameMaster(interaction)) { await interaction.respond([]); return; }
    let kind = "UNIT";
    try { kind = interaction.options.getString("tur") ?? "UNIT"; } catch { kind = "UNIT"; }
    const source = kind === "SHIP" ? SHIPS : kind === "ASSET" ? SIEGE_ASSETS : UNITS;
    const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
    await interaction.respond(Object.entries(source).filter(([key, value]) => (kind !== "UNIT" || !isSpecialUnitType(key)) && (!query || key.includes(query) || value.name.toLocaleLowerCase("tr-TR").includes(query))).slice(0, 25).map(([value, item]) => ({ name: item.name, value })));
    return;
  }
  if (interaction.commandName === "alim-iptal" && focused.name === "siparis") {
    if (!interaction.guildId || !isGameMaster(interaction)) {
      await interaction.respond([]);
      return;
    }
    const purchases = await gameService.listPendingPurchases(interaction.guildId, String(focused.value));
    const icons = { UNIT: "⚔️", SHIP: "⚓", SIEGE: "🏗️", BUILDING: "🏛️" } as const;
    await interaction.respond(purchases.map((purchase) => ({
      name: `${icons[purchase.kind]} ${purchase.countryName} / ${purchase.settlementName} • ${number(purchase.quantity)} ${purchase.itemName} • iade ${gold(purchase.refundableAmount)}`.slice(0, 100),
      value: purchase.key
    })));
    return;
  }
  if (interaction.commandName !== "yonetim" || focused.name !== "kultur") {
    await interaction.respond([]);
    return;
  }
  const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
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
