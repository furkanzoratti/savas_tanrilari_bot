import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  type ButtonInteraction, type ChatInputCommandInteraction
} from "discord.js";
import { SHIPS, UNITS } from "../domain/catalog.js";
import { gold, number } from "../domain/format.js";
import {
  PLAYER_AUTO_PURCHASE_MODES, playerAutoPurchaseService,
  type PlayerAutoPurchaseExecution, type PlayerAutoPurchaseMode, type PlayerAutoPurchasePlan
} from "../services/player-auto-purchase-service.js";
import { GameError } from "../services/game-service.js";
import { assertCountryExecutiveAccess,isGameMaster, resolveCountry } from "./auth.js";

function actionLines(plan: PlayerAutoPurchasePlan): string[] {
  const lines: string[] = [];
  for (const action of plan.shipActions) {
    lines.push(`• **${action.settlementName}:** ${number(action.quantity)} ${SHIPS[action.shipType].name} — ${gold(action.cost)}`);
  }
  for (const action of plan.unitActions) {
    lines.push(`• **${action.settlementName}:** ${number(action.quantity)} ${UNITS[action.unitType].name} — ${gold(action.cost)}`);
  }
  return lines;
}

function chunkLines(lines: string[], maximum = 950): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 1 > maximum) {
      chunks.push(current);
      current = line;
    } else current += `${current ? "\n" : ""}${line}`;
  }
  if (current) chunks.push(current);
  return chunks;
}

function previewEmbed(plan: PlayerAutoPurchasePlan, expiresAt: Date): EmbedBuilder {
  const mode = PLAYER_AUTO_PURCHASE_MODES[plan.mode];
  const allLines = actionLines(plan);
  const lines: string[] = [];
  let actionCharacters = 0;
  for (const line of allLines) {
    if (actionCharacters + line.length + 1 > 4_000) break;
    lines.push(line);
    actionCharacters += line.length + 1;
  }
  if (lines.length < allLines.length) lines.push(`• …ve **${number(allLines.length - lines.length)}** alım emri daha.`);
  const embed = new EmbedBuilder()
    .setColor(0xd6a84b)
    .setTitle(`🧾 ${mode.label} • Alım Önizlemesi`)
    .setDescription([
      `**Ülke:** ${plan.countryName}`,
      `**Alım Turu:** ${plan.acquisitionTurn}`,
      mode.description,
      "",
      "Bu aşamada **para, kapasite veya nüfus harcanmadı**. Alım yalnızca onay düğmesine basıldığında uygulanır."
    ].join("\n"))
    .addFields(
      { name: "💰 Planlanan Azami Harcama", value: `${gold(plan.plannedCost)}\nMevcut yerel hazineler: ${gold(plan.startingTreasury)}`, inline: true },
      { name: "📦 Emir Özeti", value: `${number(plan.unitActions.reduce((sum, action) => sum + action.quantity, 0))} asker\n${number(plan.shipActions.reduce((sum, action) => sum + action.quantity, 0))} gemi`, inline: true }
    )
    .setFooter({ text: `Önizleme ${expiresAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })} saatine kadar onaylanabilir.` });
  for (const [index, chunk] of chunkLines(lines).entries()) {
    embed.addFields({ name: index === 0 ? "Planlanan Alımlar" : "Planlanan Alımlar (devam)", value: chunk });
  }
  if (plan.notes.length) embed.addFields({ name: "Notlar", value: plan.notes.map((note) => `• ${note}`).join("\n").slice(0, 1024) });
  return embed;
}

function resultEmbed(result: PlayerAutoPurchaseExecution): EmbedBuilder {
  const complete = result.status === "COMPLETE";
  const title = complete ? "✅ Otomatik Alım Tamamlandı" : result.status === "PARTIAL" ? "⚠️ Otomatik Alım Kısmen Tamamlandı" : "❌ Otomatik Alım Uygulanamadı";
  const embed = new EmbedBuilder()
    .setColor(complete ? 0x3ba55d : result.status === "PARTIAL" ? 0xdaa520 : 0xed4245)
    .setTitle(title)
    .setDescription(`**${result.plan.countryName}** için ${PLAYER_AUTO_PURCHASE_MODES[result.plan.mode].label} sonucu.`)
    .addFields({ name: "Gerçek Harcama", value: gold(result.actualCost), inline: true });
  if (result.errors.length) {
    embed.addFields({ name: "Uygulanamayan Emirler", value: result.errors.map((error) => `• ${error}`).join("\n").slice(0, 1024) });
  }
  return embed;
}

export async function handlePlayerAutoPurchaseCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) throw new GameError("Bu komut yalnızca bir Discord sunucusunda kullanılabilir.");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
  await assertCountryExecutiveAccess(interaction,country.id);
  const mode = interaction.options.getString("tur", true) as PlayerAutoPurchaseMode;
  if (!(mode in PLAYER_AUTO_PURCHASE_MODES)) throw new GameError("Geçersiz otomatik alım türü.");
  const preview = await playerAutoPurchaseService.preview({
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    countryId: country.id,
    mode
  });
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`auto_buy_confirm|${preview.id}`).setLabel("Alımı Onayla").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`auto_buy_cancel|${preview.id}`).setLabel("İptal Et").setEmoji("✖️").setStyle(ButtonStyle.Secondary)
  );
  await interaction.editReply({ embeds: [previewEmbed(preview.plan, preview.expiresAt)], components: [buttons] });
}

export async function handlePlayerAutoPurchaseButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = /^auto_buy_(confirm|cancel)\|([0-9a-f-]{36})$/i.exec(interaction.customId);
  if (!match) return false;
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  await interaction.deferUpdate();
  const action = match[1]!;
  const previewId = match[2]!;
  if (action === "cancel") {
    await playerAutoPurchaseService.cancel({ guildId: interaction.guildId, actorId: interaction.user.id, previewId });
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x747f8d).setTitle("✖️ Otomatik Alım İptal Edildi").setDescription("Hiçbir para, kapasite veya nüfus harcanmadı.")],
      components: []
    });
    return true;
  }
  const result = await playerAutoPurchaseService.confirm({
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    previewId,
    gameMaster: isGameMaster(interaction)
  });
  await interaction.editReply({ embeds: [resultEmbed(result)], components: [] });
  return true;
}
