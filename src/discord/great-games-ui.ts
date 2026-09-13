import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction, type StringSelectMenuInteraction
} from "discord.js";
import {
  CARAVAN_ROUTES, CHARIOT_TACTICS, GREAT_GAME_TYPES,
  type CaravanRole, type CaravanRoute, type ChariotTactic, type GreatGameType, type KingsDecision
} from "../domain/great-games.js";
import { gold } from "../domain/format.js";
import { greatGamesService } from "../services/great-games-service.js";
import { greatGamesAuctionService } from "../services/great-games-auction-service.js";
import { greatGamesBetService } from "../services/great-games-bet-service.js";
import { greatGamesWalletService } from "../services/great-games-wallet-service.js";
import { GameError, gameService } from "../services/game-service.js";
import { isGameMaster } from "./auth.js";

const ROLE_LABELS: Record<CaravanRole, string> = {
  MERCHANT: "Tüccar (+3 Ticaret)", GUARD: "Muhafız (+3 Güvenlik)",
  GUIDE: "Rehber (+3 Yolculuk)", FINANCIER: "Finansör (bir başarısız zarı yeniler)"
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

async function dashboardPayload(guildId: string, userId: string, gm: boolean) {
  const data = await greatGamesService.dashboard(guildId, userId);
  const status = data.season
    ? `${data.season.status}${data.season.current_game ? ` • ${GREAT_GAME_TYPES[data.season.current_game].label} / Aşama ${data.season.current_round}` : ""}`
    : "Henüz açılmadı";
  const embed = new EmbedBuilder().setColor(0xd6ad3c).setTitle("🏛️ 15. Tur Büyük Oyunları")
    .setDescription([
      `**Oyun turu:** ${data.currentTurn} • **Durum:** ${status}`,
      "`/oyunlar katil` kullanan devlet beş oyunun tamamına kaydolur ve 5.000 Altın başlangıç bakiyeli ayrı bir oyun cüzdanı kullanır. Oyunları yalnızca yönetici başlatır. Oyun sonunda kalan bakiye devletin rastgele bir yerleşkesine aktarılır.",
      data.points.length ? `\n**Büyük Oyunlar Puanı**\n${data.points.slice(0, 10).map((row, index) => `${index + 1}. ${row.country_name} — **${row.points}**`).join("\n")}` : ""
    ].filter(Boolean).join("\n"));
  for (const gameType of Object.keys(GREAT_GAME_TYPES) as GreatGameType[]) {
    const game = GREAT_GAME_TYPES[gameType];
    const mine = data.entries.find((entry) => entry.game_type === gameType);
    embed.addFields({
      name: `${game.emoji} ${game.label}`,
      value: `Katılımcı: **${data.counts[gameType]}**${mine ? ` • Kaydın: **${mine.status}**${mine.score ? ` • Puan ${mine.score}` : ""}` : ""}`,
      inline: false
    });
  }
  const visibleGameTypes = gm
    ? Object.keys(GREAT_GAME_TYPES) as GreatGameType[]
    : data.season?.status === "ACTIVE" && data.season.current_game && data.entries.some((entry) => entry.game_type === data.season!.current_game) ? [data.season.current_game] : [];
  const gameButtons = visibleGameTypes.length ? new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...visibleGameTypes.map((type) => new ButtonBuilder()
      .setCustomId(`gg|view|${type}`).setLabel(GREAT_GAME_TYPES[type].label.slice(0, 30))
      .setEmoji(GREAT_GAME_TYPES[type].emoji).setStyle(ButtonStyle.Secondary))
  ) : null;
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("gg|home").setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Primary)
  );
  if (gm) {
    if (!data.season) controls.addComponents(new ButtonBuilder().setCustomId("gg|open").setLabel("Oyunları Aç").setStyle(ButtonStyle.Success));
    else if (data.season.status !== "CANCELLED" && data.season.status !== "FINISHED") controls.addComponents(
      new ButtonBuilder().setCustomId("gg|resolve").setLabel("Aşamayı Çöz").setStyle(ButtonStyle.Success).setDisabled(data.season.status !== "ACTIVE"),
      new ButtonBuilder().setCustomId("gg|cancel").setLabel("İptal ve İade").setStyle(ButtonStyle.Danger)
    );
  }
  return { embeds: [embed], components: gameButtons ? [gameButtons, controls] : [controls], ephemeral: true as const };
}

function gameRules(type: GreatGameType): string {
  if (type === "AUCTION") return "Tek turlu açık artırmadır. Açılış 500 Altındır; her yeni teklif tam 250 Altın artırır. Üst teklif ve kazanılabilecek ödül sınırı yoktur. Kaybeden teklif ödemez; kazanan ödemeleri genel ödül havuzuna gider.";
  if (type === "CHARIOT") return "Katılım 1.000 Altın. Üç etap oynanır; her etapta gizli sürüş taktiği seçilir. Katılım havuzu %65/%35 paylaşılır. İlk üç devlet 5/3/2 Büyük Oyunlar Puanı alır.";
  if (type === "CARAVAN") return "Yönetici oyunu başlattığında devletler 2–3 kişilik kervanlara ve görevlere otomatik ayrılır. Her devletten 1.000 Altın yatırım alınır. Üç aşama sonunda bütün yatırımlar takım ağırlıklarına göre geri dağıtılır.";
  if (type === "KINGS_BET") return "Katılım 1.000 Altın. Üç ikilemde İşbirliği veya İhanet ve rakibin kararı için tahmin gizlice seçilir. Havuz ilk üçe %50/%30/%20 dağıtılır.";
  return "Masalar tam üç devletten oluşur. Her devletin ana hedefi bağdaşmaz; anlaşma yalnız bir ana ve en fazla bir ikincil kazanan çıkarır. 500'er Altınlık 1.500 Altın havuz 1.000/500 veya 1.500/0 paylaşılır.";
}

async function gamePayload(guildId: string, userId: string, gm: boolean, type: GreatGameType) {
  const data = await greatGamesService.dashboard(guildId, userId);
  const mine = data.entries.find((entry) => entry.game_type === type);
  if (!gm && (data.season?.status !== "ACTIVE" || data.season.current_game !== type || !mine)) {
    throw new GameError("Oyuncular yalnızca yönetici tarafından başlatılmış etkin oyunu açabilir.");
  }
  const game = GREAT_GAME_TYPES[type];
  const embed = new EmbedBuilder().setColor(0xb78b32).setTitle(`${game.emoji} ${game.label}`)
    .setDescription(`${gameRules(type)}\n\n**Katılımcı:** ${data.counts[type]}${mine ? `\n**Senin kaydın:** ${mine.status} • Skor ${mine.score}` : ""}`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("gg|home").setLabel("Ana Menü").setStyle(ButtonStyle.Secondary)
  );
  const season = data.season;
  if (season?.status === "ACTIVE" && season.current_game === "CHARIOT" && type === "CHARIOT") row.addComponents(
    new ButtonBuilder().setCustomId("gg|bet|CHARIOT").setLabel("Bahis Yap").setStyle(ButtonStyle.Primary)
  );
  if (season?.status === "ACTIVE" && season.current_game === type && mine && type !== "AUCTION") row.addComponents(
    new ButtonBuilder().setCustomId(`gg|action|${type}`).setLabel("Gizli Hamle Ver").setStyle(ButtonStyle.Primary)
  );
  if (gm && season?.status === "OPEN") row.addComponents(
    new ButtonBuilder().setCustomId(`gg|start|${type}`).setLabel("Oyunu Başlat").setStyle(ButtonStyle.Danger)
  );
  const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [row];
  if (type === "AUCTION" && season?.status === "ACTIVE" && season.current_game === "AUCTION" && mine) {
    const lots = await greatGamesAuctionService.lots(guildId, mine.country_id);
    const available = lots.filter((lot) => lot.phase === "SEALED" || lot.phase === "FINAL");
    if (available.length) components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId("ggs|auction-lot").setPlaceholder("Teklif verilecek ödülü seç")
        .addOptions(available.slice(0, 25).map((lot) => ({ label: lot.title.slice(0, 100), value: lot.id, description: `${"Açık artırma"}${lot.own_bid ? ` • Teklifin ${gold(Number(lot.own_bid))}` : ""}`.slice(0, 100) })))
    ));
  }
  return { embeds: [embed], components, ephemeral: true as const };
}

function caravanRegistrationModal(): ModalBuilder {
  return new ModalBuilder().setCustomId("ggm|register|CARAVAN").setTitle("Ticaret Kervanı Kaydı").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("team").setLabel("Takım / kervan adı").setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("investment").setLabel("Yatırım (1.000–3.000)").setStyle(TextInputStyle.Short).setPlaceholder("2000").setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("role").setLabel("Görev: MERCHANT/GUARD/GUIDE/FINANCIER").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("route").setLabel("İlk rota: SAFE/BALANCED/DANGEROUS").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("share").setLabel("Özel paylaşım ağırlığı (yoksa 0)").setStyle(TextInputStyle.Short).setValue("0").setRequired(true))
  );
}

function actionModal(type: GreatGameType): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`ggm|action|${type}`).setTitle(`${GREAT_GAME_TYPES[type].label} Hamlesi`);
  if (type === "CHARIOT") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("tactic").setLabel("AGGRESSIVE/BALANCED/CAUTIOUS/SQUEEZE").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("target").setLabel("Sıkıştırma hedefinin devlet adı").setStyle(TextInputStyle.Short).setRequired(false))
  );
  if (type === "CARAVAN") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("route").setLabel("Ortak rota: SAFE/BALANCED/DANGEROUS").setStyle(TextInputStyle.Short).setRequired(true))
  );
  if (type === "KINGS_BET") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("decision").setLabel("Karar: COOPERATE veya BETRAY").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("prediction").setLabel("Rakip tahmini: COOPERATE veya BETRAY").setStyle(TextInputStyle.Short).setRequired(true))
  );
  if (type === "DIPLOMACY") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("primary").setLabel("Ana kazanan devlet adı").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("secondary").setLabel("İkincil kazanan adı (isteğe bağlı)").setStyle(TextInputStyle.Short).setRequired(false))
  );
  throw new GameError("Bu oyun için bu hamle ekranı kullanılamaz.");
}

export async function handleGreatGamesCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== "oyunlar") return false;
  if (!interaction.guildId) throw new GameError("Bu komut yalnızca sunucuda kullanılabilir.");
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "panel") {
    await interaction.reply(await dashboardPayload(interaction.guildId, interaction.user.id, isGameMaster(interaction)));
    return true;
  }
  if (subcommand === "katilimci-ulkeler") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    const wallets = await greatGamesWalletService.listParticipants(interaction.guildId);
    if (!wallets.length) throw new GameError("Büyük Oyunlara katılmış devlet bulunmuyor.");
    const openWallets = wallets.filter((wallet) => !wallet.closed_at);
    const total = openWallets.reduce((sum, wallet) => sum + Number(wallet.balance), 0);
    const lines = wallets.map((wallet, index) => `${index + 1}. **${wallet.country_name}** — ${gold(Number(wallet.balance))}${wallet.closed_at ? " • Kapalı" : " • Açık"}`);
    const pages: string[] = [];
    for (const line of lines) {
      const current = pages.at(-1);
      if (!current || current.length + line.length + 1 > 3_500) pages.push(line);
      else pages[pages.length - 1] = `${current}\n${line}`;
    }
    const embeds = pages.slice(0, 10).map((page, index) => new EmbedBuilder().setColor(0xd6ad3c)
      .setTitle(index === 0 ? "🏛️ Büyük Oyunlar • Katılımcı Ülkeler" : `Katılımcı Ülkeler • ${index + 1}`)
      .setDescription(page)
      .setFooter({ text: `Toplam ${wallets.length} devlet • ${openWallets.length} açık cüzdan • Açık bakiye ${gold(total)}` }));
    await interaction.reply({ embeds, ephemeral: true });
    return true;
  }
  if (subcommand === "yonetici-bitir") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    await interaction.deferReply();
    const result = await greatGamesWalletService.closeAll(interaction.guildId);
    const lines = result.countries.map((item) => `• ${item.countryName}: ${gold(item.amount)} → ${item.settlementName}`);
    const warning = result.remainingPrizePool > 0 ? `\n⚠️ Genel müzayede ödül havuzunda ayrıca ${gold(result.remainingPrizePool)} bekliyor.` : "";
    await interaction.editReply(`🏛️ **Büyük Oyun cüzdanları kapatıldı**\n${lines.join("\n")}\n\nToplam: **${gold(result.total)}**${warning}`.slice(0, 2_000));
    return true;
  }
  const country = await ownCountry(interaction.guildId, interaction.user.id);
  if (subcommand === "katil") {
    const result = await greatGamesWalletService.join(interaction.guildId, country.id, interaction.user.id);
    await interaction.reply({ content: result.created
      ? `✅ ${country.name}, beş Büyük Oyunun tamamına kaydedildi. Oyun cüzdanına **${gold(5_000)}** yüklendi.`
      : `ℹ️ ${country.name} zaten etkinliğe katılmış. Beş oyun kaydı kontrol edilip eksikleri tamamlandı; ikinci başlangıç bakiyesi verilmedi. Güncel bakiye: **${gold(result.balance)}**.`, ephemeral: true });
    return true;
  }
  if (subcommand === "cuzdan") {
    const wallet = await greatGamesWalletService.get(interaction.guildId, country.id);
    if (!wallet) throw new GameError("Bu devlet etkinliğe katılmadı. Önce `/oyunlar katil` kullanın.");
    await interaction.reply({ content: `🎟️ **${country.name} • Oyun Cüzdanı**\nBakiye: **${gold(Number(wallet.balance))}**${wallet.closed_at ? "\nDurum: Kapatıldı" : ""}`, ephemeral: true });
    return true;
  }
  if (subcommand === "para-aktar") {
    const amount = interaction.options.getInteger("miktar", true);
    const result = await greatGamesWalletService.transferFromRandomSettlement({ guildId: interaction.guildId, countryId: country.id, amount, sourceKey: `discord:${interaction.id}` });
    await interaction.reply({ content: `✅ Rastgele seçilen **${result.settlementName}** hazinesinden ${gold(amount)} oyun cüzdanına aktarıldı.\nYeni cüzdan bakiyesi: **${gold(result.walletBalance)}**`, ephemeral: true });
    return true;
  }
  throw new GameError("Büyük Oyunlar alt komutu tanınmadı.");
}

export async function handleGreatGamesButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("gg|")) return false;
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
  const [, action, rawType] = interaction.customId.split("|");
  if (action === "home") { await interaction.update(await dashboardPayload(interaction.guildId, interaction.user.id, isGameMaster(interaction))); return true; }
  if (action === "view") { await interaction.update(await gamePayload(interaction.guildId, interaction.user.id, isGameMaster(interaction), gameId(rawType!))); return true; }
  if (action === "open") {
    if (!isGameMaster(interaction)) throw new GameError("Yalnızca oyun yöneticisi Büyük Oyunları açabilir.");
    await greatGamesService.openSeason(interaction.guildId, interaction.user.id);
    await interaction.update(await dashboardPayload(interaction.guildId, interaction.user.id, true)); return true;
  }
  if (action === "cancel") {
    if (!isGameMaster(interaction)) throw new GameError("Yalnızca oyun yöneticisi iptal edebilir.");
    await interaction.deferUpdate();
    const refunded = await greatGamesService.cancelSeason(interaction.guildId);
    await interaction.editReply({ ...(await dashboardPayload(interaction.guildId, interaction.user.id, true)), content: `İptal tamamlandı; ${gold(refunded)} iade edildi.` }); return true;
  }
  if (action === "register") {
    throw new GameError("Oyunlara ayrı ayrı katılım kapalıdır. `/oyunlar katil` devleti bütün oyunlara kaydeder.");
  }
  if (action === "start") {
    if (!isGameMaster(interaction)) throw new GameError("Yalnızca oyun yöneticisi oyunu başlatabilir.");
    const type = gameId(rawType!);
    if (type === "KINGS_BET" || type === "DIPLOMACY") {
      await interaction.update({
        content: `**${GREAT_GAME_TYPES[type].label}** eşleşmeleri nasıl oluşturulsun?`, embeds: [],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`gg|match-random|${type}`).setLabel("Rastgele Eşleştir").setEmoji("🎲").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`gg|match-manual|${type}`).setLabel("Elle Eşleştir").setEmoji("📝").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`gg|view|${type}`).setLabel("Geri").setStyle(ButtonStyle.Danger)
        )]
      });
      return true;
    }
    const result = await greatGamesService.startGame(interaction.guildId, type);
    await interaction.update({ ...(await gamePayload(interaction.guildId, interaction.user.id, true, type)), content: `${result.count} devletle oyun başlatıldı.` }); return true;
  }
  if (action === "match-random") {
    if (!isGameMaster(interaction)) throw new GameError("Yalnızca oyun yöneticisi eşleştirme yapabilir.");
    const type = gameId(rawType!);
    if (type !== "KINGS_BET" && type !== "DIPLOMACY") throw new GameError("Bu oyun eşleştirme gerektirmiyor.");
    const result = await greatGamesService.startGame(interaction.guildId, type, "RANDOM");
    await interaction.update({ ...(await gamePayload(interaction.guildId, interaction.user.id, true, type)), content: `🎲 **Rastgele eşleşmeler**\n${result.rooms.map((room, index) => `${index + 1}. ${room}`).join("\n")}`.slice(0, 2_000) });
    return true;
  }
  if (action === "match-manual") {
    if (!isGameMaster(interaction)) throw new GameError("Yalnızca oyun yöneticisi eşleştirme yapabilir.");
    const type = gameId(rawType!);
    if (type !== "KINGS_BET" && type !== "DIPLOMACY") throw new GameError("Bu oyun eşleştirme gerektirmiyor.");
    const grouping = type === "KINGS_BET" ? "Her 2 ülke bir eşleşme" : "Her 3 ülke bir masa";
    await interaction.showModal(new ModalBuilder().setCustomId(`ggm|start-manual|${type}`).setTitle("Elle Eşleştirme").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("countries").setLabel("Ülkeleri eşleşme sırasıyla yaz").setPlaceholder(`${grouping}; virgül veya yeni satır kullan`).setStyle(TextInputStyle.Paragraph).setMaxLength(4_000).setRequired(true))
    ));
    return true;
  }
  if (action === "bet") {
    await interaction.showModal(new ModalBuilder().setCustomId("ggm|chariot-bet|CHARIOT").setTitle("Savaş Arabaları Bahsi").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("target").setLabel("Bahis yapılan devletin adı").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Bahis (en fazla 2.000 Altın)").setStyle(TextInputStyle.Short).setRequired(true))
    )); return true;
  }
  if (action === "action") { await interaction.showModal(actionModal(gameId(rawType!))); return true; }
  if (action === "resolve") {
    if (!isGameMaster(interaction)) throw new GameError("Yalnızca oyun yöneticisi aşama çözebilir.");
    await interaction.deferUpdate();
    const dashboard = await greatGamesService.dashboard(interaction.guildId);
    if (dashboard.season?.current_game === "AUCTION") {
      const result = await greatGamesAuctionService.advance(interaction.guildId);
      await interaction.editReply(await dashboardPayload(interaction.guildId, interaction.user.id, true));
      await interaction.followUp({ content: `**Müzayede ${result.phase === "FINAL" ? "Finalistleri" : "Sonuçları"}**\n${result.summary.join("\n")}\nİade: ${gold(result.refunded)}`.slice(0, 2_000) }); return true;
    }
    const result = await greatGamesService.resolveRound(interaction.guildId);
    await interaction.editReply(await dashboardPayload(interaction.guildId, interaction.user.id, true));
    await interaction.followUp({ content: `**${GREAT_GAME_TYPES[result.gameType].label} • Aşama ${result.round}**\n${result.summary.join("\n")}${result.finished ? "\nOyun tamamlandı." : ""}`.slice(0, 2_000) }); return true;
  }
  throw new GameError("Büyük Oyun işlemi tanınmadı.");
}

export async function handleGreatGamesSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== "ggs|auction-lot") return false;
  const lotId = interaction.values[0];
  if (!lotId) throw new GameError("Müzayede kalemi seçilmedi.");
  const modal = new ModalBuilder().setCustomId(`ggm|bid|${lotId}`).setTitle("Müzayede Teklifi").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Teklif (sıradaki 250 Altınlık bedel)").setStyle(TextInputStyle.Short).setRequired(true))
  );
  await interaction.showModal(modal);
  return true;
}

export async function handleGreatGamesModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("ggm|")) return false;
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
  const [, action, rawType] = interaction.customId.split("|");
  if (action === "start-manual") {
    if (!isGameMaster(interaction)) throw new GameError("Yalnızca oyun yöneticisi eşleştirme yapabilir.");
    const type = gameId(rawType!);
    if (type !== "KINGS_BET" && type !== "DIPLOMACY") throw new GameError("Bu oyun eşleştirme gerektirmiyor.");
    const countryNames = interaction.fields.getTextInputValue("countries").split(/[\n,;]+/).map((name) => name.trim()).filter(Boolean);
    const result = await greatGamesService.startGame(interaction.guildId, type, "MANUAL", countryNames);
    const content = `📝 **Elle oluşturulan eşleşmeler**\n${result.rooms.map((room, index) => `${index + 1}. ${room}`).join("\n")}`.slice(0, 2_000);
    if (interaction.isFromMessage()) await interaction.update({ content, embeds: [], components: [] });
    else await interaction.reply({ content, ephemeral: true });
    return true;
  }
  const country = await ownCountry(interaction.guildId, interaction.user.id);
  if (action === "chariot-bet") {
    const amount = Number(interaction.fields.getTextInputValue("amount").replaceAll(".", ""));
    const targetCountryName = interaction.fields.getTextInputValue("target").trim();
    await greatGamesBetService.place({ guildId: interaction.guildId, bettorCountryId: country.id, targetCountryName, amount });
    await interaction.reply({ content: `${targetCountryName} sürücüsüne ${gold(amount)} bahis kilitlendi.`, ephemeral: true });
    return true;
  }
  if (action === "bid") {
    const amount = Number(interaction.fields.getTextInputValue("amount").replaceAll(".", ""));
    const result = await greatGamesAuctionService.bid({ guildId: interaction.guildId, countryId: country.id, userId: interaction.user.id, lotId: rawType!, amount });
    await interaction.reply({ content: `${result.phase === "SEALED" ? "Kapalı" : "Açık final"} teklifin ${gold(result.reserved)} olarak kaydedildi.`, ephemeral: true });
    return true;
  }
  const type = gameId(rawType!);
  if (action === "register") {
    throw new GameError("Oyunlara ayrı ayrı katılım kapalıdır. `/oyunlar katil` devleti bütün oyunlara kaydeder.");
  }
  if (action === "register" && type === "CHARIOT") {
    const driverName = interaction.fields.getTextInputValue("driver").trim();
    await greatGamesService.register({ guildId: interaction.guildId, countryId: country.id, userId: interaction.user.id, gameType: type, driverName });
    await interaction.reply({ content: `${driverName}, ${country.name} adına Savaş Arabaları Turnuvasına kaydedildi.`, ephemeral: true }); return true;
  }
  if (action === "register" && type === "CARAVAN") {
    const role = interaction.fields.getTextInputValue("role").trim().toUpperCase() as CaravanRole;
    const route = interaction.fields.getTextInputValue("route").trim().toUpperCase() as CaravanRoute;
    if (!(role in ROLE_LABELS)) throw new GameError("Kervan görevi geçersiz.");
    if (!(route in CARAVAN_ROUTES)) throw new GameError("Kervan rotası geçersiz.");
    const investment = Number(interaction.fields.getTextInputValue("investment").replaceAll(".", ""));
    const shareWeight = Number(interaction.fields.getTextInputValue("share"));
    await greatGamesService.register({ guildId: interaction.guildId, countryId: country.id, userId: interaction.user.id, gameType: type, investment, teamName: interaction.fields.getTextInputValue("team"), role, route, shareWeight });
    await interaction.reply({ content: `${country.name}, Ticaret Kervanına ${gold(investment)} yatırımla kaydedildi.`, ephemeral: true }); return true;
  }
  if (action === "action") {
    let payload: Record<string, unknown>;
    if (type === "CHARIOT") {
      const tactic = interaction.fields.getTextInputValue("tactic").trim().toUpperCase() as ChariotTactic;
      if (!(tactic in CHARIOT_TACTICS)) throw new GameError("Sürüş taktiği geçersiz.");
      const targetName = interaction.fields.getTextInputValue("target").trim();
      const target = targetName ? await gameService.countryByName(interaction.guildId, targetName) : null;
      if (targetName && !target) throw new GameError("Sıkıştırma hedefi devlet bulunamadı.");
      payload = { tactic, targetCountryId: target?.id ?? null };
    } else if (type === "CARAVAN") {
      const route = interaction.fields.getTextInputValue("route").trim().toUpperCase() as CaravanRoute;
      if (!(route in CARAVAN_ROUTES)) throw new GameError("Kervan rotası geçersiz.");
      payload = { route };
    } else if (type === "KINGS_BET") {
      const decision = interaction.fields.getTextInputValue("decision").trim().toUpperCase() as KingsDecision;
      const prediction = interaction.fields.getTextInputValue("prediction").trim().toUpperCase() as KingsDecision;
      if (!["COOPERATE", "BETRAY"].includes(decision) || !["COOPERATE", "BETRAY"].includes(prediction)) throw new GameError("Karar veya tahmin geçersiz.");
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
    await interaction.reply({ content: `${GREAT_GAME_TYPES[type].label} gizli hamlen kaydedildi. Aşama çözülene kadar aynı düğmeyle değiştirebilirsin.`, ephemeral: true }); return true;
  }
  return false;
}
