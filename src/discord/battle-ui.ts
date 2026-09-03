import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type Client } from "discord.js";
import { BATTLE_TERRAINS, BATTLE_UNIT_STATS, LADDER_GROUP_ASSAULT_CAPACITY, MAX_BOMBARDMENTS_PER_GAME_TURN, NAVAL_UNIT_STATS, SIEGE_ASSET_BATTLE_STATS, SIEGE_ASSAULT_FRONTAGE, SIEGE_TOWER_ASSAULT_CAPACITY, orderState, remainingBombardments, siegeAssaultAccess, siegeDefenseModifiers, siegeOrderState, type BattleController, type BattleForceType, type BattleSideKey, type BattleTerrain, type BattleUnitType, type NavalUnitType, type SiegeAssetType, type SiegeTarget } from "../domain/battle.js";
import { number } from "../domain/format.js";
import { battleService, type BattleRoundResult, type BattleView, type SiegePhase } from "../services/battle-service.js";
import { GameError } from "../services/game-service.js";
import { isGameMaster, requireGameMaster } from "./auth.js";
import { battlefieldAsset } from "./assets.js";

const statusLabels: Record<string, string> = {
  DRAFT: "Taslak", WAITING_FIRST_ROLL: "İlk tarafın zarı bekleniyor", WAITING_SECOND_ROLL: "İkinci tarafın zarı bekleniyor",
  READY_TO_RESOLVE: "Yönetici tur çözümünü bekliyor", FINISHED: "Sona erdi", CANCELLED: "İptal edildi"
};
const orderLabels: Record<string, string> = { ORDERED: "Düzenli", WORN: "Baskı Altında", SHAKEN: "Sarsılmış", CRITICAL: "Kritik Hat", BROKEN: "Dağılmış" };
const tierLabels: Record<string, string> = { BALANCED: "Dengeli Çarpışma", MINOR: "Hafif Üstünlük", CLEAR: "Belirgin Üstünlük", CRUSHING: "Ezici Üstünlük" };

function expectedSide(view: BattleView): BattleSideKey | null {
  if (!["WAITING_FIRST_ROLL", "WAITING_SECOND_ROLL"].includes(view.battle.status)) return null;
  return view.rolls.length ? view.battle.first_side === "A" ? "B" : "A" : view.battle.first_side;
}

export function battleEmbed(view: BattleView, roundResult?: BattleRoundResult): EmbedBuilder {
  const terrain = BATTLE_TERRAINS[view.battle.terrain];
  const sideField = (key: BattleSideKey) => {
    const side = view.sides[key];
    const order = view.battle.terrain === "SIEGE"
      ? siegeOrderState(side.pressure, side.current_total)
      : orderState(side.pressure, side.initial_total, side.current_total);
    const control = side.controller === "GM" ? "Oyun Yöneticisi (NPC)" : "Ülke Oyuncuları";
    if (view.battle.terrain === "SIEGE" && key === "B") return `**Toplam Asker:** Gizli\n**Toplam Kayıp:** ${number(side.total_losses)}\n**Baskı:** ${number(side.pressure)} puan\n**Düzen:** ${orderLabels[order]}\n**Zar Yetkisi:** ${control}`;
    return `**Başlangıç:** ${number(side.initial_total)}\n**Mevcut:** ${number(side.current_total)}\n**Toplam Kayıp:** ${number(side.total_losses)}\n**Baskı:** ${number(side.pressure)} puan\n**Düzen:** ${orderLabels[order]}\n**Zar Yetkisi:** ${control}`;
  };
  const frontage = view.battle.terrain === "NAVAL"
    ? `Filo kapasitesi: ${view.sides.A.country_name} ${number(terrain.frontageA)} • ${view.sides.B.country_name} ${number(terrain.frontageB)} gemi`
    : terrain.frontageA === terrain.frontageB
      ? `Cephe kapasitesi: ${number(terrain.frontageA)} asker`
      : `Cephe kapasitesi: ${view.sides.A.country_name} ${number(terrain.frontageA)} • ${view.sides.B.country_name} ${number(terrain.frontageB)} asker`;
  const siegeStage = view.battle.terrain === "SIEGE"
    ? view.battle.siege_phase === "BOMBARDMENT"
      ? `\n**Kuşatma Durumu:** Bombardıman — ordular temas etmiyor\n**Toplam Bombardıman:** ${view.battle.bombardment_round}\n**Oyun Turu ${view.battle.game_turn ?? 0}:** ${view.battle.bombardments_this_turn ?? 0}/${MAX_BOMBARDMENTS_PER_GAME_TURN} kullanıldı • ${remainingBombardments(view.battle.bombardments_this_turn ?? 0)} hak kaldı`
      : "\n**Kuşatma Durumu:** Hücum — ordular temas hâlinde"
    : "";
  const embed = new EmbedBuilder().setColor(view.battle.status === "FINISHED" ? 0x8b1a1a : 0xb68b36)
    .setTitle(`⚔️ ${view.sides.A.country_name} — ${view.sides.B.country_name}`)
    .setDescription(view.battle.narrative || "İki ordu savaş alanında karşı karşıya geldi.")
    .addFields(
      { name: "🗺️ Savaş Alanı", value: `${terrain.label}\n${frontage}`, inline: false },
      { name: `🟥 ${view.sides.A.country_name}`, value: sideField("A"), inline: true },
      { name: `🟦 ${view.sides.B.country_name}`, value: sideField("B"), inline: true },
      { name: "📜 Durum", value: `**Savaş Turu:** ${view.battle.round_number}\n**Aşama:** ${statusLabels[view.battle.status] ?? view.battle.status}${siegeStage}`, inline: false }
    );
  if (view.battle.terrain === "AMBUSH") embed.addFields({ name: "🌲 Pusu Düzeni", value: "A tarafı pusuyu kuran taraftır. İlk turda çarpışma +%25 ve hasar +%10 uygulanır." });
  if (view.battle.terrain === "SIEGE") {
    const wallOpen = (view.battle.wall_current_hp ?? 0) === 0, gateOpen = (view.battle.gate_current_hp ?? 0) === 0;
    const access = siegeAssaultAccess(view.sides.A.support_assets, SIEGE_ASSAULT_FRONTAGE);
    const ladders = Math.max(0, Math.floor(view.sides.A.support_assets.ladder_group ?? 0));
    const towers = Math.max(0, Math.floor(view.sides.A.support_assets.siege_tower ?? 0));
    const breached = wallOpen || gateOpen;
    const accessNote = breached
      ? "**Gedik veya kapı açık:** Erişim sınırı kalktı; normal kuşatma cephesi uygulanır."
      : view.battle.siege_phase === "BOMBARDMENT"
        ? `**Hücum başlatılırsa doğrudan sur hücumuna katılabilecek azami piyade:** ${number(access.capacity)}`
        : `**Bu tur doğrudan sur hücumuna katılabilecek azami piyade:** ${number(access.capacity)}`;
    embed.addFields(
      { name: "🏰 Tahkimatlar", value: `**Sur:** ${number(view.battle.wall_current_hp ?? 0)} / ${number(view.battle.wall_max_hp ?? 0)} HP${wallOpen ? " — Yıkıldı" : ""}\n**Kapı:** ${number(view.battle.gate_current_hp ?? 0)} / ${number(view.battle.gate_max_hp ?? 0)} HP${gateOpen ? " — Kırıldı" : ""}\n**Erzak Dayanıklılığı:** ${number(view.battle.starvation_remaining ?? 0)} / ${number(view.battle.starvation_capacity ?? 0)} oyun turu${view.battle.starvation_capacity !== null && view.battle.starvation_remaining === 0 ? " — Erzak tükendi; yönetici sonucu belirler." : ""}` },
      { name: "🪜 Hücum Erişimi", value: `**Merdiven Grupları:** ${number(access.activeLadderGroups)} / ${number(ladders)} aktif → ${number(access.activeLadderGroups * LADDER_GROUP_ASSAULT_CAPACITY)}\n**Kuşatma Kuleleri:** ${number(access.activeSiegeTowers)} / ${number(towers)} aktif → ${number(access.activeSiegeTowers * SIEGE_TOWER_ASSAULT_CAPACITY)}\n**Toplam Hücum Kapasitesi:** ${number(access.capacity)} / ${number(SIEGE_ASSAULT_FRONTAGE)}
${accessNote}` }
    );
  }
  embed.setImage(`attachment://${terrain.preset}`).setFooter({ text: "Tam birlik kompozisyonu yalnızca oyun yöneticisine görünür." }).setTimestamp();
  const activeDefense = siegeDefenseModifiers(view.battle.wall_current_hp ?? 0, view.battle.gate_current_hp ?? 0);
  const factor = (value: number) => value.toFixed(2).replace(".", ",");
  const rolls = view.rolls.map((roll) => {
    const actor = `<@${roll.roller_user_id}>${roll.is_proxy ? " (DM vekili)" : ""}`;
    const structureDamage = `${roll.wall_damage ? ` • Sur Hasarı **${roll.wall_damage}**` : ""}${roll.gate_damage ? ` • Kapı Hasarı **${roll.gate_damage}**` : ""}`;
    const counter = roll.detail?.__spear_cavalry;
    const counterSummary = counter?.matched ? `\n↳ **Mızrak Karşılığı:** ${number(counter.matched)} süvari eşleşti • +${number(counter.clashBonus ?? 0)} Çarpışma • +${number(counter.antiCavalryDamage ?? 0)} süvariye özel Hasar` : "";
    const commander = roll.detail?.__commander;
    const commanderSummary = commander?.clash ? `\n↳ **Komutan Bonusu:** +${number(commander.clash)} Çarpışma` : "";
    if (view.battle.terrain === "SIEGE" && roll.side_key === "B") {
      return `**${view.sides.B.country_name} — Ham Zar:** Çarpışma **${roll.clash_total}** • Hasar **${roll.damage_total}** • ${actor}${commanderSummary}\n↳ **Tahkimat Sonrası:** Çarpışma **${Math.ceil(roll.clash_total * activeDefense.defenderClash)}** (×${factor(activeDefense.defenderClash)}) • Hasar **${Math.ceil(roll.damage_total * activeDefense.defenderDamage)}** (×${factor(activeDefense.defenderDamage)})`;
    }
    return `**${view.sides[roll.side_key].country_name}:** Çarpışma **${roll.clash_total}** • Hasar **${roll.damage_total}**${structureDamage} • ${actor}${counterSummary}${commanderSummary}`;
  }).join("\n");
  if (rolls) embed.addFields({ name: "🎲 Açık Zar Kayıtları", value: rolls });
  if (roundResult) {
    const winner = roundResult.winner ? view.sides[roundResult.winner].country_name : "Yok";
    const pressureWinner = roundResult.pressureWinner ? view.sides[roundResult.pressureWinner].country_name : "Yok";
    embed.addFields({ name: `⚔️ Tur Sonucu — ${tierLabels[roundResult.tier] ?? roundResult.tier}`, value: `Kayıp hesabındaki üstün taraf: **${winner}**\nBaskı üstünlüğü: **${pressureWinner}** (${tierLabels[roundResult.pressureTier] ?? roundResult.pressureTier})\n${view.sides.A.country_name}: **-${number(roundResult.lossA)}** • Baskı **${number(roundResult.pressureA)}/8** • ${orderLabels[roundResult.orderA]}\n${view.sides.B.country_name}: **-${number(roundResult.lossB)}** • Baskı **${number(roundResult.pressureB)}/8** • ${orderLabels[roundResult.orderB]}${roundResult.wallDamage ? `\nSurlara verilen hasar: **${number(roundResult.wallDamage)}**` : ""}${roundResult.gateDamage ? `\nKapıya verilen hasar: **${number(roundResult.gateDamage)}**` : ""}` });
    if (view.battle.terrain === "SIEGE") {
      embed.addFields({
        name: "🛡️ Savunucu Zar Hesabı",
        value: `**Ham Zar:** Çarpışma **${number(roundResult.defenderRawClash)}** • Hasar **${number(roundResult.defenderRawDamage)}**\n**Tahkimat Sonrası:** Çarpışma **${number(roundResult.defenderEffectiveClash)}** (×${factor(roundResult.defenderClashMultiplier)}) • Hasar **${number(roundResult.defenderEffectiveDamage)}** (×${factor(roundResult.defenderDamageMultiplier)})\n*Baskı ham Çarpışma zarından; kayıp hesabı tahkimat sonrası değerlerden yapılır.*`
      });
    }
  }
  if (view.battle.status === "FINISHED") embed.addFields({ name: "🏁 Savaş Sonu", value: `${view.battle.winner_side ? `Galip: **${view.sides[view.battle.winner_side].country_name}**` : "Sonuç: **Berabere / kararsız**"}\n${view.battle.finish_reason ?? ""}` });
  return embed;
}

function components(view: BattleView) {
  if (["FINISHED", "CANCELLED", "DRAFT"].includes(view.battle.status)) return [];
  const expected = expectedSide(view);
  if (view.battle.terrain === "SIEGE" && view.battle.siege_phase === "BOMBARDMENT") return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`battle_bombard|${view.battle.id}`).setLabel(((view.battle.bombardments_this_turn ?? 0) >= MAX_BOMBARDMENTS_PER_GAME_TURN ? "Bombardıman Hakkı Doldu" : `${view.sides.A.country_name} Katapult Bombardımanı Yap`).slice(0, 80)).setEmoji("💥").setStyle(ButtonStyle.Primary).setDisabled((view.battle.bombardments_this_turn ?? 0) >= MAX_BOMBARDMENTS_PER_GAME_TURN),
    new ButtonBuilder().setCustomId(`battle_retreat|${view.battle.id}`).setLabel("Geri Çekil").setEmoji("🏳️").setStyle(ButtonStyle.Danger)
  )];
  const label = expected ? `${view.sides[expected].country_name} Savaş Zarlarını At` : "Tur Çözümü Bekleniyor";
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`battle_roll|${view.battle.id}`).setLabel(label).setEmoji("🎲").setStyle(ButtonStyle.Primary).setDisabled(!expected),
    new ButtonBuilder().setCustomId(`battle_retreat|${view.battle.id}`).setLabel("Geri Çekil").setEmoji("🏳️").setStyle(ButtonStyle.Danger).setDisabled(!expected)
  )];
}
export async function refreshActiveBattleCards(client: Client, guildId: string): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;
  try {
    for (const view of await battleService.activeForGuild(guildId)) {
      if (!view.battle.public_message_id) continue;
      try {
        const channel = await client.channels.fetch(view.battle.channel_id);
        if (!channel?.isTextBased() || channel.isDMBased() || !("messages" in channel)) { failed += 1; continue; }
        const message = await channel.messages.fetch(view.battle.public_message_id);
        await message.edit(publicPayload(view));
        updated += 1;
      } catch (error) {
        failed += 1;
        console.error("Aktif savaş kartı yenilenemedi", { battleId: view.battle.id, error });
      }
    }
  } catch (error) {
    failed += 1;
    console.error("Aktif savaşlar tur değişiminde listelenemedi", error);
  }
  return { updated, failed };
}
function publicPayload(view: BattleView, result?: Parameters<typeof battleEmbed>[1]) {
  const asset = battlefieldAsset(view.battle.terrain);
  return { embeds: [battleEmbed(view, result)], components: components(view), files: [new AttachmentBuilder(asset.path, { name: asset.name })] };
}

async function refreshBattleCard(client: Client, view: BattleView): Promise<boolean> {
  if (!view.battle.public_message_id) return false;
  try {
    const channel = await client.channels.fetch(view.battle.channel_id);
    if (!channel?.isTextBased() || channel.isDMBased() || !("messages" in channel)) return false;
    const message = await channel.messages.fetch(view.battle.public_message_id);
    await message.edit(publicPayload(view));
    return true;
  } catch (error) {
    console.error("Savaş kartı güncellenemedi", { battleId: view.battle.id, error });
    return false;
  }
}

function casualtyReportEmbed(view: BattleView, rows: Array<{ side_key: BattleSideKey; force_type: string; calculated_loss: number; applied_loss: number; shortfall: number; mercenary_loss_applied: number; population_loss_applied: number; population_shortfall: number }>): EmbedBuilder {
  const lineFor = (row: typeof rows[number]) => {
    const naval = row.force_type in NAVAL_UNIT_STATS;
    const label = BATTLE_UNIT_STATS[row.force_type as BattleUnitType]?.label ?? NAVAL_UNIT_STATS[row.force_type as NavalUnitType]?.label ?? row.force_type;
    const personnelLabel = naval ? "mürettebat/nüfus" : "nüfus";
    return `• ${label}: hesaplanan **${number(row.calculated_loss)}** • birlikten düşülen **${number(row.applied_loss)}**${row.mercenary_loss_applied ? ` • paralı askerden **-${number(row.mercenary_loss_applied)}**` : ""}${row.shortfall ? ` • ⚠️ birlik açığı **${number(row.shortfall)}**` : ""}${row.population_loss_applied ? ` • ${personnelLabel} **-${number(row.population_loss_applied)}**` : ""}${row.population_shortfall ? ` • ⚠️ ${personnelLabel} açığı **${number(row.population_shortfall)}**` : ""}`;
  };
  const text = (["A", "B"] as BattleSideKey[]).map((side) => {
    const sideRows = rows.filter((row) => row.side_key === side);
    return `**${side} — ${view.sides[side].country_name}**\n${sideRows.length ? sideRows.map(lineFor).join("\n") : "Kayıp yok."}`;
  }).join("\n\n");
  const shortfall = rows.reduce((sum, row) => sum + row.shortfall + row.population_shortfall, 0);
  return new EmbedBuilder().setColor(shortfall ? 0xd9822b : 0x2e8b57).setTitle("🔒 Savaş Kayıpları — Belge Mutabakatı")
    .setDescription(`${text}\n\n${shortfall ? "⚠️ Mutabakat açığı bulunan miktarlar belgede mevcut olmadığı için otomatik düşülemedi." : "✅ Hesaplanan bütün kayıplar ülke belgelerine otomatik işlendi."}`)
    .setFooter({ text: "Bu rapor yalnızca oyun yöneticilerine gösterilir." });
}
export async function handleBattleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channelId) throw new GameError("Savaş komutları yalnızca bir sunucu kanalında kullanılabilir.");
  const sub = interaction.options.getSubcommand();
  if (sub === "baslat") {
    requireGameMaster(interaction);
    const view = await battleService.create({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      countryAName: interaction.options.getString("taraf-a", true), countryBName: interaction.options.getString("taraf-b", true),
      terrain: interaction.options.getString("arazi", true) as BattleTerrain, narrative: interaction.options.getString("anlatim") ?? "",
      controllerA: interaction.options.getString("kontrol-a", true) as BattleController, controllerB: interaction.options.getString("kontrol-b", true) as BattleController,
      defenderSettlementName: interaction.options.getString("savunulan-yerleske") });
    const rosterCommand = view.battle.terrain === "NAVAL" ? "/savas filo-ayarla" : "/savas kadro-ayarla";
    const supportNote = view.battle.terrain === "SIEGE" ? " Kuşatma aletlerini `/savas kusatma-aleti-ayarla` ile girin." : "";
    await interaction.reply({ content: `✅ Savaş taslağı oluşturuldu. Gizli kadroları \`${rosterCommand}\` ile girin.${supportNote}\nA tarafı ilk turda ${view.battle.first_side === "A" ? "önce" : "sonra"} zar atacak.`, ephemeral: true });
  } else if (sub === "taraf-ulke") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const action = interaction.options.getString("islem", true) as "ADD" | "REMOVE";
    const countryName = interaction.options.getString("ulke", true);
    const view = await battleService.setParticipant({
      guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side, action, countryName
    });
    await interaction.reply({
      content: "✅ **" + countryName + "** " + (action === "ADD" ? "savaş tarafına eklendi" : "savaş tarafından çıkarıldı") + ". **" + side + " tarafı:** " + view.sides[side].country_names.join(", "),
      ephemeral: true
    });
  } else if (sub === "birlik-ayarla") {
    requireGameMaster(interaction);
    const view = await battleService.setUnit({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side: interaction.options.getString("taraf", true) as BattleSideKey, unitType: interaction.options.getString("birim", true) as BattleUnitType,
      quantity: interaction.options.getInteger("miktar", true), countryName: interaction.options.getString("ulke") });
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    await interaction.reply({ content: `✅ ${side} tarafının gizli kadrosu güncellendi. Açık toplam: **${number(view.sides[side].initial_total)}**`, ephemeral: true });
  } else if (sub === "kadro-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const countryName = interaction.options.getString("ulke");
    const sourceSettlement = interaction.options.getString("yerleske");
    const view = await battleService.setRoster({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, side, naval: false, countryName, sourceSettlement,
      composition: {
        light_infantry: interaction.options.getInteger("hafif-piyade", true), slinger: interaction.options.getInteger("sapanci", true),
        spear: interaction.options.getInteger("mizrakli", true), archer: interaction.options.getInteger("okcu", true),
        heavy_infantry: interaction.options.getInteger("agir-piyade", true), light_cavalry: interaction.options.getInteger("hafif-suvari", true),
        heavy_cavalry: interaction.options.getInteger("agir-suvari", true), militia: interaction.options.getInteger("milis") ?? 0,
        legionary: interaction.options.getInteger("lejyoner") ?? 0, hoplite: interaction.options.getInteger("hoplit") ?? 0,
        horse_archer: interaction.options.getInteger("atli-okcu") ?? 0, camel_cavalry: interaction.options.getInteger("deve-suvarisi") ?? 0,
        briton_longbow: interaction.options.getInteger("briton-uzun-yayci") ?? 0,
        persian_immortal: interaction.options.getInteger("pers-olumsuzleri") ?? 0,
        carthaginian_war_elephant: interaction.options.getInteger("kartaca-savas-fili") ?? 0,
        iberian_caetrati: interaction.options.getInteger("iber-caetratileri") ?? 0,
        germanic_shock_warrior: interaction.options.getInteger("cermen-sok-savascisi") ?? 0
      } });
    const participant = countryName?.trim()
      ? view.sides[side].participants.find((item) => item.country_name.toLocaleLowerCase("tr-TR") === countryName.trim().toLocaleLowerCase("tr-TR"))
      : view.sides[side].participants.find((item) => item.is_primary);
    const lossSource = participant?.source_settlement_name
      ? `**${participant.source_settlement_name}**; kayıplar yalnızca bu yerleşkeden düşülecek.`
      : "**Ülke geneli**; kayıplar mevcut oransal dağıtımla düşülecek.";
    await interaction.reply({ content: `✅ ${side} tarafının bütün kara kadrosu tek işlemde kaydedildi. Açık toplam: **${number(view.sides[side].initial_total)}**\n📍 Kayıp kaynağı: ${lossSource}`, ephemeral: true });
  } else if (sub === "gemi-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const view = await battleService.setUnit({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side, unitType: interaction.options.getString("gemi", true) as NavalUnitType, quantity: interaction.options.getInteger("miktar", true), countryName: interaction.options.getString("ulke") });
    await interaction.reply({ content: `✅ ${side} tarafının gizli filo kadrosu güncellendi. Açık toplam: **${number(view.sides[side].initial_total)} gemi**`, ephemeral: true });
  } else if (sub === "filo-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const view = await battleService.setRoster({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, side, naval: true, countryName: interaction.options.getString("ulke"),
      composition: { kerkouros: interaction.options.getInteger("kerkouros", true), trireme: interaction.options.getInteger("trireme", true), quinquereme: interaction.options.getInteger("quinquereme", true) } });
    await interaction.reply({ content: `✅ ${side} tarafının bütün filosu tek işlemde kaydedildi. Açık toplam: **${number(view.sides[side].initial_total)} gemi**`, ephemeral: true });
  } else if (sub === "kusatma-aleti-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const view = await battleService.setSupport({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side, assetType: interaction.options.getString("alet", true) as SiegeAssetType, target: interaction.options.getString("hedef", true) as SiegeTarget, quantity: interaction.options.getInteger("miktar", true) });
    await interaction.reply({ content: `✅ ${side} tarafının gizli kuşatma desteği güncellendi. Hedef: **${interaction.options.getString("hedef", true)}**`, ephemeral: true });
  } else if (sub === "parali-asker-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const action = interaction.options.getString("islem", true) as "ADD" | "REMOVE";
    const view = await battleService.setMercenaryAssignment({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, side, action, companyKey: interaction.options.getString("sirket", true) });
    await interaction.reply({ content: `✅ Paralı asker şirketi ${action === "ADD" ? "savaş taslağına eklendi" : "savaş taslağından çıkarıldı"}. ${side} tarafının açık toplamı: **${number(view.sides[side].initial_total)}**`, ephemeral: true });
  } else if (sub === "saha-aleti-al") {
    const assetType = interaction.options.getString("alet", true) as "ladder_group" | "ram";
    const quantity = interaction.options.getInteger("miktar", true);
    const result = await battleService.purchaseFieldSiegeAsset({
      guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      isGameMaster: isGameMaster(interaction), settlementName: interaction.options.getString("yerleske", true),
      assetType, quantity
    });
    const assetName = SIEGE_ASSET_BATTLE_STATS[assetType].label;
    await refreshBattleCard(interaction.client, result.view);
    await interaction.reply({
      content: `🛠️ **${result.view.sides.A.country_name}**, **${result.settlementName}** hazinesinden **${number(result.cost)} Altın** ödeyerek ${quantity} **${assetName}** hazırladı. Alet kuşatma düzenine anında eklendi; mevcut savaş kartı güncellendi.`,
      ephemeral: true
    });
  } else if (sub === "kusatma-asamasi") {
    requireGameMaster(interaction);
    const result = await battleService.setSiegePhase({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, phase: interaction.options.getString("asama", true) as SiegePhase });
    const label = result.view.battle.siege_phase === "BOMBARDMENT" ? "Bombardıman — ordular temas etmiyor" : "Hücum — savaş zarları açıldı";
    if (result.shouldReveal) {
      const reply = await interaction.reply({ content: `🏰 Kuşatma durumu **${label}** olarak değiştirildi.`, ...publicPayload(result.view), fetchReply: true });
      await battleService.setPublicMessage(result.view.battle.id, reply.id);
    } else {
      await refreshBattleCard(interaction.client, result.view);
      await interaction.reply({ content: `✅ Kuşatma durumu **${label}** olarak değiştirildi; bu aşama daha önce duyurulduğu için yeni savaş kartı gönderilmedi.`, ephemeral: true });
    }
  } else if (sub === "bombardiman") {
    requireGameMaster(interaction);
    const result = await battleService.bombard({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, isGameMaster: true });
    await refreshBattleCard(interaction.client, result.view);
    await interaction.reply({ content: `💥 **${result.catapultCount} Katapult** surları bombardımana tuttu. Sur hasarı: **${number(result.wallDamage)}**. Ordular temas etmedi; asker kaybı ve baskı oluşmadı. Güncel durum mevcut savaş kartına işlendi.` });
  } else if (sub === "yayinla") {
    requireGameMaster(interaction);
    const view = await battleService.publish({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id });
    const reply = await interaction.reply({ ...publicPayload(view), fetchReply: true });
    await battleService.setPublicMessage(view.battle.id, reply.id);
  } else if (sub === "tur-oynat") {
    requireGameMaster(interaction);
    const result = await battleService.resolve({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id });
    await interaction.reply(publicPayload(result.view, result.round));
    if (result.round.ended) await interaction.followUp({ embeds: [casualtyReportEmbed(result.view, result.report)], ephemeral: true });
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
        .map(([asset, q]) => `• ${SIEGE_ASSET_BATTLE_STATS[asset as SiegeAssetType]?.label ?? asset}: **${number(q ?? 0)}** • Hedef: **${view.sides[key].support_targets?.[asset as SiegeAssetType] ?? "ASSAULT"}**`).join("\n");
      return `**${key} — ${view.sides[key].country_name}**\n${lines}${support ? `\n**Kuşatma Desteği**\n${support}` : ""}\nBasınç: ${view.sides[key].pressure}`;
    }).join("\n\n");
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x333333).setTitle("🔒 Gizli Ordu Detayı").setDescription(detail)], ephemeral: true });
  } else if (sub === "kayip-raporu") {
    requireGameMaster(interaction);
    const result = await battleService.casualtyReport(interaction.guildId, interaction.channelId);
    await interaction.reply({ embeds: [casualtyReportEmbed(result.view, result.rows)], ephemeral: true });
  } else if (sub === "bitir") {
    requireGameMaster(interaction);
    const winnerRaw = interaction.options.getString("galip", true);
    const result = await battleService.finish({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, winner: winnerRaw === "NONE" ? null : winnerRaw as BattleSideKey, reason: interaction.options.getString("neden", true) });
    await interaction.reply(publicPayload(result.view));
    await interaction.followUp({ embeds: [casualtyReportEmbed(result.view, result.report)], ephemeral: true });
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
    await interaction.editReply({ content: `🎲 <@${interaction.user.id}> **${result.view.sides[result.side].country_name}** adına açık zar attı${result.isProxy ? " **(DM vekili)**" : ""}.\nÇarpışma: **${roll.clash_total}** • Hasar: **${roll.damage_total}**${roll.wall_damage ? ` • Sur Hasarı: **${roll.wall_damage}**` : ""}${roll.gate_damage ? ` • Kapı Hasarı: **${roll.gate_damage}**` : ""}`, ...publicPayload(result.view) });
  } else if (interaction.customId.startsWith("battle_bombard|")) {
    await interaction.deferReply();
    const result = await battleService.bombard({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, isGameMaster: isGameMaster(interaction) });
    await interaction.editReply({ content: `💥 <@${interaction.user.id}> **${result.view.sides.A.country_name}** adına ${result.catapultCount} Katapult ile açık bombardıman zarı attı${result.isProxy ? " **(DM vekili)**" : ""}. Sur hasarı: **${number(result.wallDamage)}**. Ordular temas etmedi; asker kaybı ve baskı oluşmadı.`, ...publicPayload(result.view) });
  } else if (interaction.customId.startsWith("battle_retreat|")) {
    await interaction.deferReply();
    const result = await battleService.retreat({ guildId: interaction.guildId, channelId: interaction.channelId, battleId, actorId: interaction.user.id, isGameMaster: isGameMaster(interaction) });
    const retreatText = result.retreatLoss ? ` Takip sırasında **${number(result.retreatLoss)}** ek kayıp verdi.` : " İlk savaş turunda çekildiği için ek kayıp yaşamadı.";
    await interaction.editReply({ content: `🏳️ **${result.view.sides[result.side].country_name}** geri çekildi.${retreatText}`, ...publicPayload(result.view) });
  }
  return true;
}
