import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  type ButtonInteraction, type ChatInputCommandInteraction, type TextChannel
} from "discord.js";
import { RESOURCES } from "../domain/resources.js";
import {
  diplomacyService,
  type AllianceView, type PactDetails, type PactInvitationView, type PublicCountryProfile
} from "../services/diplomacy-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { isGameMaster, requireGameMaster, resolveCountry } from "./auth.js";
import {
  PACT_BANNER_NAME, PACT_BANNER_PATH, PACT_BANNER_URL,
  STATE_PROFILE_BANNER_NAME, STATE_PROFILE_BANNER_PATH, STATE_PROFILE_BANNER_URL
} from "./assets.js";

function embedValue(text: string): string {
  return `${text.slice(0, 1022)}\n\u200B`;
}

export function diplomacyReplyIsPublic(command: "ittifak" | "pakt" | "devlet-bilgisi", action = ""): boolean {
  return command === "devlet-bilgisi"
    || (command === "ittifak" && action === "teklif")
    || (command === "pakt" && ["bilgi", "liste", "davet"].includes(action));
}

export function renderPublicCountryProfile(profile: PublicCountryProfile): EmbedBuilder {
  const settlements = profile.settlements.length
    ? profile.settlements.map((settlement) => `• **${settlement.name}** — ${RESOURCES[settlement.resource_type].label}`).join("\n")
    : "Henüz yerleşke bulunmuyor.";
  const allies = profile.allies.length
    ? profile.allies.map((ally) => `• **${ally.name}**`).join("\n")
    : "Açıklanmış müttefik bulunmuyor.";
  const pacts = profile.pacts.length
    ? profile.pacts.map((pact) => `• **${pact.name}** — ${pact.purpose}`).join("\n")
    : "Herhangi bir pakta üye değil.";
  const wars = profile.wars.length
    ? profile.wars.map((opponent) => `• **${opponent.name}**`).join("\n")
    : "Devlet herhangi bir savaşta bulunmuyor.";

  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle(`🏛️ ${profile.name} • Herkese Açık Devlet Bilgisi`)
    .setImage(STATE_PROFILE_BANNER_URL)
    .addFields(
      { name: "🗺️ Yerleşkeler ve Hammaddeler", value: embedValue(settlements) },
      { name: "🤝 Müttefikler", value: embedValue(allies) },
      { name: "🏛️ Üye Olunan Paktlar", value: embedValue(pacts) },
      { name: "⚔️ Savaşta Olduğu Devletler", value: embedValue(wars) }
    );
}

export function renderPublicPactProfile(pact: PactDetails): EmbedBuilder {
  const members = pact.members.map((member) => `${member.id === pact.founder_country_id ? "👑" : "•"} **${member.name}**`).join("\n");
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🏛️ ${pact.name} • Pakt Bilgisi`)
    .setImage(PACT_BANNER_URL)
    .addFields(
      { name: "🎯 Amaç", value: embedValue(pact.purpose) },
      { name: "📜 Açıklama", value: embedValue(pact.description) },
      { name: "👑 Pakt Lideri", value: embedValue(pact.founder_country_name), inline: true },
      { name: `🌍 Üye Devletler (${pact.members.length})`, value: embedValue(members || "Üye bulunmuyor.") }
    );
}

function allianceInviteEmbed(alliance: AllianceView): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle("🤝 Yeni İttifak Daveti")
    .setDescription(`**${alliance.proposer_country_name}**, **${alliance.receiver_country_name}** devletine karşılıklı müttefiklik teklif ediyor.`)
    .addFields(
      { name: "📤 Davet Eden Devlet", value: alliance.proposer_country_name, inline: true },
      { name: "📥 Davet Edilen Devlet", value: alliance.receiver_country_name, inline: true }
    )
    .setFooter({ text: "Yalnızca hedef devletin oyuncuları veya oyun yöneticisi yanıtlayabilir." });
}

function pactInviteEmbed(invitation: PactInvitationView): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🏛️ ${invitation.pact_name} • Pakt Daveti`)
    .setImage(PACT_BANNER_URL)
    .setDescription(`**${invitation.inviter_country_name}**, **${invitation.receiver_country_name}** devletini pakta davet ediyor.`)
    .addFields(
      { name: "🎯 Paktın Amacı", value: embedValue(invitation.pact_purpose) },
      { name: "📜 Pakt Açıklaması", value: embedValue(invitation.pact_description) },
      { name: "📤 Davet Eden", value: invitation.inviter_country_name, inline: true },
      { name: "📥 Davet Edilen", value: invitation.receiver_country_name, inline: true }
    )
    .setFooter({ text: "Yalnızca hedef devletin oyuncuları veya oyun yöneticisi yanıtlayabilir." });
}

function responseButtons(kind: "alliance" | "pact", id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`dip_${kind}_accept|${id}`).setLabel("Kabul Et").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`dip_${kind}_reject|${id}`).setLabel("Reddet").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
}

async function requireDiplomacyChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel> {
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  const configured = await diplomacyService.channel(interaction.guildId);
  if (!configured) throw new GameError("Önce yönetici /diplomasi-kanali komutuyla ittifak ve pakt kanalını seçmelidir.");
  if (configured !== interaction.channelId) throw new GameError(`Diplomasi işlemleri yalnızca <#${configured}> kanalında kullanılabilir.`);
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) throw new GameError("Diplomasi kanalına mesaj gönderilemiyor.");
  return interaction.channel;
}

async function findCountry(interaction: ChatInputCommandInteraction, optionName: string) {
  const country = await gameService.countryByName(interaction.guildId!, interaction.options.getString(optionName, true));
  if (!country) throw new GameError("Belirtilen hedef devlet bulunamadı.");
  return country;
}

async function findPact(interaction: ChatInputCommandInteraction) {
  const pact = await diplomacyService.pactByName(interaction.guildId!, interaction.options.getString("pakt", true));
  if (!pact) throw new GameError("Belirtilen pakt bulunamadı.");
  return pact;
}

async function handleAlliance(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = await requireDiplomacyChannel(interaction);
  const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
  const action = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: !diplomacyReplyIsPublic("ittifak", action) });

  if (action === "liste") {
    const alliances = await diplomacyService.allianceList(country.id);
    const lines = alliances.map((alliance) => {
      const incoming = alliance.receiver_country_id === country.id;
      const partner = incoming ? alliance.proposer_country_name : alliance.receiver_country_name;
      const status = alliance.status === "ACTIVE" ? "✅ Aktif" : incoming ? "📥 Gelen davet" : "📤 Gönderilen davet";
      const link = alliance.status === "PENDING" && alliance.channel_id && alliance.message_id
        ? ` • [Daveti görüntüle](https://discord.com/channels/${interaction.guildId}/${alliance.channel_id}/${alliance.message_id})`
        : "";
      return `${status} • **${partner}**${link}`;
    });
    await interaction.editReply(lines.length ? lines.join("\n") : "Aktif ittifak veya bekleyen ittifak daveti bulunmuyor.");
    return;
  }

  const target = await findCountry(interaction, "hedef-ulke");
  if (action === "feshet") {
    await diplomacyService.endAlliance({ guildId: interaction.guildId!, actorId: interaction.user.id, countryId: country.id, targetCountryId: target.id });
    await interaction.editReply(`✅ **${country.name}** ile **${target.name}** arasındaki ittifak sona erdirildi.`);
    return;
  }

  const alliance = await diplomacyService.offerAlliance({
    guildId: interaction.guildId!, actorId: interaction.user.id, proposerCountryId: country.id, receiverCountryId: target.id
  });
  try {
    const players = await gameService.playerIds(target.id);
    const mention = players.length ? players.map((id) => `<@${id}>`).join(" ") : `**${target.name}** • Oyuncu atanmamış; oyun yöneticisi yanıtlayabilir.`;
    const message = await interaction.editReply({
      content: mention, embeds: [allianceInviteEmbed(alliance)], components: [responseButtons("alliance", alliance.id)],
      allowedMentions: { users: players }
    });
    await diplomacyService.attachAllianceMessage(alliance.id, channel.id, message.id);
  } catch (error) {
    await diplomacyService.cancelAllianceOffer(interaction.guildId!, alliance.id).catch(() => undefined);
    throw error;
  }
  return;
}

async function handlePact(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  const action = interaction.options.getSubcommand();
  if (action === "bilgi") {
    const pact = await diplomacyService.pactDetails(interaction.guildId, interaction.options.getString("pakt", true));
    await interaction.reply({
      embeds: [renderPublicPactProfile(pact)],
      files: [new AttachmentBuilder(PACT_BANNER_PATH, { name: PACT_BANNER_NAME })],
      ephemeral: !diplomacyReplyIsPublic("pakt", action)
    });
    return;
  }
  if (action === "liste") {
    const pacts = await diplomacyService.pactList(interaction.guildId);
    const lines = pacts.map((pact) => `🏛️ **${pact.name}** • ${pact.member_count} devlet\n🎯 ${pact.purpose}\n👑 ${pact.founder_country_name}`);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🏛️ Aktif Diplomatik Paktlar")
        .setDescription((lines.length ? lines.join("\n\n") : "Henüz kurulmuş bir pakt bulunmuyor.").slice(0, 4096))],
      ephemeral: !diplomacyReplyIsPublic("pakt", action)
    });
    return;
  }

  const channel = await requireDiplomacyChannel(interaction);
  const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
  await interaction.deferReply({ ephemeral: !diplomacyReplyIsPublic("pakt", action) });

  if (action === "olustur") {
    const pact = await diplomacyService.createPact({
      guildId: interaction.guildId, actorId: interaction.user.id, founderCountryId: country.id,
      name: interaction.options.getString("ad", true), purpose: interaction.options.getString("amac", true),
      description: interaction.options.getString("aciklama", true)
    });
    await interaction.editReply(`✅ **${pact.name}** paktı kuruldu. Lider devlet: **${country.name}**.\n🎯 Amaç: ${pact.purpose}`);
    return;
  }

  if (action === "davetlerim") {
    const invitations = await diplomacyService.pendingPactInvitations(country.id);
    const lines = invitations.map((invitation) => {
      const link = invitation.channel_id && invitation.message_id
        ? ` • [Daveti görüntüle](https://discord.com/channels/${interaction.guildId}/${invitation.channel_id}/${invitation.message_id})`
        : "";
      return `📥 **${invitation.pact_name}** • Davet eden: ${invitation.inviter_country_name}${link}\n🎯 ${invitation.pact_purpose}`;
    });
    await interaction.editReply(lines.length ? lines.join("\n\n") : "Devletinize gönderilmiş bekleyen pakt daveti bulunmuyor.");
    return;
  }

  const pact = await findPact(interaction);
  if (action === "davet") {
    const target = await findCountry(interaction, "hedef-ulke");
    const invitation = await diplomacyService.inviteToPact({
      guildId: interaction.guildId, actorId: interaction.user.id, pactId: pact.id,
      inviterCountryId: country.id, receiverCountryId: target.id, gameMaster: isGameMaster(interaction)
    });
    try {
      const players = await gameService.playerIds(target.id);
      const mention = players.length ? players.map((id) => `<@${id}>`).join(" ") : `**${target.name}** • Oyuncu atanmamış; oyun yöneticisi yanıtlayabilir.`;
      const message = await interaction.editReply({
        content: mention, embeds: [pactInviteEmbed(invitation)], components: [responseButtons("pact", invitation.id)],
        files: [new AttachmentBuilder(PACT_BANNER_PATH, { name: PACT_BANNER_NAME })],
        allowedMentions: { users: players }
      });
      await diplomacyService.attachPactMessage(invitation.id, channel.id, message.id);
    } catch (error) {
      await diplomacyService.cancelPactInvitation(interaction.guildId, invitation.id).catch(() => undefined);
      throw error;
    }
    return;
  }

  if (action === "ayril") {
    await diplomacyService.leavePact({ guildId: interaction.guildId, actorId: interaction.user.id, pactId: pact.id, countryId: country.id });
    await interaction.editReply(`✅ **${country.name}**, **${pact.name}** paktından ayrıldı.`);
    return;
  }

  if (action === "dagit") {
    if (interaction.options.getString("onay", true) !== "DAGIT") throw new GameError("Paktı dağıtmak için onay alanına büyük harflerle DAGIT yazmalısınız.");
    await diplomacyService.disbandPact({
      guildId: interaction.guildId, actorId: interaction.user.id, pactId: pact.id,
      actorCountryId: country.id, gameMaster: isGameMaster(interaction)
    });
    await interaction.editReply(`✅ **${pact.name}** paktı dağıtıldı; bütün üyelikler ve bekleyen davetler kaldırıldı.`);
    return;
  }

  const target = await findCountry(interaction, "hedef-ulke");
  if (action === "uye-cikar") {
    await diplomacyService.removePactMember({
      guildId: interaction.guildId, actorId: interaction.user.id, pactId: pact.id,
      actorCountryId: country.id, targetCountryId: target.id, gameMaster: isGameMaster(interaction)
    });
    await interaction.editReply(`✅ **${target.name}**, **${pact.name}** paktından çıkarıldı.`);
    return;
  }
  if (action === "lider-devret") {
    await diplomacyService.transferPactLeadership({
      guildId: interaction.guildId, actorId: interaction.user.id, pactId: pact.id,
      actorCountryId: country.id, targetCountryId: target.id, gameMaster: isGameMaster(interaction)
    });
    await interaction.editReply(`✅ **${pact.name}** paktının liderliği **${target.name}** devletine devredildi.`);
  }
}

export async function handleDiplomacyCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!["diplomasi-kanali", "devlet-bilgisi", "ittifak", "pakt"].includes(interaction.commandName)) return false;
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");

  if (interaction.commandName === "diplomasi-kanali") {
    requireGameMaster(interaction);
    const action = interaction.options.getString("islem", true);
    const channel = interaction.options.getChannel("kanal");
    if (action === "set" && !channel) throw new GameError("Diplomasi kanalını ayarlamak için bir metin kanalı seçmelisiniz.");
    await interaction.deferReply({ ephemeral: true });
    await diplomacyService.setChannel({ guildId: interaction.guildId, actorId: interaction.user.id, channelId: action === "set" ? channel!.id : null });
    await interaction.editReply(action === "set"
      ? `✅ İttifak ve pakt davetleri artık ${channel} kanalında yürütülecek. Davetler, katılımlar ve bilgi kartları herkese açık yayımlanır.`
      : "✅ Diplomasi kanalı kapatıldı. Yeniden kanal seçilinceye kadar ittifak ve pakt işlemleri durduruldu.");
    return true;
  }

  if (interaction.commandName === "devlet-bilgisi") {
    const profile = await diplomacyService.publicCountry(interaction.guildId, interaction.options.getString("ulke", true));
    await interaction.reply({
      embeds: [renderPublicCountryProfile(profile)],
      files: [new AttachmentBuilder(STATE_PROFILE_BANNER_PATH, { name: STATE_PROFILE_BANNER_NAME })],
      ephemeral: !diplomacyReplyIsPublic("devlet-bilgisi")
    });
    return true;
  }

  if (interaction.commandName === "ittifak") await handleAlliance(interaction);
  else await handlePact(interaction);
  return true;
}

export async function handleDiplomacyButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = /^dip_(alliance|pact)_(accept|reject)\|(.+)$/.exec(interaction.customId);
  if (!match) return false;
  if (!interaction.guildId) throw new GameError("Bu davet yalnızca sunucu içinde yanıtlanabilir.");
  const kind = match[1]!;
  const accepted = match[2] === "accept";
  const invitationId = match[3]!;

  if (kind === "alliance") {
    const offer = await diplomacyService.getAlliance(invitationId);
    if (!offer || offer.guild_id !== interaction.guildId) throw new GameError("İttifak daveti bulunamadı.");
    if (!isGameMaster(interaction)) {
      const country = await gameService.countryForUser(interaction.guildId, interaction.user.id);
      if (!country || country.id !== offer.receiver_country_id) throw new GameError("Bu daveti yalnızca hedef devletin oyuncuları yanıtlayabilir.");
    }
    await interaction.deferUpdate();
    const result = await diplomacyService.respondAlliance({
      guildId: interaction.guildId, actorId: interaction.user.id,
      receiverCountryId: offer.receiver_country_id, allianceId: offer.id, accept: accepted
    });
    const embed = EmbedBuilder.from(interaction.message.embeds[0]!)
      .setColor(accepted ? 0x2e8b57 : 0xb22222)
      .setTitle(accepted ? "✅ İttifak Daveti Kabul Edildi" : "❌ İttifak Daveti Reddedildi")
      .setFooter({ text: `${interaction.user.username} tarafından sonuçlandırıldı.` });
    await interaction.editReply({
      content: accepted
        ? `✅ **${result.proposer_country_name}** ile **${result.receiver_country_name}** artık müttefik.`
        : `❌ **${result.receiver_country_name}**, **${result.proposer_country_name}** devletinin ittifak davetini reddetti.`,
      embeds: [embed], components: [], allowedMentions: { parse: [] }
    });
    if (accepted) {
      await interaction.followUp({
        content: `📣 **${result.proposer_country_name}** ile **${result.receiver_country_name}** arasındaki ittifak resmen yürürlüğe girdi.`,
        ephemeral: false, allowedMentions: { parse: [] }
      });
    }
    return true;
  }

  const invitation = await diplomacyService.getPactInvitation(invitationId);
  if (!invitation || invitation.guild_id !== interaction.guildId) throw new GameError("Pakt daveti bulunamadı.");
  if (!isGameMaster(interaction)) {
    const country = await gameService.countryForUser(interaction.guildId, interaction.user.id);
    if (!country || country.id !== invitation.receiver_country_id) throw new GameError("Bu daveti yalnızca hedef devletin oyuncuları yanıtlayabilir.");
  }
  await interaction.deferUpdate();
  const result = await diplomacyService.respondPactInvitation({
    guildId: interaction.guildId, actorId: interaction.user.id,
    receiverCountryId: invitation.receiver_country_id, invitationId: invitation.id, accept: accepted
  });
  const embed = EmbedBuilder.from(interaction.message.embeds[0]!)
    .setColor(accepted ? 0x2e8b57 : 0xb22222)
    .setTitle(accepted ? `✅ ${result.pact_name} • Pakt Daveti Kabul Edildi` : `❌ ${result.pact_name} • Pakt Daveti Reddedildi`)
    .setFooter({ text: `${interaction.user.username} tarafından sonuçlandırıldı.` });
  await interaction.editReply({
    content: accepted
      ? `✅ **${result.receiver_country_name}**, **${result.pact_name}** paktına katıldı.`
      : `❌ **${result.receiver_country_name}**, **${result.pact_name}** paktının davetini reddetti.`,
    embeds: [embed], components: [], allowedMentions: { parse: [] }
  });
  if (accepted) {
    await interaction.followUp({
      content: `📣 **${result.receiver_country_name}**, **${result.pact_name}** paktına resmen katıldı.`,
      ephemeral: false, allowedMentions: { parse: [] }
    });
  }
  return true;
}
