import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder,
  type ButtonInteraction, type ChatInputCommandInteraction, type StringSelectMenuInteraction
} from "discord.js";
import { EVENT_COOLDOWN_TURNS, SETTLEMENT_EVENT_TYPES, type SettlementEventType } from "../domain/events.js";
import { number } from "../domain/format.js";
import { eventService, type ActiveSettlementEvent, type SettlementEventApplication, type SettlementEventDraw, type SettlementEventRiskReport } from "../services/event-service.js";
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

function activeEventsPanel(events: ActiveSettlementEvent[], currentTurn: number, page: number, pageCount: number) {
  const description = events.map((event) => {
    const definition = SETTLEMENT_EVENT_TYPES[event.type];
    return `${definition.emoji} **${event.countryName} / ${event.settlementName}** — ${definition.label}${event.startedTurn === null ? "" : ` • Tur ${event.startedTurn}`}`;
  }).join("\n");
  const embed = new EmbedBuilder()
    .setColor(0xa74c40)
    .setTitle("🗺️ Aktif Yerleşke Olayları")
    .setDescription(description || "Aktif yerleşke olayı bulunmuyor.")
    .setFooter({ text: `Oyun Turu ${currentTurn} • Sayfa ${page}/${pageCount}` });
  if (!events.length) return { embeds: [embed], components: [] };
  const select = new StringSelectMenuBuilder()
    .setCustomId("settlement_event_resolve")
    .setPlaceholder("Sonlandırılacak olayı seç")
    .addOptions(events.map((event) => ({
      label: `${event.countryName} / ${event.settlementName}`.slice(0, 100),
      description: `${SETTLEMENT_EVENT_TYPES[event.type].label}${event.startedTurn === null ? "" : ` • Tur ${event.startedTurn}`}`.slice(0, 100),
      value: `${event.type}|${event.countryId}|${event.settlementId}`,
      emoji: SETTLEMENT_EVENT_TYPES[event.type].emoji
    })));
  return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] };
}

export async function handleSettlementEventCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== "olay" || !interaction.guildId) return false;
  const sub = interaction.options.getSubcommand();
  if (!["sec", "riskler", "uygula", "sonlandir", "aktif"].includes(sub)) return false;
  if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");

  if (sub === "aktif") {
    await interaction.deferReply({ ephemeral: true });
    const report = await eventService.active({ guildId: interaction.guildId });
    const pages: ActiveSettlementEvent[][] = [];
    for (let index = 0; index < report.events.length; index += 25) pages.push(report.events.slice(index, index + 25));
    if (!pages.length) pages.push([]);
    await interaction.editReply(activeEventsPanel(pages[0]!, report.currentTurn, 1, pages.length));
    for (let index = 1; index < pages.length; index += 1) {
      await interaction.followUp({ ...activeEventsPanel(pages[index]!, report.currentTurn, index + 1, pages.length), ephemeral: true });
    }
    return true;
  }

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

export async function handleSettlementEventSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== "settlement_event_resolve") return false;
  if (!interaction.guildId || !isGameMaster(interaction)) throw new GameError("Bu olayı yalnızca oyun yöneticisi sonlandırabilir.");
  const [typeValue, countryId, settlementId] = interaction.values[0]?.split("|") ?? [];
  if (!typeValue || !(typeValue in SETTLEMENT_EVENT_TYPES) || !countryId || !settlementId) throw new GameError("Olay seçimi geçersiz.");
  await interaction.deferUpdate();
  const result = await eventService.resolve({
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    eventType: typeValue as SettlementEventType,
    countryId,
    settlementId
  });
  await interaction.editReply({ embeds: [applicationEmbed(result, true)], components: [] });
  return true;
}
