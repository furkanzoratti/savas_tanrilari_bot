import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction, type TextChannel
} from "discord.js";
import { gold } from "../domain/format.js";
import { gameService, GameError } from "../services/game-service.js";
import {
  warDeclarationService, type OfficialWarView, type PeaceOfferView
} from "../services/war-declaration-service.js";
import { assertCountryAccess, isGameMaster, requireGameMaster, resolveCountry } from "./auth.js";
import {
  WAR_DECLARATION_BANNER_NAME, WAR_DECLARATION_BANNER_PATH, WAR_DECLARATION_BANNER_URL,
  PEACE_TREATY_BANNER_NAME, PEACE_TREATY_BANNER_PATH, PEACE_TREATY_BANNER_URL
} from "./assets.js";

function fieldValue(value: string): string {
  return `${value.slice(0, 1022)}\n\u200B`;
}

function longTextFields(name: string, value: string): Array<{ name: string; value: string }> {
  const parts = value.match(/[\s\S]{1,1022}/g) ?? [value];
  return parts.map((part, index) => ({
    name: index === 0 ? name : `${name} (Devamı)`,
    value: fieldValue(part)
  }));
}

export function renderWarDeclaration(war: OfficialWarView): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x9f252c)
    .setTitle("⚔️ RESMÎ SAVAŞ İLANI")
    .setImage(WAR_DECLARATION_BANNER_URL)
    .setDescription(`**${war.attacker_country_name}**, **${war.defender_country_name}** devletine savaş ilan etti.`)
    .addFields(
      { name: "🏛️ Savaş İlan Eden", value: fieldValue(war.attacker_country_name), inline: true },
      { name: "🛡️ Hedef Devlet", value: fieldValue(war.defender_country_name), inline: true },
      { name: "📜 Savaş Gerekçesi", value: fieldValue(war.reason) },
      ...longTextFields("📣 Resmî İlan", war.declaration),
      { name: "⏳ Başlangıç", value: fieldValue(`Tur ${war.started_turn}`) }
    )
    .setFooter({ text: "Savaş durumu devlet bilgi kartlarına otomatik olarak işlenmiştir." });
}

export function renderPeaceOffer(offer: PeaceOfferView): EmbedBuilder {
  const indemnity = offer.indemnity_amount > 0
    ? `**${offer.payer_country_name}** → **${offer.recipient_country_name}**\n${gold(offer.indemnity_amount)}`
    : "Tazminat talep edilmiyor.";
  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle("🕊️ BARIŞ TEKLİFİ")
    .setDescription(`**${offer.proposer_country_name}**, **${offer.receiver_country_name}** devletine barış teklif ediyor.`)
    .addFields(
      { name: "📤 Teklif Eden", value: fieldValue(offer.proposer_country_name), inline: true },
      { name: "📥 Teklif Edilen", value: fieldValue(offer.receiver_country_name), inline: true },
      ...longTextFields("📜 Barış Şartları", offer.terms),
      { name: "💰 Savaş Tazminatı", value: fieldValue(indemnity) }
    )
    .setFooter({ text: "Yalnızca hedef devletin oyuncuları veya oyun yöneticisi yanıtlayabilir." });
}

export function renderPeaceAnnouncement(input: {
  firstCountry: string; secondCountry: string; turn: number | null; terms: string;
  indemnityAmount?: number; payerCountry?: string | null; recipientCountry?: string | null;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x3c8b5c)
    .setTitle("🕊️ BARIŞ ANTLAŞMASI • SAVAŞ SONA ERDİ")
    .setImage(PEACE_TREATY_BANNER_URL)
    .setDescription(`**${input.firstCountry}** ile **${input.secondCountry}** arasındaki savaş resmen sona erdi.`)
    .addFields(
      { name: "🤝 Antlaşmanın Tarafları", value: fieldValue(`**${input.firstCountry}**\n**${input.secondCountry}**`) },
      ...longTextFields("📜 Barış Şartları", input.terms)
    );
  if (input.indemnityAmount && input.payerCountry && input.recipientCountry) {
    embed.addFields({
      name: "💰 Ödenen Savaş Tazminatı",
      value: fieldValue(`**${input.payerCountry}** → **${input.recipientCountry}**\n${gold(input.indemnityAmount)}`)
    });
  }
  if (input.turn !== null) embed.addFields({ name: "⏳ Antlaşma Turu", value: fieldValue(`Tur ${input.turn}`) });
  return embed.setFooter({ text: "Tazminat dışında yerleşke devri ve diğer hükümler oyun yöneticisi tarafından uygulanır." });
}

function peaceButtons(id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`peace_accept|${id}`).setLabel("Barışı Kabul Et").setEmoji("🕊️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`peace_reject|${id}`).setLabel("Teklifi Reddet").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
}

async function warChannel(interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction): Promise<TextChannel> {
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  const channelId = await warDeclarationService.channel(interaction.guildId);
  if (!channelId) throw new GameError("Önce yönetici /savas-ilan-kanali komutuyla savaşlar kanalını seçmelidir.");
  let channel;
  try {
    channel = await interaction.client.channels.fetch(channelId);
  } catch {
    throw new GameError("Belirlenen savaşlar kanalına erişilemiyor. Kanal ayarını ve bot izinlerini kontrol edin.");
  }
  if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== interaction.guildId) {
    throw new GameError("Belirlenen savaşlar kanalı geçerli bir sunucu metin kanalı değil.");
  }
  return channel;
}

async function countryByOption(interaction: ChatInputCommandInteraction, option: string) {
  const country = await gameService.countryByName(interaction.guildId!, interaction.options.getString(option, true));
  if (!country) throw new GameError("Belirtilen devlet bulunamadı.");
  return country;
}

function modalText(id: string, label: string, style: TextInputStyle, options: { required?: boolean; placeholder?: string; maxLength?: number } = {}): ActionRowBuilder<TextInputBuilder> {
  const field = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(options.required ?? true);
  if (options.placeholder) field.setPlaceholder(options.placeholder);
  if (options.maxLength) field.setMaxLength(options.maxLength);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(field);
}

function normalizePayer(value: string): string {
  return value.trim().toLocaleUpperCase("tr-TR").replaceAll("İ", "I").replaceAll("Ş", "S").replaceAll("Ğ", "G").replaceAll("Ü", "U").replaceAll("Ö", "O").replaceAll("Ç", "C");
}

export function parsePeaceIndemnity(raw: string): number {
  const normalized = raw.trim().replaceAll(".", "").replaceAll(",", "").replaceAll(" ", "");
  if (!normalized) return 0;
  if (!/^\d+$/.test(normalized)) throw new GameError("Tazminat yalnızca pozitif rakamlarla girilebilir.");
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new GameError("Tazminat tutarı geçerli bir tam sayı olmalıdır.");
  return amount;
}

export async function handleWarDeclarationCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const supported = ["savas-ilan-kanali", "savas-ilani", "baris-teklifi", "aktif-savaslar", "savas-sonlandir"];
  if (!supported.includes(interaction.commandName)) return false;
  if (!interaction.guildId) throw new GameError("Bu komut yalnızca bir Discord sunucusunda kullanılabilir.");

  if (interaction.commandName === "savas-ilan-kanali") {
    requireGameMaster(interaction);
    const operation = interaction.options.getString("islem", true);
    const channel = interaction.options.getChannel("kanal");
    if (operation === "set" && !channel) throw new GameError("Duyuru kanalını ayarlamak için bir metin kanalı seçmelisiniz.");
    await interaction.deferReply({ ephemeral: true });
    await warDeclarationService.setChannel({ guildId: interaction.guildId, actorId: interaction.user.id, channelId: operation === "set" ? channel!.id : null });
    await interaction.editReply(operation === "set" ? `✅ Savaş ve barış duyuruları ${channel} kanalında yayımlanacak.` : "✅ Savaş duyuru kanalı kaldırıldı.");
    return true;
  }

  if (interaction.commandName === "aktif-savaslar") {
    await interaction.deferReply();
    const wars = await warDeclarationService.activeWars(interaction.guildId);
    const lines = wars.map((war) => `⚔️ **${war.attacker_country_name}** — **${war.defender_country_name}**\n📜 ${war.reason}\n⏳ Tur ${war.started_turn}`);
    const embed = new EmbedBuilder().setColor(0x9f252c).setTitle("⚔️ Devam Eden Devlet Savaşları")
      .setDescription((lines.length ? lines.join("\n\n") : "Şu anda resmî olarak devam eden bir devlet savaşı bulunmuyor.").slice(0, 4096));
    await interaction.editReply({ embeds: [embed] });
    return true;
  }

  if (interaction.commandName === "savas-sonlandir") {
    requireGameMaster(interaction);
    const channel = await warChannel(interaction);
    const first = await countryByOption(interaction, "ulke-a");
    const second = await countryByOption(interaction, "ulke-b");
    const reason = interaction.options.getString("neden", true);
    await interaction.deferReply({ ephemeral: true });
    const war = await warDeclarationService.forceEnd({ guildId: interaction.guildId, actorId: interaction.user.id, firstCountryId: first.id, secondCountryId: second.id, reason });
    await channel.send({
      embeds: [renderPeaceAnnouncement({ firstCountry: war.attacker_country_name, secondCountry: war.defender_country_name, turn: war.ended_turn, terms: reason })],
      files: [new AttachmentBuilder(PEACE_TREATY_BANNER_PATH, { name: PEACE_TREATY_BANNER_NAME })]
    });
    await interaction.editReply(`✅ **${first.name}** ile **${second.name}** arasındaki resmî savaş sonlandırıldı.`);
    return true;
  }

  await warChannel(interaction);
  const own = await resolveCountry(interaction, interaction.options.getString("ulke"));
  const target = await countryByOption(interaction, "hedef-ulke");
  if (own.id === target.id) throw new GameError("Bir devlet kendisini hedef seçemez.");

  if (interaction.commandName === "savas-ilani") {
    const existing = await warDeclarationService.activeWarBetween(interaction.guildId, own.id, target.id);
    if (existing) throw new GameError("Bu devletler arasında zaten devam eden bir savaş bulunuyor.");
    const modal = new ModalBuilder().setCustomId(`war_declare|${own.id}|${target.id}`).setTitle("Resmî Savaş İlanı");
    modal.addComponents(
      modalText("reason", "Savaş gerekçesi", TextInputStyle.Paragraph, { placeholder: "Savaşın diplomatik veya siyasi gerekçesi", maxLength: 1000 }),
      modalText("declaration", "Herkese açık resmî ilan metni", TextInputStyle.Paragraph, { placeholder: "Savaşlar kanalında yayımlanacak duyuru", maxLength: 2000 })
    );
    await interaction.showModal(modal);
    return true;
  }

  const war = await warDeclarationService.activeWarBetween(interaction.guildId, own.id, target.id);
  if (!war) throw new GameError("Bu devlete barış teklif etmek için aranızda aktif bir savaş bulunmalıdır.");
  const modal = new ModalBuilder().setCustomId(`peace_offer|${war.id}|${own.id}`).setTitle("Barış Antlaşması Teklifi");
  modal.addComponents(
    modalText("terms", "Barış şartları", TextInputStyle.Paragraph, { placeholder: "Örn. saldırmazlık ve sınırların korunması", maxLength: 2000 }),
    modalText("indemnity", "Tazminat (Altın) — isteğe bağlı", TextInputStyle.Short, { required: false, placeholder: "Örn. 10000", maxLength: 20 }),
    modalText("payer", "Tazminatı kim öder? BEN / HEDEF", TextInputStyle.Short, { required: false, placeholder: "Tazminat varsa BEN veya HEDEF", maxLength: 12 })
  );
  await interaction.showModal(modal);
  return true;
}

export async function handleWarDeclarationModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const [kind, firstId, secondId] = interaction.customId.split("|");
  if (kind !== "war_declare" && kind !== "peace_offer") return false;
  if (!interaction.guildId || !firstId || !secondId) throw new GameError("Savaş veya barış formunun bilgileri geçersiz.");
  const channel = await warChannel(interaction);

  if (kind === "war_declare") {
    await assertCountryAccess(interaction, firstId);
    await interaction.deferReply({ ephemeral: true });
    const war = await warDeclarationService.declareWar({
      guildId: interaction.guildId, actorId: interaction.user.id, attackerCountryId: firstId, defenderCountryId: secondId,
      reason: interaction.fields.getTextInputValue("reason"), declaration: interaction.fields.getTextInputValue("declaration")
    });
    try {
      const players = await gameService.playerIds(war.defender_country_id);
      const message = await channel.send({
        content: players.length ? players.map((id) => `<@${id}>`).join(" ") : `⚔️ **${war.defender_country_name}** devletine resmî savaş ilanı.`,
        embeds: [renderWarDeclaration(war)],
        files: [new AttachmentBuilder(WAR_DECLARATION_BANNER_PATH, { name: WAR_DECLARATION_BANNER_NAME })],
        allowedMentions: { users: players }
      });
      await warDeclarationService.attachWarMessage(war.id, channel.id, message.id);
    } catch (error) {
      await warDeclarationService.cancelWarDeclaration(interaction.guildId, war.id).catch(() => undefined);
      throw error;
    }
    await interaction.editReply(`✅ **${war.defender_country_name}** devletine savaş ilan edildi; duyuru ${channel} kanalında yayımlandı.`);
    return true;
  }

  const war = await warDeclarationService.getWar(firstId);
  if (!war || war.guild_id !== interaction.guildId || war.status !== "ACTIVE") throw new GameError("Barış teklifine konu olan aktif savaş bulunamadı.");
  await assertCountryAccess(interaction, secondId);
  if (![war.attacker_country_id, war.defender_country_id].includes(secondId)) throw new GameError("Yalnızca savaşın tarafları barış teklif edebilir.");
  const receiverCountryId = war.attacker_country_id === secondId ? war.defender_country_id : war.attacker_country_id;
  const amount = parsePeaceIndemnity(interaction.fields.getTextInputValue("indemnity"));
  const payerRaw = normalizePayer(interaction.fields.getTextInputValue("payer"));
  let payerCountryId: string | null = null;
  if (amount > 0) {
    if (payerRaw === "BEN") payerCountryId = secondId;
    else if (payerRaw === "HEDEF") payerCountryId = receiverCountryId;
    else throw new GameError("Tazminat belirtilmişse ödeme tarafına BEN veya HEDEF yazılmalıdır.");
  } else if (payerRaw) {
    throw new GameError("Tazminat belirtilmediyse ödeme tarafı boş bırakılmalıdır.");
  }
  await interaction.deferReply({ ephemeral: true });
  const offer = await warDeclarationService.createPeaceOffer({
    guildId: interaction.guildId, actorId: interaction.user.id, warId: war.id,
    proposerCountryId: secondId, receiverCountryId, terms: interaction.fields.getTextInputValue("terms"),
    indemnityAmount: amount, payerCountryId
  });
  try {
    const players = await gameService.playerIds(offer.receiver_country_id);
    const message = await channel.send({
      content: players.length ? players.map((id) => `<@${id}>`).join(" ") : `**${offer.receiver_country_name}** • Oyun yöneticisi yanıtlayabilir.`,
      embeds: [renderPeaceOffer(offer)], components: [peaceButtons(offer.id)], allowedMentions: { users: players }
    });
    await warDeclarationService.attachPeaceMessage(offer.id, channel.id, message.id);
  } catch (error) {
    await warDeclarationService.cancelPeaceOffer(interaction.guildId, offer.id).catch(() => undefined);
    throw error;
  }
  await interaction.editReply(`✅ **${offer.receiver_country_name}** devletine barış teklifi gönderildi; teklif ${channel} kanalında yayımlandı.`);
  return true;
}

export async function handleWarDeclarationButton(interaction: ButtonInteraction): Promise<boolean> {
  const [action, offerId] = interaction.customId.split("|");
  if (action !== "peace_accept" && action !== "peace_reject") return false;
  if (!offerId || !interaction.guildId) throw new GameError("Barış teklifinin bilgileri geçersiz.");
  const offer = await warDeclarationService.getPeaceOffer(offerId);
  if (!offer || offer.guild_id !== interaction.guildId) throw new GameError("Barış teklifi bulunamadı.");
  if (!isGameMaster(interaction)) {
    const country = await gameService.countryForUser(interaction.guildId, interaction.user.id);
    if (!country || country.id !== offer.receiver_country_id) throw new GameError("Bu barış teklifini yalnızca hedef devletin oyuncuları yanıtlayabilir.");
  }
  await interaction.deferUpdate();
  const accepted = action === "peace_accept";
  const result = await warDeclarationService.respondPeace({
    guildId: interaction.guildId, actorId: interaction.user.id, offerId, receiverCountryId: offer.receiver_country_id, accept: accepted
  });
  const resolved = EmbedBuilder.from(interaction.message.embeds[0]!)
    .setColor(accepted ? 0x3c8b5c : 0x9f252c)
    .setTitle(accepted ? "✅ BARIŞ TEKLİFİ KABUL EDİLDİ" : "❌ BARIŞ TEKLİFİ REDDEDİLDİ")
    .setFooter({ text: `${interaction.user.username} tarafından sonuçlandırıldı.` });
  await interaction.editReply({
    content: accepted
      ? `🕊️ **${result.offer.receiver_country_name}**, barış teklifini kabul etti.`
      : `❌ **${result.offer.receiver_country_name}**, barış teklifini reddetti; savaş devam ediyor.`,
    embeds: [resolved], components: []
  });
  if (accepted) {
    const channel = await warChannel(interaction);
    await channel.send({
      embeds: [renderPeaceAnnouncement({
        firstCountry: result.war.attacker_country_name, secondCountry: result.war.defender_country_name,
        turn: result.war.ended_turn, terms: result.offer.terms, indemnityAmount: result.offer.indemnity_amount,
        payerCountry: result.offer.payer_country_name, recipientCountry: result.offer.recipient_country_name
      })],
      files: [new AttachmentBuilder(PEACE_TREATY_BANNER_PATH, { name: PEACE_TREATY_BANNER_NAME })]
    });
  }
  return true;
}
