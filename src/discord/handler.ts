import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type Client,
  type Interaction, type ModalSubmitInteraction, type StringSelectMenuInteraction
} from "discord.js";
import { BUILD_COSTS, BUILDINGS, MOBILIZATION_RULES, SHIPS, UNITS } from "../domain/catalog.js";
import { gold, number } from "../domain/format.js";
import type { Mobilization } from "../domain/types.js";
import { gameService, GameError } from "../services/game-service.js";
import { assertCountryAccess, requireGameMaster, resolveCountry } from "./auth.js";
import { buildingChoices, shipChoices, unitChoices } from "./commands.js";
import { renderDocument } from "./document.js";

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
  await interaction.editReply({ embeds: batches[0] ?? [] });
  for (const batch of batches.slice(1)) await interaction.followUp({ embeds: batch, ephemeral: true });
}

async function startPurchase(interaction: ChatInputCommandInteraction, kind: "build" | "unit" | "ship"): Promise<void> {
  const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
  const settlements = await gameService.listSettlements(country.id);
  const prefix = kind === "build" ? "bs" : kind === "unit" ? "us" : "ss";
  const label = kind === "build" ? "Bina kurulacak yerleşkeyi seç" : kind === "unit" ? "Asker eğitilecek yerleşkeyi seç" : "Geminin üretileceği yerleşkeyi seç";
  await interaction.reply({ content: `**${country.name}** — ${label}`, components: [settlementSelect(`${prefix}|${country.id}`, settlements, label)], ephemeral: true });
}

async function handleAdmin(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGameMaster(interaction);
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (sub === "ulke-olustur") {
    const country = await gameService.createCountry(interaction.guildId, interaction.user.id, interaction.options.getString("ad", true), interaction.options.getInteger("hazine", true));
    await interaction.editReply(`✅ **${country.name}** oluşturuldu.`);
  } else if (sub === "oyuncu-ata") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const user = interaction.options.getUser("oyuncu", true);
    await gameService.assignPlayer(interaction.guildId, interaction.user.id, country.id, user.id);
    await interaction.editReply(`✅ ${user} → **${country.name}** ataması yapıldı.`);
  } else if (sub === "yerleske-ekle") {
    const country = await gameService.countryByName(interaction.guildId, interaction.options.getString("ulke", true));
    if (!country) throw new GameError("Ülke bulunamadı.");
    const settlement = await gameService.createSettlement({
      guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id,
      name: interaction.options.getString("ad", true), population: interaction.options.getInteger("nufus", true),
      slaves: interaction.options.getInteger("kole", true), baseIncome: interaction.options.getInteger("gelir", true),
      basePopulationGrowth: interaction.options.getInteger("nufus-artisi", true)
    });
    await interaction.editReply(`✅ **${settlement.name}**, ${country.name} ülkesine eklendi.`);
  } else if (sub === "tur-ilerlet") {
    const result = await gameService.advanceTurn(interaction.guildId, interaction.user.id);
    await interaction.editReply(`✅ **Tur ${result.turn}** açıldı.${result.acquisition ? " Bu bir **Alım Turudur**." : ""}\n🏗️ ${result.completedBuildings} bina tamamlandı.\n⚔️ ${number(result.recruitmentArrivals)} asker katıldı.\n🚢 ${result.completedShips} gemi tamamlandı.`);
  } else if (sub === "tur-durumu") {
    const phase = interaction.options.getString("durum", true) as "OPEN" | "CLOSED" | "RESOLVING";
    await gameService.setTurnPhase(interaction.guildId, interaction.user.id, phase);
    await interaction.editReply(`✅ Tur durumu **${phase}** olarak değiştirildi.`);
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
  } else if (sub === "rol-kanali") {
    const channel = interaction.options.getChannel("kanal", true);
    const operation = interaction.options.getString("islem", true);
    if (operation === "add") await gameService.addRoleChannel(interaction.guildId, channel.id);
    else await gameService.removeRoleChannel(interaction.guildId, channel.id);
    await interaction.editReply(`✅ ${channel} rol sayım listesine ${operation === "add" ? "eklendi" : "listeden kaldırıldı"}.`);
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName === "belge") {
    const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
    await sendDocument(interaction, country.id);
  } else if (interaction.commandName === "alim") {
    await startPurchase(interaction, "build");
  } else if (interaction.commandName === "asker-alimi") {
    await startPurchase(interaction, "unit");
  } else if (interaction.commandName === "gemi-alimi") {
    await startPurchase(interaction, "ship");
  } else if (interaction.commandName === "seferberlik") {
    const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
    await gameService.setMobilization({ guildId: interaction.guildId!, actorId: interaction.user.id, countryId: country.id, mobilization: interaction.options.getString("seviye", true) as Mobilization });
    await interaction.reply({ content: `✅ **${country.name}** artık **${MOBILIZATION_RULES[interaction.options.getString("seviye", true) as Mobilization].label}** durumunda.`, ephemeral: true });
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
  } else if (interaction.commandName === "yonetim") {
    await handleAdmin(interaction);
  }
}

async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [kind, countryId, settlementIdFromId] = interaction.customId.split("|");
  if (!countryId) throw new GameError("Etkileşim bilgisi bozuk.");
  await assertCountryAccess(interaction, countryId);
  if (kind === "bs") {
    const settlementId = interaction.values[0]!;
    const doc = await gameService.document(countryId);
    const settlement = doc.settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new GameError("Yerleşke bulunamadı.");
    const options = buildingChoices.map((building) => {
      const current = settlement.buildings.find((b) => b.building_type === building.key);
      const next = (current?.level ?? 0) + 1;
      return { label: `${building.name} Sv${next}`.slice(0, 100), description: next <= building.maxLevel ? `${gold(BUILD_COSTS[next]!)} • ${next * 3} tur` : "Azami seviyede", value: building.key, default: false };
    }).filter((option) => !option.description.includes("Azami"));
    if (!options.length) throw new GameError("Bu yerleşkede alınabilecek bina kalmadı.");
    await interaction.update({ content: `**${settlement.name}** için binayı seç:`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`bc|${countryId}|${settlementId}`).setPlaceholder("Bina seç").addOptions(options.slice(0, 25)))] });
  } else if (kind === "bc" && settlementIdFromId) {
    const buildingType = interaction.values[0]!;
    const building = BUILDINGS[buildingType];
    if (!building) throw new GameError("Bina bulunamadı.");
    await interaction.update({ content: `**${building.name}** alımını onaylıyor musun? Kesin seviye, fiyat ve süre onay anında yeniden kontrol edilir.`, components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`bx|${countryId}|${settlementIdFromId}|${buildingType}`).setLabel("Satın Al").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("cancel").setLabel("İptal").setStyle(ButtonStyle.Secondary))] });
  } else if (kind === "us") {
    const settlementId = interaction.values[0]!;
    await interaction.update({ content: "Alınacak birim türünü seç:", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`uc|${countryId}|${settlementId}`).setPlaceholder("Birim seç").addOptions(unitChoices.map(([key, unit]) => ({ label: unit.name, description: `${gold(unit.price)} / 1.000`, value: key }))))] });
  } else if (kind === "uc" && settlementIdFromId) {
    const unitType = interaction.values[0]!;
    const modal = new ModalBuilder().setCustomId(`um|${countryId}|${settlementIdFromId}|${unitType}`).setTitle("Asker Alımı");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("quantity").setLabel("Asker sayısı — 500'ün katı").setPlaceholder("Örn. 2000").setStyle(TextInputStyle.Short).setRequired(true)));
    await interaction.showModal(modal);
  } else if (kind === "ss") {
    const settlementId = interaction.values[0]!;
    await interaction.update({ content: "Üretilecek gemi türünü seç:", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`sc|${countryId}|${settlementId}`).setPlaceholder("Gemi seç").addOptions(shipChoices.map(([key, ship]) => ({ label: ship.name, description: `${gold(ship.price)} / gemi`, value: key }))))] });
  } else if (kind === "sc" && settlementIdFromId) {
    const shipType = interaction.values[0]!;
    const modal = new ModalBuilder().setCustomId(`sm|${countryId}|${settlementIdFromId}|${shipType}`).setTitle("Gemi Alımı");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("quantity").setLabel("Gemi sayısı").setPlaceholder("Örn. 2").setStyle(TextInputStyle.Short).setRequired(true)));
    await interaction.showModal(modal);
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
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
      if (interaction.isChatInputCommand()) await handleCommand(interaction);
      else if (interaction.isStringSelectMenu()) await handleSelect(interaction);
      else if (interaction.isButton()) await handleButton(interaction);
      else if (interaction.isModalSubmit()) await handleModal(interaction);
    } catch (error) {
      await reportError(interaction, error);
    }
  });
}
