import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction, type TextChannel
} from "discord.js";
import { gold } from "../domain/format.js";
import { gameService, GameError } from "../services/game-service.js";
import { diplomacyService } from "../services/diplomacy-service.js";
import {
  warDeclarationService, type OfficialWarView, type PeaceOfferView, type WarEndOutcome, type WarInvitationView, type WarSide
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
  const attackerTitle = war.attacker_pact_name ?? war.attacker_country_name;
  const defenderTitle = war.defender_pact_name ?? war.defender_country_name;
  const attackerParticipants = war.attacker_participant_names ?? [war.attacker_country_name];
  const defenderParticipants = war.defender_participant_names ?? [war.defender_country_name];
  const attackerAllies = war.attacker_diplomatic_ally_names ?? [];
  const defenderAllies = war.defender_diplomatic_ally_names ?? [];
  return new EmbedBuilder()
    .setColor(0x9f252c)
    .setTitle("⚔️ RESMÎ SAVAŞ İLANI")
    .setImage(WAR_DECLARATION_BANNER_URL)
    .setDescription(`**${attackerTitle}**, **${defenderTitle}** cephesine savaş ilan etti.`)
    .addFields(
      { name: "⚔️ Saldıran Cephe Lideri", value: fieldValue(war.attacker_country_name), inline: true },
      { name: "🛡️ Savunan Cephe Lideri", value: fieldValue(war.defender_country_name), inline: true },
      { name: "🎯 Savaş Hedefi", value: fieldValue(war.war_goal ?? war.reason) },
      { name: `🔴 Saldıran Cephe${war.attacker_pact_name ? ` • ${war.attacker_pact_name}` : ""}`, value: fieldValue(attackerParticipants.join("\n")) },
      { name: `🔵 Savunan Cephe${war.defender_pact_name ? ` • ${war.defender_pact_name}` : ""}`, value: fieldValue(defenderParticipants.join("\n")) },
      { name: "🤝 Çağrılabilecek Saldıran Müttefikleri", value: fieldValue(attackerAllies.length ? attackerAllies.join("\n") : "Bulunmuyor."), inline: true },
      { name: "🤝 Çağrılabilecek Savunan Müttefikleri", value: fieldValue(defenderAllies.length ? defenderAllies.join("\n") : "Bulunmuyor."), inline: true },
      { name: "📜 Savaş Gerekçesi", value: fieldValue(war.reason) },
      ...longTextFields("📣 Resmî İlan", war.declaration),
      { name: "⏳ Başlangıç", value: fieldValue(`Tur ${war.started_turn}`) }
    )
    .setFooter({ text: "Savaş durumu devlet bilgi kartlarına otomatik olarak işlenmiştir." });
}

export function renderWarInvitation(invitation: WarInvitationView, war: OfficialWarView): EmbedBuilder {
  const sideName = invitation.side === "ATTACKER"
    ? (war.attacker_pact_name ?? `${war.attacker_country_name} Cephesi`)
    : (war.defender_pact_name ?? `${war.defender_country_name} Cephesi`);
  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle("📯 SAVAŞA KATILIM ÇAĞRISI")
    .setDescription(`**${invitation.invited_by_country_name}**, **${invitation.country_name}** devletini savaşa çağırıyor.`)
    .addFields(
      { name: "⚔️ Savaş", value: fieldValue(`${war.attacker_country_name} — ${war.defender_country_name}`) },
      { name: "🏳️ Katılacağı Cephe", value: fieldValue(sideName) },
      { name: "🎯 Savaş Hedefi", value: fieldValue(war.war_goal) }
    )
    .setFooter({ text: "Kabul edildiğinde devlet bu savaşın ilgili cephesine resmen katılır; barış yetkisi cephe liderinde kalır." });
}

export function renderWarStructureUpdate(war: OfficialWarView): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5965a8)
    .setTitle("🧭 SAVAŞ CEPHELERİ GÜNCELLENDİ")
    .setDescription(`**${war.attacker_country_name}** ve **${war.defender_country_name}** liderliğindeki savaşın resmî yapısı güncellendi.`)
    .addFields(
      { name: "🎯 Savaş Hedefi", value: fieldValue(war.war_goal) },
      { name: `🔴 Saldıran Cephe Lideri${war.attacker_pact_name ? ` • ${war.attacker_pact_name}` : ""}`, value: fieldValue(`**${war.attacker_country_name}**\n${war.attacker_participant_names.join("\n")}`), inline: true },
      { name: `🔵 Savunan Cephe Lideri${war.defender_pact_name ? ` • ${war.defender_pact_name}` : ""}`, value: fieldValue(`**${war.defender_country_name}**\n${war.defender_participant_names.join("\n")}`), inline: true }
    )
    .setFooter({ text: "Barış teklifleri yalnızca burada gösterilen iki savaş lideri arasında yürütülür." });
}

function warInvitationButtons(id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`war_invite_accept|${id}`).setLabel("Savaşa Katıl").setEmoji("⚔️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`war_invite_reject|${id}`).setLabel("Çağrıyı Reddet").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
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
  firstSide?: string[]; secondSide?: string[];
  indemnityAmount?: number; payerCountry?: string | null; recipientCountry?: string | null;
}): EmbedBuilder {
  const firstSide = input.firstSide ?? [input.firstCountry];
  const secondSide = input.secondSide ?? [input.secondCountry];
  const embed = new EmbedBuilder()
    .setColor(0x3c8b5c)
    .setTitle("🕊️ BARIŞ ANTLAŞMASI • SAVAŞ SONA ERDİ")
    .setImage(PEACE_TREATY_BANNER_URL)
    .setDescription(`**${input.firstCountry}** ve **${input.secondCountry}** liderliğindeki savaş cepheleri barış yaptı.`)
    .addFields(
      { name: `🔴 ${input.firstCountry} Cephesi`, value: fieldValue(firstSide.join("\n")), inline: true },
      { name: `🔵 ${input.secondCountry} Cephesi`, value: fieldValue(secondSide.join("\n")), inline: true },
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

export function renderWarEndAnnouncement(input: {
  firstCountry: string; secondCountry: string; winnerCountry: string | null;
  firstSide?: string[]; secondSide?: string[];
  outcome: WarEndOutcome; turn: number | null; description: string;
}): EmbedBuilder {
  const firstSide = input.firstSide ?? [input.firstCountry];
  const secondSide = input.secondSide ?? [input.secondCountry];
  const whitePeace = input.outcome === "WHITE_PEACE";
  const result = whitePeace ? "Beyaz Barış" : `Kazanan: **${input.winnerCountry}**`;
  return new EmbedBuilder()
    .setColor(whitePeace ? 0x3c8b5c : 0xc59b45)
    .setTitle(whitePeace ? "🕊️ BEYAZ BARIŞ • SAVAŞ SONA ERDİ" : "🏆 SAVAŞ SONA ERDİ")
    .setImage(PEACE_TREATY_BANNER_URL)
    .setDescription(`**${input.firstCountry}** ve **${input.secondCountry}** liderliğindeki savaş resmen sona erdi.`)
    .addFields(
      { name: `🔴 ${input.firstCountry} Cephesi`, value: fieldValue(firstSide.join("\n")), inline: true },
      { name: `🔵 ${input.secondCountry} Cephesi`, value: fieldValue(secondSide.join("\n")), inline: true },
      { name: "🏁 Sonuç", value: fieldValue(result) },
      ...longTextFields("📜 Savaş Bitiş Açıklaması", input.description),
      ...(input.turn === null ? [] : [{ name: "⏳ Bitiş Turu", value: fieldValue(`Tur ${input.turn}`) }])
    )
    .setFooter({ text: "Bu duyuru yalnızca resmî savaş durumunu kapatır; hazine ve yerleşke işlemleri ayrıca uygulanır." });
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
  const supported = ["savas-ilan-kanali", "savas-ilani", "pakt-savasi", "savas-cagrisi", "savas-yapilandir", "baris-teklifi", "aktif-savaslar", "savas-sonlandir"];
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
    const lines = wars.map((war) => `⚔️ **${war.attacker_country_name}** — **${war.defender_country_name}**\n🎯 ${war.war_goal}\n🔴 ${war.attacker_participant_names.join(", ")}\n🔵 ${war.defender_participant_names.join(", ")}\n⏳ Tur ${war.started_turn}`);
    const embed = new EmbedBuilder().setColor(0x9f252c).setTitle("⚔️ Devam Eden Devlet Savaşları")
      .setDescription((lines.length ? lines.join("\n\n") : "Şu anda resmî olarak devam eden bir devlet savaşı bulunmuyor.").slice(0, 4096));
    await interaction.editReply({ embeds: [embed] });
    return true;
  }

  if (interaction.commandName === "savas-sonlandir") {
    requireGameMaster(interaction);
    const channel = await warChannel(interaction);
    const warId = interaction.options.getString("savas", true);
    const winnerSelection = interaction.options.getString("kazanan", true);
    const winnerCountryId = winnerSelection === "WHITE_PEACE" ? null : winnerSelection;
    const description = interaction.options.getString("aciklama", true);
    await interaction.deferReply({ ephemeral: true });
    const war = await warDeclarationService.forceEnd({ guildId: interaction.guildId, actorId: interaction.user.id, warId, winnerCountryId, description });
    const outcome = war.end_outcome!;
    await channel.send({
      embeds: [renderWarEndAnnouncement({
        firstCountry: war.attacker_country_name, secondCountry: war.defender_country_name,
        firstSide: war.attacker_participant_names, secondSide: war.defender_participant_names,
        winnerCountry: war.winner_country_name, outcome, turn: war.ended_turn, description
      })],
      files: [new AttachmentBuilder(PEACE_TREATY_BANNER_PATH, { name: PEACE_TREATY_BANNER_NAME })]
    });
    const resultText = outcome === "WHITE_PEACE" ? "beyaz barışla" : `**${war.winner_country_name}** zaferiyle`;
    await interaction.editReply(`✅ **${war.attacker_country_name}** ile **${war.defender_country_name}** arasındaki savaş ${resultText} sonlandırıldı ve duyuruldu.`);
    return true;
  }

  if (interaction.commandName === "savas-yapilandir") {
    requireGameMaster(interaction);
    const channel = await warChannel(interaction);
    const subcommand = interaction.options.getSubcommand();
    const warId = interaction.options.getString("savas", true);
    await interaction.deferReply({ ephemeral: true });
    let war: OfficialWarView;
    let operation = "Savaş yapısı güncellendi.";
    if (subcommand === "hedef-ayarla") {
      war = await warDeclarationService.setWarGoal({
        guildId: interaction.guildId, actorId: interaction.user.id, warId,
        warGoal: interaction.options.getString("hedef", true)
      });
      operation = "Savaş hedefi güncellendi.";
    } else if (subcommand === "pakt-bagla") {
      const pact = await diplomacyService.pactByName(interaction.guildId, interaction.options.getString("pakt", true));
      if (!pact) throw new GameError("Bağlanacak pakt bulunamadı.");
      war = await warDeclarationService.attachPactToWar({
        guildId: interaction.guildId, actorId: interaction.user.id, warId,
        side: interaction.options.getString("cephe", true) as WarSide, pactId: pact.id
      });
      operation = `**${pact.name}** seçilen cepheye bağlandı; aktif üyeleri savaşa eklendi ve pakt lideri savaş lideri yapıldı.`;
    } else if (subcommand === "pakt-kaldir") {
      war = await warDeclarationService.detachPactFromWar({
        guildId: interaction.guildId, actorId: interaction.user.id, warId,
        side: interaction.options.getString("cephe", true) as WarSide
      });
      operation = "Cephe pakt bağı kaldırıldı; mevcut katılımcılar korundu.";
    } else {
      const countryName = interaction.options.getString("ulke", true);
      const country = await gameService.countryByName(interaction.guildId, countryName);
      if (!country) throw new GameError("Belirtilen devlet bulunamadı.");
      if (subcommand === "ulke-ekle") {
        war = await warDeclarationService.addWarParticipant({
          guildId: interaction.guildId, actorId: interaction.user.id, warId,
          side: interaction.options.getString("cephe", true) as WarSide, countryId: country.id
        });
        operation = `**${country.name}** seçilen cepheye doğrudan eklendi.`;
      } else if (subcommand === "ulke-cikar") {
        war = await warDeclarationService.removeWarParticipant({
          guildId: interaction.guildId, actorId: interaction.user.id, warId, countryId: country.id
        });
        operation = `**${country.name}** savaş cephesinden çıkarıldı.`;
      } else if (subcommand === "lider-degistir") {
        war = await warDeclarationService.changeWarLeader({
          guildId: interaction.guildId, actorId: interaction.user.id, warId,
          side: interaction.options.getString("cephe", true) as WarSide, countryId: country.id
        });
        operation = `**${country.name}** seçilen cephenin yeni savaş lideri oldu.`;
      } else {
        throw new GameError("Bilinmeyen savaş yapılandırma işlemi.");
      }
    }
    await channel.send({ embeds: [renderWarStructureUpdate(war)] });
    await interaction.editReply(`✅ ${operation}\nGüncel cephe yapısı ${channel} kanalında duyuruldu.`);
    return true;
  }

  if (interaction.commandName === "pakt-savasi") {
    await warChannel(interaction);
    const own = await resolveCountry(interaction, interaction.options.getString("ulke"));
    const attackerPact = await diplomacyService.pactByName(interaction.guildId, interaction.options.getString("saldiran-pakt", true));
    const targetPactName = interaction.options.getString("hedef-pakt");
    const targetCountryName = interaction.options.getString("hedef-ulke");
    if (Boolean(targetPactName) === Boolean(targetCountryName)) throw new GameError("Hedef olarak yalnızca bir pakt veya bir devlet seçmelisiniz.");
    const defenderPact = targetPactName ? await diplomacyService.pactByName(interaction.guildId, targetPactName) : null;
    const defenderCountry = targetCountryName ? await gameService.countryByName(interaction.guildId, targetCountryName) : null;
    if (!attackerPact || (targetPactName && !defenderPact) || (targetCountryName && !defenderCountry)) throw new GameError("Saldıran pakt veya hedef taraf bulunamadı.");
    if (attackerPact.id === defenderPact?.id) throw new GameError("Bir pakt kendisine savaş ilan edemez.");
    if (attackerPact.founder_country_id === defenderCountry?.id) throw new GameError("Pakt lideri kendi devletine savaş ilan edemez.");
    if (attackerPact.founder_country_id !== own.id) throw new GameError("Pakt adına savaşı yalnızca paktın mevcut lider devleti ilan edebilir.");
    const modalId = defenderPact
      ? `war_pact|${attackerPact.id}|${defenderPact.id}`
      : `war_pact_country|${attackerPact.id}|${defenderCountry!.id}`;
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Pakt Savaşı İlanı");
    modal.addComponents(
      modalText("war_goal", "Savaş hedefi", TextInputStyle.Short, { placeholder: "Örn. rakip paktın deniz üstünlüğünü kırmak", maxLength: 500 }),
      modalText("reason", "Savaş gerekçesi", TextInputStyle.Paragraph, { placeholder: "Savaşın diplomatik veya siyasi gerekçesi", maxLength: 1000 }),
      modalText("declaration", "Herkese açık resmî ilan metni", TextInputStyle.Paragraph, { placeholder: "Savaşlar kanalında yayımlanacak duyuru", maxLength: 2000 })
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.commandName === "savas-cagrisi") {
    const channel = await warChannel(interaction);
    const own = await resolveCountry(interaction, interaction.options.getString("ulke"));
    const target = await countryByOption(interaction, "hedef-ulke");
    const warId = interaction.options.getString("savas", true);
    await interaction.deferReply({ ephemeral: true });
    const invitation = await warDeclarationService.createWarInvitation({
      guildId: interaction.guildId, actorId: interaction.user.id, warId, leaderCountryId: own.id, targetCountryId: target.id
    });
    const war = await warDeclarationService.getWar(warId);
    if (!war) throw new GameError("Aktif savaş bulunamadı.");
    try {
      const players = await gameService.playerIds(target.id);
      const message = await channel.send({
        content: players.length ? players.map((id) => `<@${id}>`).join(" ") : `📯 **${target.name}** • Oyun yöneticisi yanıtlayabilir.`,
        embeds: [renderWarInvitation(invitation, war)], components: [warInvitationButtons(invitation.id)],
        allowedMentions: { users: players }
      });
      await warDeclarationService.attachWarInvitationMessage(invitation.id, channel.id, message.id);
    } catch (error) {
      await warDeclarationService.cancelWarInvitation(interaction.guildId, invitation.id).catch(() => undefined);
      throw error;
    }
    await interaction.editReply(`✅ **${target.name}** devletine savaş çağrısı gönderildi ve ${channel} kanalında yayımlandı.`);
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
      modalText("war_goal", "Savaş hedefi", TextInputStyle.Short, { placeholder: "Örn. sınır bölgesinin güvenliğini sağlamak", maxLength: 500 }),
      modalText("reason", "Savaş gerekçesi", TextInputStyle.Paragraph, { placeholder: "Savaşın diplomatik veya siyasi gerekçesi", maxLength: 1000 }),
      modalText("declaration", "Herkese açık resmî ilan metni", TextInputStyle.Paragraph, { placeholder: "Savaşlar kanalında yayımlanacak duyuru", maxLength: 2000 })
    );
    await interaction.showModal(modal);
    return true;
  }

  const war = await warDeclarationService.activeWarBetween(interaction.guildId, own.id, target.id);
  if (!war) throw new GameError("Bu devlete barış teklif etmek için aranızda aktif bir savaş bulunmalıdır.");
  if (![war.attacker_country_id, war.defender_country_id].includes(own.id)) throw new GameError("Barış teklifini yalnızca iki cephenin savaş liderleri gönderebilir.");
  const opposingLeaderId = war.attacker_country_id === own.id ? war.defender_country_id : war.attacker_country_id;
  if (target.id !== opposingLeaderId) throw new GameError("Barış teklifi karşı cephenin savaş liderine gönderilmelidir.");
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
  if (kind !== "war_declare" && kind !== "war_pact" && kind !== "war_pact_country" && kind !== "peace_offer") return false;
  if (!interaction.guildId || !firstId || !secondId) throw new GameError("Savaş veya barış formunun bilgileri geçersiz.");
  const channel = await warChannel(interaction);

  if (kind === "war_declare" || kind === "war_pact" || kind === "war_pact_country") {
    let attackerCountryId = firstId;
    let defenderCountryId = secondId;
    let attackerPactId: string | null = null;
    let defenderPactId: string | null = null;
    if (kind === "war_pact" || kind === "war_pact_country") {
      const attackerPact = await diplomacyService.pactDetailsById(interaction.guildId, firstId);
      attackerCountryId = attackerPact.founder_country_id;
      attackerPactId = attackerPact.id;
      if (kind === "war_pact") {
        const defenderPact = await diplomacyService.pactDetailsById(interaction.guildId, secondId);
        defenderCountryId = defenderPact.founder_country_id;
        defenderPactId = defenderPact.id;
      }
    }
    await assertCountryAccess(interaction, attackerCountryId);
    await interaction.deferReply({ ephemeral: true });
    const war = await warDeclarationService.declareWar({
      guildId: interaction.guildId, actorId: interaction.user.id, attackerCountryId, defenderCountryId,
      attackerPactId, defenderPactId, warGoal: interaction.fields.getTextInputValue("war_goal"),
      reason: interaction.fields.getTextInputValue("reason"), declaration: interaction.fields.getTextInputValue("declaration")
    });
    try {
      const defenderParticipants = await warDeclarationService.participants(war.id);
      const playerGroups = await Promise.all(defenderParticipants.filter((item) => item.side === "DEFENDER").map((item) => gameService.playerIds(item.country_id)));
      const players = [...new Set(playerGroups.flat())];
      const message = await channel.send({
        content: players.length ? players.map((id) => `<@${id}>`).join(" ") : `⚔️ **${war.defender_country_name}** cephesine resmî savaş ilanı.`,
        embeds: [renderWarDeclaration(war)],
        files: [new AttachmentBuilder(WAR_DECLARATION_BANNER_PATH, { name: WAR_DECLARATION_BANNER_NAME })],
        allowedMentions: { users: players }
      });
      await warDeclarationService.attachWarMessage(war.id, channel.id, message.id);
    } catch (error) {
      await warDeclarationService.cancelWarDeclaration(interaction.guildId, war.id).catch(() => undefined);
      throw error;
    }
    await interaction.editReply(`✅ **${war.defender_country_name}** liderliğindeki cepheye savaş ilan edildi; duyuru ${channel} kanalında yayımlandı.`);
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
  if (action === "war_invite_accept" || action === "war_invite_reject") {
    if (!offerId || !interaction.guildId) throw new GameError("Savaş çağrısının bilgileri geçersiz.");
    const invitation = await warDeclarationService.getWarInvitation(offerId);
    if (!invitation || invitation.guild_id !== interaction.guildId) throw new GameError("Savaş çağrısı bulunamadı.");
    if (!isGameMaster(interaction)) {
      const country = await gameService.countryForUser(interaction.guildId, interaction.user.id);
      if (!country || country.id !== invitation.country_id) throw new GameError("Bu savaş çağrısını yalnızca davet edilen devletin oyuncuları yanıtlayabilir.");
    }
    await interaction.deferUpdate();
    const accepted = action === "war_invite_accept";
    const result = await warDeclarationService.respondWarInvitation({
      guildId: interaction.guildId, actorId: interaction.user.id, invitationId: offerId,
      countryId: invitation.country_id, accept: accepted
    });
    const resolved = EmbedBuilder.from(interaction.message.embeds[0]!)
      .setColor(accepted ? 0x3c8b5c : 0x9f252c)
      .setTitle(accepted ? "✅ SAVAŞ ÇAĞRISI KABUL EDİLDİ" : "❌ SAVAŞ ÇAĞRISI REDDEDİLDİ")
      .setFooter({ text: `${interaction.user.username} tarafından sonuçlandırıldı.` });
    await interaction.editReply({
      content: accepted
        ? `⚔️ **${result.invitation.country_name}**, **${result.invitation.invited_by_country_name}** liderliğindeki cepheye katıldı.`
        : `❌ **${result.invitation.country_name}** savaş çağrısını reddetti.`,
      embeds: [resolved], components: []
    });
    return true;
  }
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
        firstSide: result.war.attacker_participant_names, secondSide: result.war.defender_participant_names,
        turn: result.war.ended_turn, terms: result.offer.terms, indemnityAmount: result.offer.indemnity_amount,
        payerCountry: result.offer.payer_country_name, recipientCountry: result.offer.recipient_country_name
      })],
      files: [new AttachmentBuilder(PEACE_TREATY_BANNER_PATH, { name: PEACE_TREATY_BANNER_NAME })]
    });
  }
  return true;
}
