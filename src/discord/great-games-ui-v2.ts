import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction, type StringSelectMenuInteraction
} from "discord.js";
import {
  CARAVAN_ROUTES, CHARIOT_TACTICS, GREAT_GAME_TYPES,
  parseKingsDecision, type CaravanRoute, type ChariotTactic, type GreatGameType, type KingsDecision
} from "../domain/great-games.js";
import { gold } from "../domain/format.js";
import { greatGamesService, type GreatGamesDashboard, type GreatGamesEntryRow } from "../services/great-games-service.js";
import { greatGamesFlowService } from "../services/great-games-flow-service.js";
import { greatGamesAuctionService } from "../services/great-games-auction-service.js";
import { greatGamesBetService } from "../services/great-games-bet-service.js";
import { greatGamesWalletService } from "../services/great-games-wallet-service.js";
import { GameError, gameService } from "../services/game-service.js";
import { isGameMaster } from "./auth.js";

const CARAVAN_ROLE_LABELS: Record<string, string> = {
  MERCHANT: "Tüccar",
  GUARD: "Muhafız",
  GUIDE: "Rehber",
  FINANCIER: "Finansör"
};

function gameId(value: string): GreatGameType {

  if (!(value in GREAT_GAME_TYPES)) throw new GameError("Büyük Oyun türü geçersiz.");
  return value as GreatGameType;
}

async function ownCountry(guildId: string | null, userId: string) {
  if (!guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
  const country = await gameService.countryForUser(guildId, userId);
  if (!country) throw new GameError("Discord hesabına atanmış etkin bir devlet bulunamadı.");
  return country;
}

function gameRules(type: GreatGameType): string {
  if (type === "AUCTION") return "Kapalı teklifler 500 Altından başlar; artış en az 250, tek teklif en fazla 5.000 Altındır. Bir devlet en fazla iki ödül kazanabilir.";
  if (type === "CHARIOT") return "Katılım 1.000 Altın. Form yayınlandıktan sonra bahisler açılır; yönetici yarışı başlatınca üç etap oynanır. Katılım havuzu %65/%35 paylaşılır.";
  if (type === "CARAVAN") return "Seçilen devletler 2–3 kişilik kervanlara ayrılır. Her devletten oyun başlarken 1.000 Altın alınır. Üç aşamada kervanların sırası puanlarına göre canlı değişir.";
  if (type === "KINGS_BET") return "Katılım 1.000 Altın. Üç ikilemde İşbirliği veya İhanet ve rakibin kararı için tahmin gizlice seçilir.";
  return "Her masa üç devletten oluşur. Anlaşma yalnız bir ana ve en fazla bir ikincil kazanan çıkarabilir. Katılım 500 Altındır.";
}

function chosenEntries(data: GreatGamesDashboard, type: GreatGameType): GreatGamesEntryRow[] {
  return data.entries.filter((entry) => entry.game_type === type && ["SELECTED", "ACTIVE", "FINISHED"].includes(entry.status));
}

function statusLabel(data: GreatGamesDashboard, type: GreatGameType, entries: GreatGamesEntryRow[]): string {
  if (data.season?.current_game === type) {
    if (data.season.status === "PUBLISHED") return "Yayınlandı • Bahis/ön hazırlık açık";
    if (data.season.status === "ACTIVE") return `Devam ediyor • Aşama ${data.season.current_round}`;
    if (data.season.status === "OPEN" && entries.some((entry) => entry.status === "SELECTED")) return "Katılımcılar seçildi • Yayın bekliyor";
  }
  if (entries.some((entry) => entry.status === "FINISHED")) return "Tamamlandı";
  return "Kayıtlar açık";
}

function clip(value: string, maximum = 1_020): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function kingsDecisionLabel(value: KingsDecision): string {
  return value === "COOPERATE" ? "İşbirliği" : "İhanet";
}

function caravanFields(entries: GreatGamesEntryRow[], round: number) {
  const teams = new Map<string, GreatGamesEntryRow[]>();
  for (const entry of entries) {
    const name = String(entry.metadata.teamName ?? "Kervansız");
    teams.set(name, [...(teams.get(name) ?? []), entry]);
  }
  const ranked = [...teams.entries()].map(([name, members]) => ({
    name,
    members,
    score: Number(members[0]?.score ?? 0)
  })).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "tr"));
  const medals = ["🥇", "🥈", "🥉"];
  return ranked.slice(0, 24).map((team, index) => {
    const progress = Math.max(0, Math.min(10, round * 2 + team.score));
    const track = `Başlangıç ${"━".repeat(progress)}🐫${"·".repeat(10 - progress)} 🏁`;
    const members = team.members.map((member) => `${member.country_name} (${CARAVAN_ROLE_LABELS[String(member.metadata.role)] ?? "Görev bekliyor"})`).join(" • ");
    return {
      name: `${medals[index] ?? `${index + 1}.`} ${team.name} — ${team.score} puan`,
      value: clip(`${track}\n${members}`),
      inline: false
    };
  });
}

async function adminDashboardPayload(guildId: string) {
  const data = await greatGamesService.dashboard(guildId);
  const status = data.season
    ? `${data.season.status}${data.season.current_game ? ` • ${GREAT_GAME_TYPES[data.season.current_game].label}` : ""}`
    : "Henüz açılmadı";
  const embed = new EmbedBuilder().setColor(0xd6ad3c).setTitle("🏛️ 15. Tur Büyük Oyunları • Yönetici Paneli")
    .setDescription(`**Oyun turu:** ${data.currentTurn} • **Durum:** ${status}\nOyuncular bu paneli göremez. Kayıtlı devletleri oyun bazında rastgele veya elle seçebilir, ardından herkese açık oyun formunu yayınlayabilirsin.`);
  for (const type of Object.keys(GREAT_GAME_TYPES) as GreatGameType[]) {
    const selected = chosenEntries(data, type);
    embed.addFields({
      name: `${GREAT_GAME_TYPES[type].emoji} ${GREAT_GAME_TYPES[type].label}`,
      value: `Aday kayıt: **${data.counts[type]}** • Seçilen: **${selected.filter((entry) => entry.status !== "FINISHED").length}** • ${statusLabel(data, type, selected)}`
    });
  }
  const games = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(Object.keys(GREAT_GAME_TYPES) as GreatGameType[]).map((type) => new ButtonBuilder()
      .setCustomId(`gg2|admin-view|${type}`).setLabel(GREAT_GAME_TYPES[type].label.slice(0, 30))
      .setEmoji(GREAT_GAME_TYPES[type].emoji).setStyle(ButtonStyle.Secondary))
  );
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("gg2|admin-home").setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [games, controls], ephemeral: true as const };
}

async function adminGamePayload(guildId: string, type: GreatGameType) {
  const data = await greatGamesService.dashboard(guildId);
  const entries = chosenEntries(data, type).filter((entry) => entry.status !== "FINISHED");
  const selectedNames = entries.length ? entries.map((entry, index) => `${index + 1}. ${entry.country_name}`).join("\n") : "Henüz katılımcı seçilmedi.";
  const embed = new EmbedBuilder().setColor(0xb78b32).setTitle(`${GREAT_GAME_TYPES[type].emoji} ${GREAT_GAME_TYPES[type].label} • Yönetim`)
    .setDescription(`${gameRules(type)}\n\n**Durum:** ${statusLabel(data, type, entries)}\n**Aday kayıt:** ${data.counts[type]}\n\n**Seçilen devletler**\n${clip(selectedNames, 3_800)}`);
  if (type === "CARAVAN" && entries.length) embed.addFields(...caravanFields(entries, 0));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("gg2|admin-home").setLabel("Ana Panel").setStyle(ButtonStyle.Secondary)
  );
  if (data.season?.status === "OPEN") {
    row.addComponents(new ButtonBuilder().setCustomId(`gg2|choose|${type}`).setLabel("Katılımcıları Seç").setEmoji("🎯").setStyle(ButtonStyle.Primary));
    if (data.season.current_game === type && entries.length) row.addComponents(
      new ButtonBuilder().setCustomId(`gg2|publish|${type}`).setLabel("Oyunu Yayınla").setEmoji("📣").setStyle(ButtonStyle.Success)
    );
  }
  if (data.season?.status === "PUBLISHED" && data.season.current_game === type) row.addComponents(
    new ButtonBuilder().setCustomId(`gg2|publish|${type}`).setLabel("Formu Yeniden Yayınla").setEmoji("📣").setStyle(ButtonStyle.Success)
  );
  return { embeds: [embed], components: [row], ephemeral: true as const };
}

async function publicGamePayload(guildId: string, type: GreatGameType, content?: string) {
  const data = await greatGamesService.dashboard(guildId);
  const entries = chosenEntries(data, type);
  const activeForType = data.season?.current_game === type;
  const round = activeForType ? data.season?.current_round ?? 0 : 3;
  const embed = new EmbedBuilder().setColor(type === "CARAVAN" ? 0xc88a3d : 0xd6ad3c)
    .setTitle(`${GREAT_GAME_TYPES[type].emoji} ${GREAT_GAME_TYPES[type].label}`)
    .setDescription(`${gameRules(type)}\n\n**Durum:** ${statusLabel(data, type, entries)} • **Katılımcı:** ${entries.length}`);

  if (type === "CARAVAN") {
    embed.addFields(...caravanFields(entries, round));
    embed.setFooter({ text: "Her aşama çözüldüğünde kervanların sırası ve pistteki konumu güncellenir." });
  } else {
    const ranked = [...entries].sort((left, right) => Number(right.score) - Number(left.score) || left.country_name.localeCompare(right.country_name, "tr"));
    embed.addFields({ name: "Katılan Devletler", value: clip(ranked.map((entry, index) => `${index + 1}. **${entry.country_name}**${Number(entry.score) ? ` — ${entry.score} puan` : ""}`).join("\n") || "Katılımcı bulunmuyor.") });
  }

  if ((type === "KINGS_BET" || type === "CHARIOT") && data.season?.status === "ACTIVE" && activeForType) {
    const readiness = await greatGamesFlowService.roundReadiness(guildId, type);
    if (type === "CHARIOT") {
      const racers = readiness.rooms.flatMap((room) => room.countries);
      const submitted = racers.filter((country) => country.submitted).length;
      const lines = racers.map((country) => `${country.submitted ? "✅" : "⏳"} **${country.countryName}** — ${country.submitted ? "Taktiğini tamamladı" : "Taktik bekleniyor"}`);
      embed.addFields({
        name: `🔒 Gizli Taktikler • Etap ${readiness.round}`,
        value: clip(`${lines.join("\n") || "Henüz yarışçı bulunmuyor."}\n\n**Hazır:** ${submitted}/${racers.length}${submitted === racers.length && racers.length ? " • Yönetici etabı çözebilir." : ""}`)
      });
    } else {
      const lines = readiness.rooms.map((room, index) => {
        const countries = room.countries.map((country) => `${country.submitted ? "✅" : "⏳"} ${country.countryName}`).join(" • ");
        const submitted = room.countries.filter((country) => country.submitted).length;
        const complete = room.countries.length === 2 && submitted === 2;
        return `**Eşleşme ${index + 1}:** ${countries}\n↳ ${complete ? "İki taraf da seçimini tamamladı; çözüm bekleniyor." : `${submitted}/2 seçim tamamlandı.`}`;
      });
      embed.addFields({
        name: `🔒 Gizli Seçimler • Aşama ${readiness.round}`,
        value: clip(lines.join("\n") || "Henüz eşleşme bulunmuyor.")
      });
    }
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gg2|public-refresh|${type}`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Secondary)
  );
  if (data.season?.status === "PUBLISHED" && activeForType) {
    if (type === "CHARIOT") buttons.addComponents(new ButtonBuilder().setCustomId("gg2|bet|CHARIOT").setLabel("Bahis Yap").setEmoji("💰").setStyle(ButtonStyle.Primary));
    buttons.addComponents(new ButtonBuilder().setCustomId(`gg2|start|${type}`).setLabel("Oyunu Başlat").setEmoji("▶️").setStyle(ButtonStyle.Success));
  }
  if (data.season?.status === "ACTIVE" && activeForType) {
    if (type !== "AUCTION") buttons.addComponents(new ButtonBuilder().setCustomId(`gg2|action|${type}`).setLabel("Gizli Hamle Ver").setStyle(ButtonStyle.Primary));
    buttons.addComponents(new ButtonBuilder().setCustomId(`gg2|resolve|${type}`).setLabel("Aşamayı Çöz").setEmoji("🎲").setStyle(ButtonStyle.Danger));
  }
  const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [buttons];
  if (type === "AUCTION" && data.season?.status === "ACTIVE" && activeForType) {
    const lots = (await greatGamesAuctionService.lots(guildId)).filter((lot) => lot.phase === "SEALED" || lot.phase === "FINAL");
    if (lots.length) components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId("ggs2|auction-lot").setPlaceholder("Teklif verilecek ödülü seç")
        .addOptions(lots.slice(0, 25).map((lot) => ({ label: lot.title.slice(0, 100), value: lot.id, description: lot.phase === "SEALED" ? "Kapalı teklif" : "Açık final" })))
    ));
  }
  return { content: content ?? "", embeds: [embed], components };
}

function actionModal(type: GreatGameType): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`ggm2|action|${type}`).setTitle(`${GREAT_GAME_TYPES[type].label} Hamlesi`);
  if (type === "CHARIOT") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("tactic").setLabel("AGGRESSIVE/BALANCED/CAUTIOUS/SQUEEZE").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("target").setLabel("Sıkıştırma hedefinin devlet adı").setStyle(TextInputStyle.Short).setRequired(false))
  );
  if (type === "CARAVAN") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("route").setLabel("Ortak rota: SAFE/BALANCED/DANGEROUS").setStyle(TextInputStyle.Short).setRequired(true))
  );
  if (type === "KINGS_BET") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("decision").setLabel("Kararın: İşbirliği veya İhanet").setPlaceholder("İşbirliği").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("prediction").setLabel("Rakip tahmini: İşbirliği veya İhanet").setPlaceholder("İhanet").setStyle(TextInputStyle.Short).setRequired(true))
  );
  if (type === "DIPLOMACY") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("primary").setLabel("Ana kazanan devlet adı").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("secondary").setLabel("İkincil kazanan adı (isteğe bağlı)").setStyle(TextInputStyle.Short).setRequired(false))
  );
  throw new GameError("Bu oyun için oyuncu hamlesi bulunmuyor.");
}

export async function handleGreatGamesCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== "oyunlar") return false;
  if (!interaction.guildId) throw new GameError("Bu komut yalnızca sunucuda kullanılabilir.");
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "panel") {
    if (!isGameMaster(interaction)) throw new GameError("Büyük Oyunlar yönetim panelini yalnızca oyun yöneticisi açabilir.");
    await greatGamesService.openSeason(interaction.guildId, interaction.user.id);
    await interaction.reply(await adminDashboardPayload(interaction.guildId));
    return true;
  }
  if (subcommand === "katilimci-ulkeler") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    const wallets = await greatGamesWalletService.listParticipants(interaction.guildId);
    if (!wallets.length) throw new GameError("Büyük Oyunlara katılmış devlet bulunmuyor.");
    const lines = wallets.map((wallet, index) => `${index + 1}. **${wallet.country_name}** — ${gold(Number(wallet.balance))}${wallet.closed_at ? " • Kapalı" : " • Açık"}`);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xd6ad3c).setTitle("🏛️ Büyük Oyunlar • Katılımcı Ülkeler").setDescription(clip(lines.join("\n"), 3_900))], ephemeral: true });
    return true;
  }
  if (subcommand === "yonetici-bitir") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    await interaction.deferReply({ ephemeral: true });
    const result = await greatGamesWalletService.closeAll(interaction.guildId);
    await interaction.editReply(`🏛️ Cüzdanlar kapatıldı. **${gold(result.total)}** rastgele yerleşkelere aktarıldı.`);
    return true;
  }
  const country = await ownCountry(interaction.guildId, interaction.user.id);
  if (subcommand === "katil") {
    const result = await greatGamesWalletService.join(interaction.guildId, country.id, interaction.user.id);
    await interaction.reply({ content: result.created
      ? `✅ ${country.name}, beş oyunun tamamına aday kaydedildi. Oyun cüzdanına **${gold(5_000)}** yüklendi.`
      : `ℹ️ ${country.name} zaten kayıtlı. Eksik oyun adaylıkları tamamlandı; güncel bakiye **${gold(result.balance)}**.`, ephemeral: true });
    return true;
  }
  if (subcommand === "cuzdan") {
    const wallet = await greatGamesWalletService.get(interaction.guildId, country.id);
    if (!wallet) throw new GameError("Önce `/oyunlar katil` kullanmalısın.");
    await interaction.reply({ content: `🎟️ **${country.name} • Oyun Cüzdanı**\nBakiye: **${gold(Number(wallet.balance))}**`, ephemeral: true });
    return true;
  }
  if (subcommand === "para-aktar") {
    const amount = interaction.options.getInteger("miktar", true);
    const result = await greatGamesWalletService.transferFromRandomSettlement({ guildId: interaction.guildId, countryId: country.id, amount, sourceKey: `discord:${interaction.id}` });
    await interaction.reply({ content: `✅ **${result.settlementName}** hazinesinden ${gold(amount)} aktarıldı. Yeni oyun bakiyesi: **${gold(result.walletBalance)}**`, ephemeral: true });
    return true;
  }
  throw new GameError("Büyük Oyunlar alt komutu tanınmadı.");
}

export async function handleGreatGamesButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("gg2|")) return false;
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
  const [, action, rawType] = interaction.customId.split("|");
  if (action === "admin-home") {
    if (!isGameMaster(interaction)) throw new GameError("Bu panel yalnızca oyun yöneticisine açıktır.");
    await greatGamesService.openSeason(interaction.guildId, interaction.user.id);
    await interaction.update(await adminDashboardPayload(interaction.guildId)); return true;
  }
  if (action === "admin-view") {
    if (!isGameMaster(interaction)) throw new GameError("Bu panel yalnızca oyun yöneticisine açıktır.");
    await greatGamesService.openSeason(interaction.guildId, interaction.user.id);
    await interaction.update(await adminGamePayload(interaction.guildId, gameId(rawType!))); return true;
  }
  if (action === "open") {
    if (!isGameMaster(interaction)) throw new GameError("Yalnızca oyun yöneticisi kayıtları açabilir.");
    await greatGamesService.openSeason(interaction.guildId, interaction.user.id);
    await interaction.update(await adminDashboardPayload(interaction.guildId)); return true;
  }
  if (action === "cancel") {
    throw new GameError("Büyük Oyunlar sabit olarak açık tutulur; sezon bütünüyle iptal edilemez.");
  }
  if (action === "choose") {
    if (!isGameMaster(interaction)) throw new GameError("Katılımcıları yalnızca oyun yöneticisi seçebilir.");
    const type = gameId(rawType!);
    await interaction.update({ content: `**${GREAT_GAME_TYPES[type].label}** katılımcıları nasıl seçilsin?`, embeds: [], components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`gg2|select-random|${type}`).setLabel("Rastgele Seç").setEmoji("🎲").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`gg2|select-manual|${type}`).setLabel("Elle Seç").setEmoji("📝").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gg2|admin-view|${type}`).setLabel("Geri").setStyle(ButtonStyle.Danger)
      )
    ] });
    return true;
  }
  if (action === "select-random") {
    if (!isGameMaster(interaction)) throw new GameError("Katılımcıları yalnızca oyun yöneticisi seçebilir.");
    const type = gameId(rawType!);
    await interaction.showModal(new ModalBuilder().setCustomId(`ggm2|select-random|${type}`).setTitle("Rastgele Katılımcı Seç").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("count").setLabel("Seçilecek devlet sayısı").setStyle(TextInputStyle.Short).setRequired(true))
    )); return true;
  }
  if (action === "select-manual") {
    if (!isGameMaster(interaction)) throw new GameError("Katılımcıları yalnızca oyun yöneticisi seçebilir.");
    const type = gameId(rawType!);
    await interaction.showModal(new ModalBuilder().setCustomId(`ggm2|select-manual|${type}`).setTitle("Katılımcıları Elle Seç").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("countries").setLabel("Devletler; virgül veya yeni satırla").setStyle(TextInputStyle.Paragraph).setMaxLength(4_000).setRequired(true))
    )); return true;
  }
  if (action === "publish") {
    if (!isGameMaster(interaction)) throw new GameError("Oyunu yalnızca oyun yöneticisi yayınlayabilir.");
    const type = gameId(rawType!);
    await interaction.deferUpdate();
    await greatGamesFlowService.publishGame(interaction.guildId, type);
    await interaction.editReply(await adminGamePayload(interaction.guildId, type));
    await interaction.followUp({ ...(await publicGamePayload(interaction.guildId, type)), ephemeral: false });
    return true;
  }
  if (action === "public-refresh") {
    await interaction.update(await publicGamePayload(interaction.guildId, gameId(rawType!))); return true;
  }
  if (action === "start") {
    if (!isGameMaster(interaction)) throw new GameError("Oyunu yalnızca oyun yöneticisi başlatabilir.");
    const type = gameId(rawType!);
    await interaction.deferUpdate();
    const result = await greatGamesFlowService.startPublishedGame(interaction.guildId, type);
    await interaction.editReply(await publicGamePayload(interaction.guildId, type, `▶️ Oyun **${result.count} devletle** başladı.`));
    return true;
  }
  if (action === "bet") {
    await interaction.showModal(new ModalBuilder().setCustomId("ggm2|chariot-bet|CHARIOT").setTitle("Savaş Arabaları Bahsi").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("target").setLabel("Bahis yapılan devlet").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Bahis: 1–2.000 Altın").setStyle(TextInputStyle.Short).setRequired(true))
    )); return true;
  }
  if (action === "action") { await interaction.showModal(actionModal(gameId(rawType!))); return true; }
  if (action === "resolve") {
    if (!isGameMaster(interaction)) throw new GameError("Aşamayı yalnızca oyun yöneticisi çözebilir.");
    const type = gameId(rawType!);
    await interaction.deferUpdate();
    if (type === "AUCTION") {
      const result = await greatGamesAuctionService.advance(interaction.guildId);
      await interaction.editReply(await publicGamePayload(interaction.guildId, type, `🏺 **Müzayede ${result.phase === "FINAL" ? "Finalistleri" : "Sonuçları"}**\n${result.summary.join("\n")}`.slice(0, 2_000)));
    } else {
      const result = await greatGamesService.resolveRound(interaction.guildId);
      await interaction.editReply(await publicGamePayload(interaction.guildId, type, `🎲 **Aşama ${result.round} Sonuçları**\n${result.summary.join("\n")}${result.finished ? "\n🏁 Oyun tamamlandı." : ""}`.slice(0, 2_000)));
    }
    return true;
  }
  return false;
}

export async function handleGreatGamesSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== "ggs2|auction-lot") return false;
  const lotId = interaction.values[0];
  if (!lotId) throw new GameError("Müzayede kalemi seçilmedi.");
  await interaction.showModal(new ModalBuilder().setCustomId(`ggm2|bid|${lotId}`).setTitle("Müzayede Teklifi").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Teklif: 500–5.000; 250 katları").setStyle(TextInputStyle.Short).setRequired(true))
  ));
  return true;
}

export async function handleGreatGamesModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("ggm2|")) return false;
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
  const [, action, rawType] = interaction.customId.split("|");
  if (action === "select-random" || action === "select-manual") {
    if (!isGameMaster(interaction)) throw new GameError("Katılımcıları yalnızca oyun yöneticisi seçebilir.");
    const type = gameId(rawType!);
    const result = action === "select-random"
      ? await greatGamesFlowService.selectParticipants({ guildId: interaction.guildId, gameType: type, mode: "RANDOM", count: Number(interaction.fields.getTextInputValue("count")) })
      : await greatGamesFlowService.selectParticipants({ guildId: interaction.guildId, gameType: type, mode: "MANUAL", countryNames: interaction.fields.getTextInputValue("countries").split(/[\n,;]+/).map((name) => name.trim()).filter(Boolean) });
    const payload = await adminGamePayload(interaction.guildId, type);
    const content = `${result.count} devlet seçildi${result.rooms.length > 1 ? `:\n${result.rooms.map((room, index) => `${index + 1}. ${room}`).join("\n")}` : "."}`.slice(0, 2_000);
    if (interaction.isFromMessage()) await interaction.update({ ...payload, content });
    else await interaction.reply({ ...payload, content });
    return true;
  }
  const country = await ownCountry(interaction.guildId, interaction.user.id);
  if (action === "chariot-bet") {
    const amount = Number(interaction.fields.getTextInputValue("amount").replaceAll(".", ""));
    const targetCountryName = interaction.fields.getTextInputValue("target").trim();
    await greatGamesBetService.place({ guildId: interaction.guildId, bettorCountryId: country.id, targetCountryName, amount });
    await interaction.reply({ content: `✅ ${targetCountryName} sürücüsüne ${gold(amount)} bahis kilitlendi.`, ephemeral: true }); return true;
  }
  if (action === "bid") {
    const amount = Number(interaction.fields.getTextInputValue("amount").replaceAll(".", ""));
    const result = await greatGamesAuctionService.bid({ guildId: interaction.guildId, countryId: country.id, userId: interaction.user.id, lotId: rawType!, amount });
    await interaction.reply({ content: `✅ ${result.phase === "SEALED" ? "Kapalı" : "Açık final"} teklifin ${gold(result.reserved)} olarak kaydedildi.`, ephemeral: true }); return true;
  }
  if (action !== "action") return false;
  const type = gameId(rawType!);
  let payload: Record<string, unknown>;
  if (type === "CHARIOT") {
    const tactic = interaction.fields.getTextInputValue("tactic").trim().toUpperCase() as ChariotTactic;
    if (!(tactic in CHARIOT_TACTICS)) throw new GameError("Sürüş taktiği geçersiz.");
    const targetName = interaction.fields.getTextInputValue("target").trim();
    const target = targetName ? await gameService.countryByName(interaction.guildId, targetName) : null;
    if (targetName && !target) throw new GameError("Sıkıştırma hedefi bulunamadı.");
    payload = { tactic, targetCountryId: target?.id ?? null };
  } else if (type === "CARAVAN") {
    const route = interaction.fields.getTextInputValue("route").trim().toUpperCase() as CaravanRoute;
    if (!(route in CARAVAN_ROUTES)) throw new GameError("Kervan rotası geçersiz.");
    payload = { route };
  } else if (type === "KINGS_BET") {
    const decision = parseKingsDecision(interaction.fields.getTextInputValue("decision"));
    const prediction = parseKingsDecision(interaction.fields.getTextInputValue("prediction"));
    if (!decision || !prediction) throw new GameError("Karar ve tahmin `İşbirliği` veya `İhanet` olmalıdır.");
    payload = { decision, prediction };
  } else if (type === "DIPLOMACY") {
    const primaryName = interaction.fields.getTextInputValue("primary").trim();
    const secondaryName = interaction.fields.getTextInputValue("secondary").trim();
    const primary = await gameService.countryByName(interaction.guildId, primaryName);
    const secondary = secondaryName ? await gameService.countryByName(interaction.guildId, secondaryName) : null;
    if (!primary || (secondaryName && !secondary)) throw new GameError("Diplomasi oyu verilen devlet bulunamadı.");
    payload = { primary: primary.id, secondary: secondary?.id ?? null };
  } else throw new GameError("Bu oyun için oyuncu hamlesi bulunmuyor.");
  await greatGamesService.submitAction({ guildId: interaction.guildId, countryId: country.id, gameType: type, actionType: "ROUND", payload });
  const confirmation = type === "KINGS_BET"
    ? `✅ Kralların Bahsi seçimin gizlice kaydedildi.\n**Kararın:** ${kingsDecisionLabel(payload.decision as KingsDecision)}\n**Rakip tahminin:** ${kingsDecisionLabel(payload.prediction as KingsDecision)}`
    : type === "CHARIOT"
      ? `✅ Savaş Arabaları taktiğin gizlice kaydedildi.\n**Taktiğin:** ${CHARIOT_TACTICS[payload.tactic as ChariotTactic].label}${payload.targetCountryId ? "\n**Sıkıştırma hedefin de kaydedildi.**" : ""}`
    : `✅ ${GREAT_GAME_TYPES[type].label} gizli hamlen kaydedildi.`;
  if (interaction.isFromMessage()) {
    await interaction.update(await publicGamePayload(interaction.guildId, type));
    await interaction.followUp({ content: confirmation, ephemeral: true });
  } else {
    await interaction.reply({ content: confirmation, ephemeral: true });
  }
  return true;
}
