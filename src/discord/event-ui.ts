import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  type ButtonInteraction, type ChatInputCommandInteraction
} from "discord.js";
import { EVENT_COOLDOWN_TURNS, SETTLEMENT_EVENT_TYPES, type SettlementEventType } from "../domain/events.js";
import { number } from "../domain/format.js";
import { eventService, type SettlementEventApplication, type SettlementEventDraw, type SettlementEventRiskReport } from "../services/event-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { isGameMaster } from "./auth.js";

function selectedType(interaction: ChatInputCommandInteraction): SettlementEventType {
  const type = interaction.options.getString("tur", true);
  if (!(type in SETTLEMENT_EVENT_TYPES)) throw new GameError("Geçersiz olay türü seçildi.");
  return type as SettlementEventType;
}

async function optionalCountry(interaction: ChatInputCommandInteraction): Promise<{ id: string; name: string } | null> {
  const requested = interaction.options.getString("ulke");
  if (!requested) return null;
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const country = await gameService.countryByName(interaction.guildId, requested);
  if (!country) throw new GameError("Belirtilen ülke bulunamadı.");
  return country;
}

async function findEventSettlement(countryId: string, name: string): Promise<{ id: string; name: string }> {
  const settlements = await gameService.listSettlements(countryId);
  const settlement = settlements.find((item) => item.name.toLocaleLowerCase("tr-TR") === name.trim().toLocaleLowerCase("tr-TR"));
  if (!settlement) throw new GameError("Yerleşke bulunamadı. Adı belgede göründüğü biçimde yazın.");
  return settlement;
}

function drawEmbed(draw: SettlementEventDraw): EmbedBuilder {
  const definition = SETTLEMENT_EVENT_TYPES[draw.type];
  const likelihood = ((draw.selectedWeight / draw.totalWeight) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  const factors = draw.factors
    .map((factor) => `• ${factor.label}: **${factor.adjustment > 0 ? "+" : ""}${factor.adjustment}**`)
    .join("\n");
  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle(`${definition.emoji} ${definition.label} • Ağırlıklı Yerleşke Seçimi`)
    .setDescription([
      `**Seçilen Devlet:** ${draw.countryName}`,
      `**Seçilen Yerleşke:** ${draw.settlementName}`,
      `**Oyun Turu:** ${draw.currentTurn}`,
      "",
      `🎲 **1d${number(draw.totalWeight)} → ${number(draw.roll)}**`,
      `🎯 **Yerleşke Aralığı:** ${number(draw.rangeStart)}–${number(draw.rangeEnd)}`,
      `⚖️ **Risk Ağırlığı:** ${draw.selectedWeight} • Seçilme olasılığı: %${likelihood}`
    ].join("\n"))
    .addFields(
      { name: "🗺️ Taranan Yerleşkeler", value: `Toplam: **${number(draw.candidateCount)}**\nUygun: **${number(draw.eligibleCount)}**\nHavuz dışı: **${number(draw.excludedCount)}**`, inline: true },
      { name: "📊 Risk Etkenleri", value: (factors || "Temel yerleşke ağırlığı.").slice(0, 1024), inline: true }
    )
    .setFooter({ text: "Olay henüz uygulanmadı. Onay düğmesini veya /olay uygula komutunu kullanın." });
}

function riskEmbed(report: SettlementEventRiskReport, scopeName: string | null): EmbedBuilder {
  const definition = SETTLEMENT_EVENT_TYPES[report.type];
  const eligible = report.candidates.filter((candidate) => candidate.weight > 0);
  const excluded = report.candidates.filter((candidate) => candidate.weight <= 0);
  const lines = eligible.slice(0, 18).map((candidate, index) => {
    const likelihood = report.totalWeight ? ((candidate.weight / report.totalWeight) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "0";
    return `${index + 1}. **${candidate.countryName} / ${candidate.settlementName}** — Ağırlık **${candidate.weight}** • %${likelihood}`;
  });
  if (eligible.length > 18) lines.push(`… ve **${number(eligible.length - 18)}** uygun yerleşke daha.`);

  const blocked = excluded.slice(0, 6).map((candidate) =>
    `• **${candidate.countryName} / ${candidate.settlementName}:** ${candidate.blockedReason ?? "Risk sıfırlandı."}`
  );
  if (excluded.length > 6) blocked.push(`… ve **${number(excluded.length - 6)}** havuz dışı yerleşke daha.`);

  const embed = new EmbedBuilder()
    .setColor(0x53779a)
    .setTitle(`${definition.emoji} ${definition.label} • Genel Risk Hesaplaması`)
    .setDescription([
      `**Kapsam:** ${scopeName ?? "Sunucudaki bütün devletler ve yerleşkeler"}`,
      `**Oyun Turu:** ${report.currentTurn}`,
      `**Yerleşke:** ${number(report.totalCandidates)} • **Uygun:** ${number(report.eligibleCandidates)} • **Havuz dışı:** ${number(report.excludedCandidates)}`,
      `**Toplam Zar Ağırlığı:** ${number(report.totalWeight)}`,
      "",
      ...(lines.length ? lines : ["Uygun yerleşke bulunmuyor."])
    ].join("\n").slice(0, 4000))
    .setFooter({ text: `Aynı yerleşkede aynı olay ${EVENT_COOLDOWN_TURNS} oyun turu boyunca yeniden seçilemez.` });
  if (blocked.length) embed.addFields({ name: "🛡️ Korunan / Uygun Olmayan Yerleşkeler", value: blocked.join("\n").slice(0, 1024) });
  return embed;
}

function applicationEmbed(result: SettlementEventApplication, resolved = false): EmbedBuilder {
  const definition = SETTLEMENT_EVENT_TYPES[result.type];
  return new EmbedBuilder()
    .setColor(resolved ? 0x3f7f5f : 0xa74c40)
    .setTitle(`${resolved ? "✅" : definition.emoji} ${definition.label} ${resolved ? "Sona Erdi" : "Olayı Başladı"}`)
    .setDescription([
      `**Devlet:** ${result.countryName}`,
      `**Yerleşke:** ${result.settlementName}`,
      `**Oyun Turu:** ${result.currentTurn}`,
      resolved ? "Olay yerleşke belgesinden kaldırıldı." : "Olay yerleşke belgesine işlendi. Sonuçlarını oyun yöneticisi belirler."
    ].join("\n"));
}

export async function handleSettlementEventCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== "olay" || !interaction.guildId) return false;
  const sub = interaction.options.getSubcommand();
  if (!["sec", "riskler", "uygula", "sonlandir"].includes(sub)) return false;
  if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
  const type = selectedType(interaction);
  const country = await optionalCountry(interaction);

  if (sub === "sec") {
    await interaction.deferReply({ ephemeral: true });
    const draw = await eventService.select({ guildId: interaction.guildId, actorId: interaction.user.id, eventType: type, countryId: country?.id ?? null });
    const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`settlement_event_apply|${draw.id}`)
        .setLabel("Onayla ve Olayı Uygula").setEmoji("✅").setStyle(ButtonStyle.Success)
    );
    await interaction.editReply({ embeds: [drawEmbed(draw)], components: [button] });
    return true;
  }

  if (sub === "riskler") {
    await interaction.deferReply({ ephemeral: true });
    const report = await eventService.risks({ guildId: interaction.guildId, eventType: type, countryId: country?.id ?? null });
    await interaction.editReply({ embeds: [riskEmbed(report, country?.name ?? null)] });
    return true;
  }

  if (sub === "uygula") {
    const settlementName = interaction.options.getString("yerleske");
    if (Boolean(country) !== Boolean(settlementName)) throw new GameError("Elle uygulama için ülke ve yerleşke birlikte belirtilmelidir; boş bırakılırsa son seçim uygulanır.");
    const settlement = country && settlementName ? await findEventSettlement(country.id, settlementName) : null;
    await interaction.deferReply();
    const input: { guildId: string; actorId: string; eventType: SettlementEventType; countryId?: string; settlementId?: string } = {
      guildId: interaction.guildId, actorId: interaction.user.id, eventType: type
    };
    if (country && settlement) {
      input.countryId = country.id;
      input.settlementId = settlement.id;
    }
    const result = await eventService.apply(input);
    await interaction.editReply({ embeds: [applicationEmbed(result)] });
    return true;
  }

  if (!country) throw new GameError("Olayı sonlandırmak için ülke seçilmelidir.");
  const settlement = await findEventSettlement(country.id, interaction.options.getString("yerleske", true));
  await interaction.deferReply();
  const result = await eventService.resolve({ guildId: interaction.guildId, actorId: interaction.user.id, eventType: type, countryId: country.id, settlementId: settlement.id });
  await interaction.editReply({ embeds: [applicationEmbed(result, true)] });
  return true;
}

export async function handleSettlementEventButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("settlement_event_apply|")) return false;
  if (!interaction.guildId || !isGameMaster(interaction)) throw new GameError("Bu olayı yalnızca oyun yöneticisi uygulayabilir.");
  const [, drawId] = interaction.customId.split("|");
  if (!drawId) throw new GameError("Olay seçimi geçersiz.");
  await interaction.deferReply();
  const result = await eventService.apply({ guildId: interaction.guildId, actorId: interaction.user.id, drawId });
  await interaction.editReply({ embeds: [applicationEmbed(result)] });
  if (interaction.message.editable) await interaction.message.edit({ components: [] }).catch(() => undefined);
  return true;
}
