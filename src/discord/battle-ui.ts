import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import { BATTLE_TERRAINS, BATTLE_UNIT_STATS, NAVAL_UNIT_STATS, SIEGE_ASSET_BATTLE_STATS, orderState, type BattleController, type BattleForceType, type BattleSideKey, type BattleTerrain, type BattleUnitType, type NavalUnitType, type SiegeAssetType } from "../domain/battle.js";
import { number } from "../domain/format.js";
import { battleService, type BattleView } from "../services/battle-service.js";
import { GameError } from "../services/game-service.js";
import { isGameMaster, requireGameMaster } from "./auth.js";
import { battlefieldAsset } from "./assets.js";

const statusLabels: Record<string, string> = {
  DRAFT: "Taslak", WAITING_FIRST_ROLL: "İlk tarafın zarı bekleniyor", WAITING_SECOND_ROLL: "İkinci tarafın zarı bekleniyor",
  READY_TO_RESOLVE: "Yönetici tur çözümünü bekliyor", FINISHED: "Sona erdi", CANCELLED: "İptal edildi"
};
const orderLabels: Record<string, string> = { ORDERED: "Düzenli", WORN: "Yıpranmış", SHAKEN: "Sarsılmış", BROKEN: "Dağılmış" };
const tierLabels: Record<string, string> = { BALANCED: "Dengeli Çarpışma", MINOR: "Hafif Üstünlük", CLEAR: "Belirgin Üstünlük", CRUSHING: "Ezici Üstünlük" };

function expectedSide(view: BattleView): BattleSideKey | null {
  if (!["WAITING_FIRST_ROLL", "WAITING_SECOND_ROLL"].includes(view.battle.status)) return null;
  return view.rolls.length ? view.battle.first_side === "A" ? "B" : "A" : view.battle.first_side;
}

export function battleEmbed(view: BattleView, roundResult?: { tier: string; winner: BattleSideKey | null; lossA: number; lossB: number; orderA: string; orderB: string; wallDamage: number; ended: boolean }): EmbedBuilder {
  const terrain = BATTLE_TERRAINS[view.battle.terrain];
  const sideField = (key: BattleSideKey) => {
    const side = view.sides[key];
    const order = orderState(side.pressure, side.initial_total, side.current_total);
    return `**Başlangıç:** ${number(side.initial_total)}\n**Mevcut:** ${number(side.current_total)}\n**Toplam Kayıp:** ${number(side.total_losses)}\n**Düzen:** ${orderLabels[order]}\n**Zar Yetkisi:** ${side.controller === "GM" ? "Oyun Yöneticisi (NPC)" : "Ülke Oyuncuları"}\n**Ordu Mührü:** \`${side.seal}\``;
  };
  const embed = new EmbedBuilder().setColor(view.battle.status === "FINISHED" ? 0x8b1a1a : 0xb68b36)
    .setTitle(`⚔️ ${view.sides.A.country_name} — ${view.sides.B.country_name}`)
    .setDescription(view.battle.narrative || "İki ordu savaş alanında karşı karşıya geldi.")
    .addFields(
      { name: "🗺️ Savaş Alanı", value: view.battle.terrain === "NAVAL" ? `${terrain.label}\nFilo sınırı: A ${number(terrain.frontageA)} • B ${number(terrain.frontageB)} gemi` : `${terrain.label}\nA cephesi: ${number(terrain.frontageA)} • B cephesi: ${number(terrain.frontageB)}`, inline: false },
      { name: `🟥 A — ${view.sides.A.country_name}`, value: sideField("A"), inline: true },
      { name: `🟦 B — ${view.sides.B.country_name}`, value: sideField("B"), inline: true },
      { name: "📜 Durum", value: `**Tur:** ${view.battle.round_number}\n**Aşama:** ${statusLabels[view.battle.status] ?? view.battle.status}`, inline: false }
    );
  if (view.battle.terrain === "AMBUSH") embed.addFields({ name: "🌲 Pusu Düzeni", value: "A tarafı pusuyu kuran taraftır. İlk turda çarpışma +%25 ve hasar +%10 uygulanır." });
  if (view.battle.terrain === "SIEGE") embed.addFields({ name: "🏰 Surlar", value: `**${number(view.battle.wall_current_hp ?? 0)} / ${number(view.battle.wall_max_hp ?? 0)} HP**${(view.battle.wall_current_hp ?? 0) === 0 ? " — Gedik açıldı" : " — Surlar ayakta"}` });
  embed.setImage(`attachment://${terrain.preset}`).setFooter({ text: "Tam birlik kompozisyonu gizlidir. Mühür, kadro değişikliğinde yenilenir." }).setTimestamp();
  const rolls = view.rolls.map((roll) => `**${roll.side_key} — ${view.sides[roll.side_key].country_name}:** Çarpışma **${roll.clash_total}** • Hasar **${roll.damage_total}**${roll.wall_damage ? ` • Sur Hasarı **${roll.wall_damage}**` : ""} • <@${roll.roller_user_id}>${roll.is_proxy ? " (DM vekili)" : ""}`).join("\n");
  if (rolls) embed.addFields({ name: "🎲 Açık Zar Kayıtları", value: rolls });
  if (roundResult) {
    const winner = roundResult.winner ? view.sides[roundResult.winner].country_name : "Yok";
    embed.addFields({ name: `⚔️ Tur Sonucu — ${tierLabels[roundResult.tier] ?? roundResult.tier}`, value: `Üstün taraf: **${winner}**\n${view.sides.A.country_name}: **-${number(roundResult.lossA)}** • ${orderLabels[roundResult.orderA]}\n${view.sides.B.country_name}: **-${number(roundResult.lossB)}** • ${orderLabels[roundResult.orderB]}${roundResult.wallDamage ? `\nSurlara verilen hasar: **${number(roundResult.wallDamage)}**` : ""}` });
  }
  if (view.battle.status === "FINISHED") embed.addFields({ name: "🏁 Savaş Sonu", value: `${view.battle.winner_side ? `Galip: **${view.sides[view.battle.winner_side].country_name}**` : "Sonuç: **Berabere / kararsız**"}\n${view.battle.finish_reason ?? ""}` });
  return embed;
}

function components(view: BattleView) {
  if (["FINISHED", "CANCELLED", "DRAFT"].includes(view.battle.status)) return [];
  const expected = expectedSide(view);
  const label = expected ? `${expected} Tarafı Savaş Zarlarını At` : "Tur Çözümü Bekleniyor";
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`battle_roll|${view.battle.id}`).setLabel(label).setEmoji("🎲").setStyle(ButtonStyle.Primary).setDisabled(!expected),
    new ButtonBuilder().setCustomId(`battle_retreat|${view.battle.id}`).setLabel("Geri Çekil").setEmoji("🏳️").setStyle(ButtonStyle.Danger).setDisabled(!expected)
  )];
}

function publicPayload(view: BattleView, result?: Parameters<typeof battleEmbed>[1]) {
  const asset = battlefieldAsset(view.battle.terrain);
  return { embeds: [battleEmbed(view, result)], components: components(view), files: [new AttachmentBuilder(asset.path, { name: asset.name })] };
}

export async function handleBattleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channelId) throw new GameError("Savaş komutları yalnızca bir sunucu kanalında kullanılabilir.");
  const sub = interaction.options.getSubcommand();
  if (sub === "baslat") {
    requireGameMaster(interaction);
    const view = await battleService.create({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      countryAName: interaction.options.getString("taraf-a", true), countryBName: interaction.options.getString("taraf-b", true),
      terrain: interaction.options.getString("arazi", true) as BattleTerrain, narrative: interaction.options.getString("anlatim") ?? "",
      controllerA: interaction.options.getString("kontrol-a", true) as BattleController, controllerB: interaction.options.getString("kontrol-b", true) as BattleController });
    const rosterCommand = view.battle.terrain === "NAVAL" ? "/savas gemi-ayarla" : "/savas birlik-ayarla";
    const supportNote = view.battle.terrain === "SIEGE" ? " Kuşatma aletlerini `/savas kusatma-aleti-ayarla` ile girin." : "";
    await interaction.reply({ content: `✅ Savaş taslağı oluşturuldu. Gizli kadroları \`${rosterCommand}\` ile girin.${supportNote}\nA tarafı ilk turda ${view.battle.first_side === "A" ? "önce" : "sonra"} zar atacak.`, ephemeral: true });
  } else if (sub === "birlik-ayarla") {
    requireGameMaster(interaction);
    const view = await battleService.setUnit({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side: interaction.options.getString("taraf", true) as BattleSideKey, unitType: interaction.options.getString("birim", true) as BattleUnitType,
      quantity: interaction.options.getInteger("miktar", true) });
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    await interaction.reply({ content: `✅ ${side} tarafının gizli kadrosu güncellendi. Açık toplam: **${number(view.sides[side].initial_total)}** • Mühür: \`${view.sides[side].seal}\``, ephemeral: true });
  } else if (sub === "gemi-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const view = await battleService.setUnit({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side, unitType: interaction.options.getString("gemi", true) as NavalUnitType, quantity: interaction.options.getInteger("miktar", true) });
    await interaction.reply({ content: `✅ ${side} tarafının gizli filo kadrosu güncellendi. Açık toplam: **${number(view.sides[side].initial_total)} gemi** • Mühür: \`${view.sides[side].seal}\``, ephemeral: true });
  } else if (sub === "kusatma-aleti-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const view = await battleService.setSupport({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side, assetType: interaction.options.getString("alet", true) as SiegeAssetType, quantity: interaction.options.getInteger("miktar", true) });
    await interaction.reply({ content: `✅ ${side} tarafının gizli kuşatma desteği güncellendi. Mühür: \`${view.sides[side].seal}\``, ephemeral: true });
  } else if (sub === "yayinla") {
    requireGameMaster(interaction);
    const view = await battleService.publish({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id });
    const reply = await interaction.reply({ ...publicPayload(view), fetchReply: true });
    await battleService.setPublicMessage(view.battle.id, reply.id);
  } else if (sub === "tur-oynat") {
    requireGameMaster(interaction);
    const result = await battleService.resolve({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id });
    await interaction.reply(publicPayload(result.view, result.round));
  } else if (sub === "ordu-detay") {
    requireGameMaster(interaction);
    const view = await battleService.active(interaction.guildId, interaction.channelId);
    if (!view) throw new GameError("Bu kanalda etkin savaş yok.");
    const detail = (["A", "B"] as BattleSideKey[]).map((key) => {
      const lines = Object.entries(view.sides[key].composition).filter(([, q]) => (q ?? 0) > 0).map(([unit, q]) => {
        const label = BATTLE_UNIT_STATS[unit as BattleUnitType]?.label ?? NAVAL_UNIT_STATS[unit as NavalUnitType]?.label ?? unit;
        return `• ${label}: **${number(q ?? 0)}**`;
      }).join("\n") || "Birlik veya gemi yok.";
      const support = Object.entries(view.sides[key].support_assets ?? {}).filter(([, q]) => (q ?? 0) > 0)
        .map(([asset, q]) => `• ${SIEGE_ASSET_BATTLE_STATS[asset as SiegeAssetType]?.label ?? asset}: **${number(q ?? 0)}**`).join("\n");
      return `**${key} — ${view.sides[key].country_name}**\n${lines}${support ? `\n**Kuşatma Desteği**\n${support}` : ""}\nBasınç: ${view.sides[key].pressure} • Mühür: \`${view.sides[key].seal}\``;
    }).join("\n\n");
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x333333).setTitle("🔒 Gizli Ordu Detayı").setDescription(detail)], ephemeral: true });
  } else if (sub === "bitir") {
    requireGameMaster(interaction);
    const winnerRaw = interaction.options.getString("galip", true);
    const view = await battleService.finish({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, winner: winnerRaw === "NONE" ? null : winnerRaw as BattleSideKey, reason: interaction.options.getString("neden", true) });
    await interaction.reply(publicPayload(view));
  } else if (sub === "iptal") {
    requireGameMaster(interaction);
    const view = await battleService.cancel({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id });
    await interaction.reply({ embeds: [battleEmbed(view)] });
  }
}

export async function handleBattleButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("battle_")) return false;
  if (!interaction.guildId || !interaction.channelId) throw new GameError("Sunucu veya kanal bulunamadı.");
  const battleId = interaction.customId.split("|")[1];
  if (!battleId) throw new GameError("Savaş düğmesi bozuk.");
  if (interaction.customId.startsWith("battle_roll|")) {
    await interaction.deferReply();
    const result = await battleService.roll({ guildId: interaction.guildId, channelId: interaction.channelId, battleId, actorId: interaction.user.id, isGameMaster: isGameMaster(interaction) });
    const roll = result.view.rolls.find((r) => r.side_key === result.side)!;
    await interaction.editReply({ content: `🎲 <@${interaction.user.id}> **${result.view.sides[result.side].country_name}** adına açık zar attı${result.isProxy ? " **(DM vekili)**" : ""}.\nÇarpışma: **${roll.clash_total}** • Hasar: **${roll.damage_total}**${roll.wall_damage ? ` • Sur Hasarı: **${roll.wall_damage}**` : ""}`, ...publicPayload(result.view) });
  } else if (interaction.customId.startsWith("battle_retreat|")) {
    await interaction.deferReply();
    const result = await battleService.retreat({ guildId: interaction.guildId, channelId: interaction.channelId, battleId, actorId: interaction.user.id, isGameMaster: isGameMaster(interaction) });
    await interaction.editReply({ content: `🏳️ **${result.view.sides[result.side].country_name}** geri çekildi.`, ...publicPayload(result.view) });
  }
  return true;
}

