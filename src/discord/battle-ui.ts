import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ChatInputCommandInteraction, type Client, type ModalSubmitInteraction, type StringSelectMenuInteraction } from "discord.js";
import { BATTLE_TERRAINS, BATTLE_UNIT_STATS, FIELD_BATTLE_PRESSURE_LIMIT, LADDER_GROUP_ASSAULT_CAPACITY, MAX_BOMBARDMENTS_PER_GAME_TURN, NAVAL_UNIT_STATS, SIEGE_ASSET_BATTLE_STATS, SIEGE_ASSAULT_FRONTAGE, SIEGE_ATTACKER_DISMOUNT_MAP, SIEGE_PRESSURE_LIMIT, SIEGE_TOWER_ASSAULT_CAPACITY, assessArmyComposition, orderState, remainingBombardments, siegeAssaultAccess, siegeAttackerDismountedComposition, siegeDefenderComposition, siegeDefenderReserveBonus, siegeDefenseModifiers, siegeFrontageProfile, siegeOrderState, type ArmyCompositionContext, type BattleComposition, type BattleController, type BattleForceType, type BattleSideKey, type BattleTerrain, type BattleUnitType, type NavalUnitType, type SiegeAssetType, type SiegeDismountUnitType, type SiegeTarget } from "../domain/battle.js";
import { NAVAL_BATTLE_ORDERS, isNavalRetreatOrder, navalFleetCondition, type NavalBattleOrder } from "../domain/naval-tactics.js";
import { SPECIAL_UNITS } from "../domain/special-units.js";
import { number } from "../domain/format.js";
import { battleService, type BattleRoundResult, type BattleView, type PlayerBattleFleetStatus, type SiegePhase } from "../services/battle-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { armyService } from "../services/army-service.js";
import { fleetService } from "../services/fleet-service.js";
import { isGameMaster, requireGameMaster } from "./auth.js";
import { battlefieldAsset } from "./assets.js";
import { renderArmyEmbed } from "./army-embed.js";
import { renderFleetEmbed } from "./fleet-embed.js";
import { publishCharacterTurnLogs } from "./character-ui.js";
import { batchDocumentEmbeds } from "./document.js";

const statusLabels: Record<string, string> = {
  DRAFT: "Taslak", WAITING_FIRST_ROLL: "İlk tarafın zarı bekleniyor", WAITING_SECOND_ROLL: "İkinci tarafın zarı bekleniyor",
  READY_TO_RESOLVE: "Yönetici tur çözümünü bekliyor", FINISHED: "Sona erdi", CANCELLED: "İptal edildi"
};
const orderLabels: Record<string, string> = { ORDERED: "Düzenli", WORN: "Baskı Altında", SHAKEN: "Sarsılmış", CRITICAL: "Kritik Hat", BROKEN: "Dağılmış" };
const tierLabels: Record<string, string> = { BALANCED: "Dengeli Çarpışma", MINOR: "Hafif Üstünlük", CLEAR: "Belirgin Üstünlük", CRUSHING: "Ezici Üstünlük" };
const navalConditionLabels = { OPERATIONAL:"Savaşabilir", DAMAGED:"Hasarlı", CRITICAL:"Zorunlu geri çekilme", OUT:"Savaş dışı" } as const;

function currentCompositionLabel(view: BattleView, side: BattleSideKey): string {
  const context: ArmyCompositionContext = view.battle.terrain === "SIEGE" ? "SIEGE_RESTRICTED" : "FIELD";
  const selectedDismountments: BattleComposition = {};
  if (view.battle.terrain === "SIEGE" && side === "A") {
    for (const participant of view.sides.A.participants) {
      for (const source of Object.keys(SIEGE_ATTACKER_DISMOUNT_MAP) as SiegeDismountUnitType[]) {
        selectedDismountments[source] = (selectedDismountments[source] ?? 0) + Number(participant.dismounted_composition?.[source] ?? 0);
      }
    }
  }
  const composition: BattleComposition = view.battle.terrain === "SIEGE" && side === "B"
    ? siegeDefenderComposition(view.sides[side].composition)
    : view.battle.terrain === "SIEGE" && side === "A"
      ? siegeAttackerDismountedComposition(view.sides.A.composition, selectedDismountments)
      : view.sides[side].composition;
  return assessArmyComposition(composition,context).label;
}

function expectedSide(view: BattleView): BattleSideKey | null {
  if (!["WAITING_FIRST_ROLL", "WAITING_SECOND_ROLL"].includes(view.battle.status)) return null;
  if (view.battle.terrain === "SIEGE") return view.rolls.length ? "B" : "A";
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
    if (view.battle.terrain === "SIEGE" && key === "B") return `**Toplam Asker:** Gizli\n**Otomatik Garnizon:** Dahil\n**Toplam Kayıp:** ${number(side.total_losses)}\n**Baskı:** ${number(side.pressure)} puan\n**Düzen:** ${orderLabels[order]}\n**Zar Yetkisi:** ${control}`;
    if(view.battle.terrain==="NAVAL"){
      const condition=navalFleetCondition({
        initialHullHp:side.initial_hull_hp??0,operationalHullHp:side.operational_hull_hp??0,
        initialShips:side.initial_total,activeShips:side.active_ship_total??0,
        disabledShips:side.disabled_ship_total??0,sunkShips:side.sunk_ship_total??0
      });
      const bothLocked=view.sides.A.naval_order_locked&&view.sides.B.naval_order_locked;
      const orderStateLabel=side.naval_order_locked
        ? bothLocked&&side.naval_order?NAVAL_BATTLE_ORDERS[side.naval_order].label:"Kilitli • Gizli"
        : side.naval_order?"Seçildi • Kilit bekliyor":"Henüz seçilmedi";
      return `**Başlangıç:** ${number(side.initial_total)} gemi\n**Savaşabilir:** ${number(side.active_ship_total??0)}\n**İş göremez:** ${number(side.disabled_ship_total??0)}\n**Batık:** ${number(side.sunk_ship_total??0)}\n**Savaşabilir HP:** ${number(side.operational_hull_hp??0)} / ${number(side.initial_hull_hp??0)}\n**Filo Durumu:** ${navalConditionLabels[condition]}\n**Manevra Puanı:** ${number(side.naval_maneuver_points??0)}/5\n**Filo Emri:** ${orderStateLabel}\n**Zar Yetkisi:** ${control}`;
    }
    return `**Başlangıç:** ${number(side.initial_total)}\n**Mevcut:** ${number(side.current_total)}\n**Toplam Kayıp:** ${number(side.total_losses)}\n**Baskı:** ${number(side.pressure)} puan\n**Düzen:** ${orderLabels[order]}\n**Zar Yetkisi:** ${control}`;
  };
  const siegeProfile = view.battle.terrain === "SIEGE"
    ? siegeFrontageProfile(view.battle.wall_current_hp ?? 0, view.battle.gate_current_hp ?? 0)
    : null;
  const frontage = view.battle.terrain === "NAVAL"
    ? "Cephe sınırı yok: iki tarafın bütün savaşabilir gemileri çatışmaya katılır."
    : siegeProfile
      ? `Saldıran: ${number(siegeProfile.attackerInfantry)} piyade + ${number(siegeProfile.attackerRanged)} menzilli • Savunan: ${number(siegeProfile.defenderInfantry)} piyade + ${number(siegeProfile.defenderRanged)} menzilli`
    : terrain.frontageA === terrain.frontageB
      ? `Cephe kapasitesi: ${number(terrain.frontageA)} asker`
      : `Cephe kapasitesi: ${view.sides.A.country_name} ${number(terrain.frontageA)} • ${view.sides.B.country_name} ${number(terrain.frontageB)} asker`;
  const siegeStage = view.battle.terrain === "SIEGE"
    ? view.battle.siege_phase === "BOMBARDMENT"
      ? `\n**Kuşatma Durumu:** Bombardıman — ordular temas etmiyor\n**Toplam Bombardıman:** ${view.battle.bombardment_round}\n**Oyun Turu ${view.battle.game_turn ?? 0}:** ${view.battle.bombardments_this_turn ?? 0}/${MAX_BOMBARDMENTS_PER_GAME_TURN} kullanıldı • ${remainingBombardments(view.battle.bombardments_this_turn ?? 0)} hak kaldı`
      : "\n**Kuşatma Durumu:** Hücum — ordular temas hâlinde"
    : "";
  const navalStage=view.battle.terrain==="NAVAL"&&!["FINISHED","CANCELLED"].includes(view.battle.status)
    ? !view.sides.A.naval_order_locked||!view.sides.B.naval_order_locked
      ? "Gizli filo emirleri bekleniyor"
      : isNavalRetreatOrder(view.sides.A.naval_order)||isNavalRetreatOrder(view.sides.B.naval_order)
        ? "Yönetici filo emirlerini sonuçlandıracak"
        : view.battle.status==="READY_TO_RESOLVE"
          ? "Yönetici değerlendirmeyi çözecek"
          : "Filo emirleri açıklandı; savaş zarları bekleniyor"
    : null;
  const embed = new EmbedBuilder().setColor(view.battle.status === "FINISHED" ? 0x8b1a1a : 0xb68b36)
    .setTitle(`⚔️ ${view.sides.A.country_name} — ${view.sides.B.country_name}`)
    .setDescription(view.battle.narrative || "İki ordu savaş alanında karşı karşıya geldi.")
    .addFields(
      { name: "🗺️ Savaş Alanı", value: `${terrain.label}\n${frontage}`, inline: false },
      { name: `🟥 ${view.sides.A.country_name}`, value: sideField("A"), inline: true },
      { name: `🟦 ${view.sides.B.country_name}`, value: sideField("B"), inline: true },
      { name: "📜 Durum", value: `**Savaş Turu:** ${view.battle.round_number}\n**Aşama:** ${navalStage??statusLabels[view.battle.status]??view.battle.status}${siegeStage}`, inline: false }
    );
  if (view.battle.terrain === "AMBUSH") embed.addFields({ name: "🌲 Pusu Düzeni", value: "A tarafı pusuyu kuran taraftır. İlk turda çarpışma +%25 ve hasar +%10 uygulanır." });
  if (view.battle.terrain === "SIEGE") {
    const wallOpen = (view.battle.wall_current_hp ?? 0) === 0, gateOpen = (view.battle.gate_current_hp ?? 0) === 0;
    const access = siegeAssaultAccess(view.sides.A.support_assets, SIEGE_ASSAULT_FRONTAGE);
    const ladders = Math.max(0, Math.floor(view.sides.A.support_assets.ladder_group ?? 0));
    const towers = Math.max(0, Math.floor(view.sides.A.support_assets.siege_tower ?? 0));
    const profile = siegeFrontageProfile(view.battle.wall_current_hp ?? 0, view.battle.gate_current_hp ?? 0);
    const effectiveInfantryAccess = profile.state === "INTACT" ? access.capacity : profile.attackerInfantry;
    const accessNote = profile.state === "FULLY_BREACHED"
      ? "**Kapı kırıldı ve surda gedik açıldı:** Merdiven/kule erişimi aranmaz; 30.000 piyade cephesi açılır."
      : profile.state === "GATE_BREACHED"
        ? "**Kapı kırıldı:** Merdiven/kule erişimi aranmaz; 20.000 piyade cephesi açılır."
        : profile.state === "WALL_BREACHED"
          ? "**Surda gedik açıldı:** Merdiven/kule erişimi aranmaz; 25.000 piyade cephesi açılır."
      : view.battle.siege_phase === "BOMBARDMENT"
        ? `**Hücum başlatılırsa doğrudan sur hücumuna katılabilecek azami piyade:** ${number(access.capacity)}`
        : `**Bu tur doğrudan sur hücumuna katılabilecek azami piyade:** ${number(access.capacity)}`;
    embed.addFields(
      { name: "🏰 Tahkimatlar", value: `**Sur:** ${number(view.battle.wall_current_hp ?? 0)} / ${number(view.battle.wall_max_hp ?? 0)} HP${wallOpen ? " — Yıkıldı" : ""}\n**Kapı:** ${number(view.battle.gate_current_hp ?? 0)} / ${number(view.battle.gate_max_hp ?? 0)} HP${gateOpen ? " — Kırıldı" : ""}\n**Erzak Dayanıklılığı:** ${number(view.battle.starvation_remaining ?? 0)} / ${number(view.battle.starvation_capacity ?? 0)} oyun turu${view.battle.starvation_capacity !== null && view.battle.starvation_remaining === 0 ? " — Erzak tükendi; yönetici sonucu belirler." : ""}` },
      { name: "🪜 Hücum Erişimi", value: `**Merdiven Grupları:** ${number(access.activeLadderGroups)} / ${number(ladders)} aktif → ${number(access.activeLadderGroups * LADDER_GROUP_ASSAULT_CAPACITY)}\n**Kuşatma Kuleleri:** ${number(access.activeSiegeTowers)} / ${number(towers)} aktif → ${number(access.activeSiegeTowers * SIEGE_TOWER_ASSAULT_CAPACITY)}\n**Piyade Hücum Kapasitesi:** ${number(effectiveInfantryAccess)} / ${number(profile.attackerInfantry)}\n**Menzilli Destek Kapasitesi:** ${number(profile.attackerRanged)}\n**Toplam Hücum Kapasitesi:** ${number(effectiveInfantryAccess + profile.attackerRanged)} / ${number(profile.attackerInfantry + profile.attackerRanged)}
${accessNote}` }
    );
  }
  embed.setImage(`attachment://${terrain.preset}`).setFooter({ text: "Tam birlik kompozisyonu yalnızca oyun yöneticisine görünür." }).setTimestamp();
  const factor = (value: number) => value.toFixed(2).replace(".", ",");
  if (roundResult) {
    const pressureLimit = view.battle.terrain === "SIEGE" ? SIEGE_PRESSURE_LIMIT : FIELD_BATTLE_PRESSURE_LIMIT;
    const winner = roundResult.winner ? view.sides[roundResult.winner].country_name : "Yok";
    const pressureWinner = roundResult.pressureWinner ? view.sides[roundResult.pressureWinner].country_name : "Yok";
    const navalDamage=view.battle.terrain==="NAVAL"
      ? `\n${view.sides.A.country_name}: **${number(roundResult.disabledA)} yeni iş göremez**\n${view.sides.B.country_name}: **${number(roundResult.disabledB)} yeni iş göremez**`
      :"";
    const chariotPressure = roundResult.chariotPressureBonusA > 0
      ? `\n🐎 **${view.sides.A.country_name}** Chariot birlikleri düşman düzenine +${roundResult.chariotPressureBonusA} baskı uyguladı.`
      : roundResult.chariotPressureBonusB > 0
        ? `\n🐎 **${view.sides.B.country_name}** Chariot birlikleri düşman düzenine +${roundResult.chariotPressureBonusB} baskı uyguladı.`
        : "";
    const resultValue=view.battle.terrain==="NAVAL"
      ? `Değerlendirme üstünlüğü: **${winner}**${roundResult.winner?" • +1 Manevra Puanı":" • Puan yok"}\n${view.sides.A.country_name}: **${NAVAL_BATTLE_ORDERS[roundResult.navalOrderA!]?.label??"—"}** • Manevra **${number(roundResult.maneuverPointsA??0)}/5** • ${navalConditionLabels[roundResult.navalConditionA??"OPERATIONAL"]}\n${view.sides.B.country_name}: **${NAVAL_BATTLE_ORDERS[roundResult.navalOrderB!]?.label??"—"}** • Manevra **${number(roundResult.maneuverPointsB??0)}/5** • ${navalConditionLabels[roundResult.navalConditionB??"OPERATIONAL"]}${navalDamage}`
      : `Kayıp hesabındaki üstün taraf: **${winner}**\nBaskı üstünlüğü: **${pressureWinner}** (${tierLabels[roundResult.pressureTier] ?? roundResult.pressureTier})\n${view.sides.A.country_name}: **-${number(roundResult.lossA)}** • Baskı **${number(roundResult.pressureA)}/${pressureLimit}** • ${orderLabels[roundResult.orderA]}\n${view.sides.B.country_name}: **-${number(roundResult.lossB)}** • Baskı **${number(roundResult.pressureB)}/${pressureLimit}** • ${orderLabels[roundResult.orderB]}${chariotPressure}${roundResult.wallDamage ? `\nSurlara verilen hasar: **${number(roundResult.wallDamage)}**` : ""}${roundResult.gateDamage ? `\nKapıya verilen hasar: **${number(roundResult.gateDamage)}**` : ""}`;
    embed.addFields({ name: `⚔️ Tur Sonucu — ${tierLabels[roundResult.tier] ?? roundResult.tier}`, value: resultValue });
    if (view.battle.terrain !== "NAVAL") embed.addFields({
      name: "🧩 Kayıplar Sonrası Kompozisyon",
      value: `${view.sides.A.country_name}: **${currentCompositionLabel(view,"A")}**\n${view.sides.B.country_name}: **${currentCompositionLabel(view,"B")}**`
    });
    if (view.battle.terrain === "SIEGE") {
      embed.addFields({
        name: "🏰 Kuşatma Çarpanları",
        value: `**Saldıran:** Çarpışma ×${factor(roundResult.attackerClashMultiplier ?? 1)} • Hasar ×${factor(roundResult.attackerDamageMultiplier ?? 1)}\n**Savunucu ham zar:** Çarpışma **${number(roundResult.defenderRawClash)}** • Hasar **${number(roundResult.defenderRawDamage)}**\n**Savunucu nihai:** Çarpışma **${number(roundResult.defenderEffectiveClash)}** (×${factor(roundResult.defenderClashMultiplier)}) • Hasar **${number(roundResult.defenderEffectiveDamage)}** (×${factor(roundResult.defenderDamageMultiplier)})\n**Rezerv:** ${number(roundResult.defenderReserveTiers ?? 0)}/5 kademe • Alınan Hasar ×${factor(roundResult.defenderIncomingDamageMultiplier ?? 1)}\n*Baskı, tahkimat ve rezerv çarpanlarından önceki Çarpışma sonuçlarıyla hesaplanır.*`
      });
    }
  } else if (view.lastRound) {
    const lastRound = view.lastRound;
    const pressureLimit = view.battle.terrain === "SIEGE" ? SIEGE_PRESSURE_LIMIT : FIELD_BATTLE_PRESSURE_LIMIT;
    const winner = lastRound.winner ? view.sides[lastRound.winner].country_name : "Yok";
    const structureDamage = [
      lastRound.wallDamage ? `Surlara verilen hasar: **${number(lastRound.wallDamage)}**` : null,
      lastRound.gateDamage ? `Kapıya verilen hasar: **${number(lastRound.gateDamage)}**` : null
    ].filter(Boolean).join("\n");
    const resultValue = view.battle.terrain === "NAVAL"
      ? `Değerlendirme üstünlüğü: **${winner}**\n${view.sides.A.country_name}: **-${number(lastRound.lossA)} gemi**\n${view.sides.B.country_name}: **-${number(lastRound.lossB)} gemi**`
      : `Kayıp hesabındaki üstün taraf: **${winner}**\n${view.sides.A.country_name}: **-${number(lastRound.lossA)}** • Baskı **${number(lastRound.pressureA)}/${pressureLimit}** • ${orderLabels[lastRound.orderA] ?? lastRound.orderA}\n${view.sides.B.country_name}: **-${number(lastRound.lossB)}** • Baskı **${number(lastRound.pressureB)}/${pressureLimit}** • ${orderLabels[lastRound.orderB] ?? lastRound.orderB}${structureDamage ? `\n${structureDamage}` : ""}`;
    embed.addFields({
      name: `⚔️ Son Çözümlenen Tur • Tur ${lastRound.roundNumber} — ${tierLabels[lastRound.tier] ?? lastRound.tier}`,
      value: `${resultValue}\n*Bu sonuç, sonraki savaş turu çözümlenene kadar kartta kalır.*`
    });
  }
  if (view.battle.status === "FINISHED") embed.addFields({ name: "🏁 Savaş Sonu", value: `${view.battle.winner_side ? `Galip: **${view.sides[view.battle.winner_side].country_name}**` : "Sonuç: **Berabere / kararsız**"}\n${view.battle.finish_reason ?? ""}` });
  return embed;
}

function components(view: BattleView) {
  if (view.battle.status === "FINISHED") {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`battle_armies|${view.battle.id}`).setLabel(view.battle.terrain === "NAVAL" ? "Filolarımın Son Durumunu Gör" : "Ordularımın Son Durumunu Gör").setEmoji(view.battle.terrain === "NAVAL" ? "⚓" : "⚔️").setStyle(ButtonStyle.Secondary)
    );
    if (view.battle.terrain === "NAVAL") row.addComponents(
      new ButtonBuilder().setCustomId(`battle_fleet_status|${view.battle.id}`).setLabel("Filo Durumu").setEmoji("❤️‍🩹").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`battle_fleet_status_gm|${view.battle.id}`).setLabel("Yönetici: İki Taraf").setEmoji("🔐").setStyle(ButtonStyle.Secondary)
    );
    return [row];
  }
  if (["CANCELLED", "DRAFT"].includes(view.battle.status)) return [];
  const expected = expectedSide(view);
  if(view.battle.terrain==="NAVAL"){
    const fleetButtons=()=>[
      new ButtonBuilder().setCustomId(`battle_fleet_status|${view.battle.id}`).setLabel("Filo Durumu").setEmoji("❤️‍🩹").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`battle_fleet_status_gm|${view.battle.id}`).setLabel("Yönetici: İki Taraf").setEmoji("🔐").setStyle(ButtonStyle.Secondary)
    ];
    const bothLocked=view.sides.A.naval_order_locked&&view.sides.B.naval_order_locked;
    if(!bothLocked){
      const orderOptions=(Object.keys(NAVAL_BATTLE_ORDERS) as NavalBattleOrder[]).flatMap((order)=>
        (["A","B"] as BattleSideKey[]).map((side)=>({
          label:`${view.sides[side].country_name} • ${NAVAL_BATTLE_ORDERS[order].label}`.slice(0,100),
          description:`${NAVAL_BATTLE_ORDERS[order].description} Maliyet: ${NAVAL_BATTLE_ORDERS[order].maneuverCost} MP`.slice(0,100),
          value:`${side}|${order}`
        }))
      );
      const selectRow=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`battle_naval_order|${view.battle.id}`).setPlaceholder("Taraf ve gizli filo emrini seç").addOptions(orderOptions)
      );
      const lockRow=new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`battle_naval_lock_A|${view.battle.id}`).setLabel(`${view.sides.A.country_name} Emrini Kilitle`.slice(0,80)).setStyle(ButtonStyle.Primary).setDisabled(view.sides.A.naval_order_locked),
        new ButtonBuilder().setCustomId(`battle_naval_lock_B|${view.battle.id}`).setLabel(`${view.sides.B.country_name} Emrini Kilitle`.slice(0,80)).setStyle(ButtonStyle.Primary).setDisabled(view.sides.B.naval_order_locked),
        ...fleetButtons()
      );
      return [selectRow,lockRow];
    }
    const hasRetreat=isNavalRetreatOrder(view.sides.A.naval_order)||isNavalRetreatOrder(view.sides.B.naval_order);
    if(hasRetreat)return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`battle_naval_retreat_resolve|${view.battle.id}`).setLabel("Yönetici: Emirleri Sonuçlandır").setEmoji("⚓").setStyle(ButtonStyle.Danger),
      ...fleetButtons()
    )];
    const actionButton=expected
      ?new ButtonBuilder().setCustomId(`battle_roll|${view.battle.id}`).setLabel(`${view.sides[expected].country_name} Savaş Zarlarını At`.slice(0,80)).setEmoji("🎲").setStyle(ButtonStyle.Primary)
      :new ButtonBuilder().setCustomId(`battle_resolve|${view.battle.id}`).setLabel("Yönetici: Değerlendirmeyi Çöz").setEmoji("⚖️").setStyle(ButtonStyle.Success);
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(actionButton,...fleetButtons())];
  }
  if (view.battle.terrain === "SIEGE" && view.battle.siege_phase === "BOMBARDMENT") return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`battle_bombard|${view.battle.id}`).setLabel(((view.battle.bombardments_this_turn ?? 0) >= MAX_BOMBARDMENTS_PER_GAME_TURN ? "Bombardıman Hakkı Doldu" : `${view.sides.A.country_name} Katapult Bombardımanı Yap`).slice(0, 80)).setEmoji("💥").setStyle(ButtonStyle.Primary).setDisabled((view.battle.bombardments_this_turn ?? 0) >= MAX_BOMBARDMENTS_PER_GAME_TURN),
    new ButtonBuilder().setCustomId(`battle_retreat|${view.battle.id}`).setLabel("Geri Çekil").setEmoji("🏳️").setStyle(ButtonStyle.Danger)
  )];
  const label = expected ? `${view.sides[expected].country_name} Savaş Zarlarını At` : "Tur Çözümü Bekleniyor";
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`battle_roll|${view.battle.id}`).setLabel(label).setEmoji("🎲").setStyle(ButtonStyle.Primary).setDisabled(!expected),
    new ButtonBuilder().setCustomId(`battle_retreat|${view.battle.id}`).setLabel("Geri Çekil").setEmoji("🏳️").setStyle(ButtonStyle.Danger).setDisabled(!expected)
  );
  return [row];
}

function chunkLines(lines: string[], maxLength = 3600): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function playerFleetStatusEmbeds(status: PlayerBattleFleetStatus,audience:"PLAYER"|"GM"="PLAYER"): EmbedBuilder[] {
  const groups = new Map<string, PlayerBattleFleetStatus["ships"]>();
  for (const ship of status.ships) {
    const key = `${ship.countryId}|${ship.fleetId ?? "manual"}`;
    const group = groups.get(key) ?? [];
    group.push(ship);
    groups.set(key, group);
  }
  const embeds: EmbedBuilder[] = [];
  for (const ships of groups.values()) {
    const first = ships[0]!;
    const counters = new Map<string, number>();
    const lines = ships.map((ship) => {
      const index = (counters.get(ship.shipType) ?? 0) + 1;
      counters.set(ship.shipType, index);
      const label = NAVAL_UNIT_STATS[ship.shipType]?.label ?? ship.shipType;
      const state = ship.sunkRound !== null || ship.currentHp <= 0
        ? `⚫ Battı${ship.sunkRound === null ? "" : ` (Tur ${ship.sunkRound})`}`
        : ship.disabledRound !== null
          ? `🔴 İş göremez${ship.disabledRound === null ? "" : ` (Tur ${ship.disabledRound})`}`
          : ship.currentHp < ship.maxHp
            ? "🟡 Hasarlı"
            : "🟢 Savaşabilir";
      const origin = ship.settlementName ? ` • ${ship.settlementName}` : "";
      return `**${label} #${index}** — ${number(ship.currentHp)}/${number(ship.maxHp)} HP • ${state}${origin}`;
    });
    const chunks = chunkLines(lines);
    chunks.forEach((description, index) => embeds.push(
      new EmbedBuilder()
        .setColor(0x2f7ea8)
        .setTitle(`⚓ ${first.fleetName ?? "Manuel Donanma"}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`)
        .setDescription(description)
        .addFields({ name: "Ülke", value: first.countryName, inline: true }, { name: "Savaş Turu", value: number(status.roundNumber), inline: true })
        .setFooter({ text: audience==="GM"
          ? "Bu iki taraflı gemi can dökümü yalnızca oyun yöneticisine görünür."
          : "Bu filo can dökümü yalnızca size görünür." })
    ));
  }
  return embeds;
}

function embedTextLength(embed: EmbedBuilder): number {
  const data=embed.toJSON();
  return (data.title?.length??0)
    +(data.description?.length??0)
    +(data.author?.name.length??0)
    +(data.footer?.text.length??0)
    +(data.fields??[]).reduce((sum,field)=>sum+field.name.length+field.value.length,0);
}

export function fleetStatusEmbedPages(embeds: EmbedBuilder[],maxCharacters=5_800): EmbedBuilder[][] {
  const pages:EmbedBuilder[][]=[];
  let page:EmbedBuilder[]=[];
  let characters=0;
  for(const embed of embeds){
    const nextCharacters=embedTextLength(embed);
    if(page.length&&(page.length>=10||characters+nextCharacters>maxCharacters)){
      pages.push(page);
      page=[];
      characters=0;
    }
    page.push(embed);
    characters+=nextCharacters;
  }
  if(page.length)pages.push(page);
  return pages;
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
  const visibleComponents = view.battle.status === "FINISHED"
    ? components(view)
    : view.rolls.length
      ? view.battle.terrain === "NAVAL"
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`battle_fleet_status|${view.battle.id}`).setLabel("Filo Durumu").setEmoji("❤️‍🩹").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`battle_fleet_status_gm|${view.battle.id}`).setLabel("Yönetici: İki Taraf").setEmoji("🔐").setStyle(ButtonStyle.Secondary)
          )]
        : []
      : components(view);
  return { embeds: [battleEmbed(view, result)], components: visibleComponents, files: [new AttachmentBuilder(asset.path, { name: asset.name })] };
}

export function battleRollEmbed(view: BattleView, side: BattleSideKey): EmbedBuilder {
  const roll = view.rolls.find((item) => item.side_key === side)!;
  const factor = (value: number) => value.toFixed(2).replace(".", ",");
  const structureDamage = [
    roll.wall_damage ? `Sur Hasarı: **${number(roll.wall_damage)}**` : null,
    roll.gate_damage ? `Kapı Hasarı: **${number(roll.gate_damage)}**` : null
  ].filter(Boolean).join(" • ");
  const counter = roll.detail?.__spear_cavalry;
  const commander = roll.detail?.__commander;
  const details = view.battle.terrain === "SIEGE" && side === "B"
    ? (() => {
        const attackerRoll = view.rolls.find((item) => item.side_key === "A");
        const wallAfter = Math.max(0, (view.battle.wall_current_hp ?? 0) - Number(attackerRoll?.wall_damage ?? 0));
        const gateAfter = Math.max(0, (view.battle.gate_current_hp ?? 0) - Number(attackerRoll?.gate_damage ?? 0));
        const defense = siegeDefenseModifiers(wallAfter, gateAfter);
        const profile = siegeFrontageProfile(wallAfter, gateAfter);
        const reserve = siegeDefenderReserveBonus(view.sides.B.current_total, profile.defenderInfantry + profile.defenderRanged);
        const clashMultiplier = defense.defenderClash * reserve.clashMultiplier;
        const damageMultiplier = defense.defenderDamage * reserve.damageMultiplier;
        return [
          `Ham Çarpışma: **${number(roll.clash_total)}**`,
          `Ham Hasar: **${number(roll.damage_total)}**`,
          `Tahkimat ve Rezerv Sonrası Çarpışma: **${number(Math.ceil(roll.clash_total * clashMultiplier))}** (×${factor(clashMultiplier)})`,
          `Tahkimat ve Rezerv Sonrası Hasar: **${number(Math.ceil(roll.damage_total * damageMultiplier))}** (×${factor(damageMultiplier)})`,
          `Rezerv Kademesi: **${reserve.tiers}/5**`
        ];
      })()
    : [
        `Çarpışma: **${number(roll.clash_total)}**`,
        `Hasar: **${number(roll.damage_total)}**`
      ];
  return new EmbedBuilder()
    .setColor(side === "A" ? 0xc94b55 : 0x4fa3d1)
    .setTitle(`🎲 Savaş Turu ${view.battle.round_number} • ${view.sides[side].country_name}`)
    .setDescription([
      ...details,
      structureDamage || null,
      counter?.matched ? `**Mızrak Karşılığı:** ${number(counter.matched)} süvari eşleşti • +${number(counter.clashBonus ?? 0)} Çarpışma • +${number(counter.antiCavalryDamage ?? 0)} süvariye özel Hasar` : null,
      commander?.clash ? `**Komutan Bonusu:** +${number(commander.clash)} Çarpışma` : null,
      `Zarı atan: <@${roll.roller_user_id}>${roll.is_proxy ? " • DM vekili" : ""}`
    ].filter(Boolean).join("\n"))
    .setFooter({ text: `${view.rolls.length}/2 taraf zarını tamamladı${roll.is_proxy ? " • DM vekili" : ""}` });
}

export async function refreshBattleCard(client: Client, view: BattleView): Promise<boolean> {
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

const lastAutomaticCardVersions = new Map<string, number>();

export async function refreshChangedBattleCards(client: Client, guildId: string): Promise<{ updated: number; failed: number }> {
  const versions = await battleService.activeCardVersionsForGuild(guildId);
  const activeKeys = new Set(versions.map((row) => `${guildId}:${row.id}`));
  let updated = 0;
  let failed = 0;
  for (const row of versions) {
    const key = `${guildId}:${row.id}`;
    const version = new Date(row.updated_at).getTime();
    if (lastAutomaticCardVersions.get(key) === version) continue;
    try {
      const view = await battleService.byId(guildId,row.id);
      if (!view || !view.battle.public_message_id) {
        lastAutomaticCardVersions.set(key,version);
        continue;
      }
      if (await refreshBattleCard(client,view)) {
        lastAutomaticCardVersions.set(key,version);
        updated += 1;
      } else failed += 1;
    } catch (error) {
      failed += 1;
      console.error("Değişen savaş kartı otomatik yenilenemedi",{ guildId,battleId:row.id,error });
    }
  }
  for (const key of lastAutomaticCardVersions.keys()) {
    if (key.startsWith(`${guildId}:`) && !activeKeys.has(key)) lastAutomaticCardVersions.delete(key);
  }
  return { updated,failed };
}

async function retireBattleCard(client: Client, view: BattleView, replacementMessageId: string): Promise<void> {
  const previousMessageId = view.battle.public_message_id;
  if (!previousMessageId || previousMessageId === replacementMessageId) return;
  try {
    const channel = await client.channels.fetch(view.battle.channel_id);
    if (!channel?.isTextBased() || channel.isDMBased() || !("messages" in channel)) return;
    const message = await channel.messages.fetch(previousMessageId);
    await message.edit({ components: [] });
  } catch (error) {
    console.error("Eski savaş kartının düğmeleri kapatılamadı", { battleId: view.battle.id, error });
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
  const cargoLosses=(["A","B"] as BattleSideKey[]).flatMap((side)=>view.sides[side].participants
    .filter((participant)=>Number(participant.embarked_army_loss??0)>0)
    .map((participant)=>`• ${side} • **${participant.country_name} — ${participant.embarked_army_name??"Taşınan ordu"}: -${number(Number(participant.embarked_army_loss))} asker**`));
  return new EmbedBuilder().setColor(shortfall ? 0xd9822b : 0x2e8b57).setTitle("🔒 Savaş Kayıpları — Belge Mutabakatı")
    .setDescription(`${text}${cargoLosses.length?`\n\n**🌊 Batan Gemilerde Taşınan Asker Kayıpları**\n${cargoLosses.join("\n")}`:""}\n\n${shortfall ? "⚠️ Mutabakat açığı bulunan miktarlar belgede mevcut olmadığı için otomatik düşülemedi." : "✅ Hesaplanan bütün kayıplar ülke belgelerine otomatik işlendi."}`)
    .setFooter({ text: "Bu rapor yalnızca oyun yöneticilerine gösterilir." });
}

export async function handleBattleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channelId) throw new GameError("Savaş komutları yalnızca bir sunucu kanalında kullanılabilir.");
  const sub = interaction.options.getSubcommand();
  if (!["saha-aleti-al", "suvari-indir"].includes(sub)) requireGameMaster(interaction);
  const publicCommands = new Set(["bombardiman", "yayinla", "tur-oynat", "bitir", "iptal"]);
  await interaction.deferReply({ ephemeral: !publicCommands.has(sub) });
  if (sub === "baslat") {
    requireGameMaster(interaction);
    const view = await battleService.create({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      countryAName: interaction.options.getString("taraf-a", true), countryBName: interaction.options.getString("taraf-b", true),
      terrain: interaction.options.getString("arazi", true) as BattleTerrain, narrative: interaction.options.getString("anlatim") ?? "",
      controllerA: interaction.options.getString("kontrol-a", true) as BattleController, controllerB: interaction.options.getString("kontrol-b", true) as BattleController,
      defenderSettlementName: interaction.options.getString("savunulan-yerleske"),
      encounterId: interaction.options.getString("karsilasma-id") });
    const rosterCommand = view.battle.terrain === "NAVAL" ? "/savas filo-ayarla" : "/savas kadro-ayarla";
    const supportNote = view.battle.terrain === "SIEGE" ? " Kuşatma aletlerini `/savas kusatma-aleti-ayarla` ile girin." : "";
    await interaction.editReply({ content: `✅ **${view.sides.A.country_name} — ${view.sides.B.country_name}** savaş taslağı oluşturuldu. ${interaction.options.getString("karsilasma-id") ? "Karşılaşmadaki iki ordu otomatik eklendi; kadroları kontrol edin." : `Gizli kadroları \`${rosterCommand}\` ile girin.`}${supportNote}\nİlk zar sırası: **${view.sides[view.battle.first_side].country_name}**. Taslağı hazır olunca \`/savas yayinla\` ile yayımlayın.` });
  } else if (sub === "taraf-ulke") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const action = interaction.options.getString("islem", true) as "ADD" | "REMOVE";
    const countryName = interaction.options.getString("ulke", true);
    const view = await battleService.setParticipant({
      guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side, action, countryName
    });
    await interaction.editReply({
      content: "✅ **" + countryName + "** " + (action === "ADD" ? "savaş tarafına eklendi" : "savaş tarafından çıkarıldı") + ". **" + side + " tarafı:** " + view.sides[side].country_names.join(", "),
    });
  } else if (sub === "tasinan-ordu-ayarla") {
    requireGameMaster(interaction);
    const result=await battleService.setNavalCargoArmy({
      guildId:interaction.guildId,channelId:interaction.channelId,actorId:interaction.user.id,
      countryName:interaction.options.getString("ulke",true),armyId:interaction.options.getString("ordu")
    });
    if(!result.armyName){
      await interaction.editReply(`✅ **${result.countryName}** filosunun taşınan ordu seçimi temizlendi; deniz savaşına askersiz katılacak.`);
    }else{
      const capacityStatus=result.capacity<=0
        ? "\n⚠️ Bu ülkenin deniz savaşı kadrosunda henüz taşıma kapasitesi bulunmuyor. Yayımlamadan önce gemi ekleyin."
        :result.total>result.capacity
          ? `\n⚠️ Ordu mevcudu taşıma kapasitesini **${number(result.total-result.capacity)}** aşıyor. Savaş bu düzeltilmeden yayımlanamaz.`
          :"\n✅ Ordu mevcudu mevcut taşıma kapasitesine sığıyor.";
      await interaction.editReply(`✅ **${result.countryName}** filosunda taşınan ordu **${result.armyName}** olarak seçildi.\n⚔️ Asker: **${number(result.total)}** • 🚢 Taşıma kapasitesi: **${number(result.capacity)}**${capacityStatus}`);
    }
  } else if (sub === "ordu-ekle") {
    requireGameMaster(interaction);
    const countryName = interaction.options.getString("ulke", true);
    const side = (await battleService.participantByCountry({ guildId: interaction.guildId, channelId: interaction.channelId, countryName })).side_key;
    const action = interaction.options.getString("islem", true) as "ADD" | "REMOVE";
    const result = await battleService.setArmyAssignment({
      guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side, action, armyId: interaction.options.getString("ordu", true)
    });
    await interaction.editReply({
      content: `✅ **${result.countryName} • ${result.armyName}** savaş taslağ${action === "ADD" ? "ına eklendi" : "ından çıkarıldı"}. **${countryName} tarafının bulunduğu cephenin güncel toplamı:** ${number(result.view.sides[side].initial_total)}`,
    });
  } else if (sub === "filo-ekle") {
    requireGameMaster(interaction);
    const countryName = interaction.options.getString("ulke",true);
    const side = (await battleService.participantByCountry({ guildId:interaction.guildId,channelId:interaction.channelId,countryName })).side_key;
    const action = interaction.options.getString("islem",true) as "ADD" | "REMOVE";
    const result = await battleService.setFleetAssignment({
      guildId:interaction.guildId,channelId:interaction.channelId,actorId:interaction.user.id,
      side,action,fleetId:interaction.options.getString("filo",true)
    });
    await interaction.editReply({
      content:`✅ **${result.countryName} • ${result.fleetName}** deniz savaşı taslağ${action === "ADD" ? "ına eklendi" : "ından çıkarıldı"}. **${countryName} tarafının bulunduğu cephenin güncel toplamı:** ${number(result.view.sides[side].initial_total)} gemi`
    });
  } else if (sub === "birlik-ayarla") {
    requireGameMaster(interaction);
    const view = await battleService.setUnit({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side: interaction.options.getString("taraf", true) as BattleSideKey, unitType: interaction.options.getString("birim", true) as BattleUnitType,
      quantity: interaction.options.getInteger("miktar", true), countryName: interaction.options.getString("ulke") });
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    await interaction.editReply({ content: `✅ ${side} tarafının gizli kadrosu güncellendi. Açık toplam: **${number(view.sides[side].initial_total)}**` });
  } else if (sub === "kadro-ayarla") {
    requireGameMaster(interaction);
    const countryName = interaction.options.getString("ulke", true);
    const sourceSettlement = interaction.options.getString("yerleske");
    const view = await battleService.setRoster({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, naval: false, countryName, sourceSettlement, preserveSpecialUnits: true,
      composition: {
        light_infantry: interaction.options.getInteger("hafif-piyade", true), slinger: interaction.options.getInteger("sapanci", true),
        spear: interaction.options.getInteger("mizrakli", true), archer: interaction.options.getInteger("okcu", true),
        heavy_infantry: interaction.options.getInteger("agir-piyade", true), light_cavalry: interaction.options.getInteger("hafif-suvari", true),
        heavy_cavalry: interaction.options.getInteger("agir-suvari", true), militia: interaction.options.getInteger("milis") ?? 0
      } });
    const side = (["A","B"] as const).find((sideKey) => view.sides[sideKey].participants
      .some((item) => item.country_name.toLocaleLowerCase("tr-TR") === countryName.trim().toLocaleLowerCase("tr-TR")));
    if (!side) throw new GameError("Kadro kaydedildi ancak savaş tarafı yanıtı oluşturulamadı; savaş belgesini kontrol edin.");
    const participant = countryName?.trim()
      ? view.sides[side].participants.find((item) => item.country_name.toLocaleLowerCase("tr-TR") === countryName.trim().toLocaleLowerCase("tr-TR"))
      : view.sides[side].participants.find((item) => item.is_primary);
    const participantIndex = participant ? view.sides[side].participants.indexOf(participant) : -1;
    if (!participant || participantIndex < 0) throw new GameError("Kadro ülkesi savaş tarafında bulunamadı.");
    const lossSource = participant?.source_settlement_name
      ? `**${participant.source_settlement_name}**; kayıplar yalnızca bu yerleşkeden düşülecek.`
      : "**Ülke geneli**; kayıplar mevcut oransal dağıtımla düşülecek.";
    const availableSpecialUnits = await battleService.listParticipantSpecialUnits({ guildId: interaction.guildId, channelId: interaction.channelId, side, countryName });
    const specialComponents = availableSpecialUnits.length
      ? [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`battle_roster_special|${side}|${participantIndex}`)
            .setPlaceholder("Bu ülkenin özel birimlerinden seç")
            .addOptions(availableSpecialUnits.map(({ unitType, available, selected }) => ({
              label: SPECIAL_UNITS[unitType as keyof typeof SPECIAL_UNITS].name.slice(0, 100),
              value: unitType,
              description: `Kullanılabilir ${number(available)} • Kadroda ${number(selected)}`.slice(0, 100),
            }))),
        )]
      : [];
    await interaction.editReply({
      content: `✅ **${countryName}** ülkesinin bütün kara kadrosu tek işlemde kaydedildi. Açık toplam: **${number(view.sides[side].initial_total)}**\n📍 Kayıp kaynağı: ${lossSource}\n\n${availableSpecialUnits.length ? "⚔️ Bu ülkenin sahip olduğu özel birlikleri aşağıdaki menüden aynı kadro ekranında düzenleyebilirsin." : "ℹ️ Seçilen kaynakta kullanılabilir özel birlik bulunmuyor."}`,
      components: specialComponents,
    });
  } else if (sub === "gemi-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const view = await battleService.setUnit({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side, unitType: interaction.options.getString("gemi", true) as NavalUnitType, quantity: interaction.options.getInteger("miktar", true), countryName: interaction.options.getString("ulke") });
    await interaction.editReply({ content: `✅ ${side} tarafının gizli filo kadrosu güncellendi. Açık toplam: **${number(view.sides[side].initial_total)} gemi**` });
  } else if (sub === "filo-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const view = await battleService.setRoster({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, side, naval: true, countryName: interaction.options.getString("ulke"),
      composition: { kerkouros: interaction.options.getInteger("kerkouros", true), trireme: interaction.options.getInteger("trireme", true), quinquereme: interaction.options.getInteger("quinquereme", true) } });
    await interaction.editReply({ content: `✅ ${side} tarafının bütün filosu tek işlemde kaydedildi. Açık toplam: **${number(view.sides[side].initial_total)} gemi**` });
  } else if (sub === "kusatma-aleti-ayarla") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const view = await battleService.setSupport({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      side, assetType: interaction.options.getString("alet", true) as SiegeAssetType, target: interaction.options.getString("hedef", true) as SiegeTarget, quantity: interaction.options.getInteger("miktar", true) });
    await interaction.editReply({ content: `✅ ${side} tarafının gizli kuşatma desteği güncellendi. Hedef: **${interaction.options.getString("hedef", true)}**` });
  } else if (sub === "kusatma-aleti-hedefle") {
    requireGameMaster(interaction);
    const side = interaction.options.getString("taraf", true) as BattleSideKey;
    const assetType = interaction.options.getString("alet", true) as SiegeAssetType;
    const target = interaction.options.getString("hedef", true) as SiegeTarget;
    const view = await battleService.setSupportTarget({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      actorId: interaction.user.id,
      side,
      assetType,
      target,
    });
    await interaction.editReply({ content: `✅ **${SIEGE_ASSET_BATTLE_STATS[assetType].label}** hedefi **${target === "WALL" ? "Sur" : target === "GATE" ? "Kapı" : target === "ARMY" ? "Düşman Ordusu" : "Hücum Desteği"}** olarak ayarlandı. Miktar değişmedi: **${number(view.sides[side].support_assets[assetType] ?? 0)}**` });
  } else if (sub === "parali-asker-ayarla") {
    requireGameMaster(interaction);
    const countryName = interaction.options.getString("ulke", true);
    const side = (await battleService.participantByCountry({ guildId: interaction.guildId, channelId: interaction.channelId, countryName })).side_key;
    const action = interaction.options.getString("islem", true) as "ADD" | "REMOVE";
    const view = await battleService.setMercenaryAssignment({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, side, countryName, action, companyKey: interaction.options.getString("sirket", true) });
    await interaction.editReply({ content: `✅ Paralı asker şirketi ${action === "ADD" ? "savaş taslağına eklendi" : "savaş taslağından çıkarıldı"}. **${countryName}** ülkesinin bulunduğu cephenin açık toplamı: **${number(view.sides[side].initial_total)}**` });
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
    await interaction.editReply({
      content: `🛠️ **${result.view.sides.A.country_name}**, **${result.settlementName}** hazinesinden **${number(result.cost)} Altın** ödeyerek ${quantity} **${assetName}** hazırladı. Alet kuşatma düzenine anında eklendi; mevcut savaş kartı güncellendi.`,
    });
  } else if (sub === "suvari-indir") {
    const unitType = interaction.options.getString("birim", true) as SiegeDismountUnitType;
    const quantity = interaction.options.getInteger("miktar", true);
    const result = await battleService.setSiegeDismount({
      guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id,
      isGameMaster: isGameMaster(interaction), countryName: interaction.options.getString("ulke"), unitType, quantity
    });
    await refreshBattleCard(interaction.client, result.view);
    const sourceLabel = BATTLE_UNIT_STATS[unitType].label;
    const targetLabel = BATTLE_UNIT_STATS[result.targetType].label;
    await interaction.editReply({ content: quantity > 0
      ? `✅ **${result.countryName}** ülkesinin **${number(quantity)} ${sourceLabel}** birliği kuşatma hücumunda **${targetLabel}** olarak yaya savaşacak. Kayıplar yine ${sourceLabel} kaydından düşecek.`
      : `✅ **${result.countryName}** ülkesinin **${sourceLabel}** için attan inme emri kaldırıldı.` });
  } else if (sub === "kusatma-asamasi") {
    requireGameMaster(interaction);
    const result = await battleService.setSiegePhase({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, phase: interaction.options.getString("asama", true) as SiegePhase });
    const label = result.view.battle.siege_phase === "BOMBARDMENT" ? "Bombardıman — ordular temas etmiyor" : "Hücum — savaş zarları açıldı";
    if (result.shouldReveal) {
      await interaction.editReply({ content: `✅ Kuşatma durumu **${label}** olarak değiştirildi ve yeni savaş kartı yayımlandı.` });
      const reply = await interaction.followUp({ content: `🏰 Kuşatma durumu **${label}** olarak değiştirildi.`, ...publicPayload(result.view), fetchReply: true });
      await retireBattleCard(interaction.client, result.view, reply.id);
      await battleService.setPublicMessage(result.view.battle.id, reply.id);
    } else {
      await refreshBattleCard(interaction.client, result.view);
      await interaction.editReply({ content: `✅ Kuşatma durumu **${label}** olarak değiştirildi; bu aşama daha önce duyurulduğu için yeni savaş kartı gönderilmedi.` });
    }
  } else if (sub === "bombardiman") {
    requireGameMaster(interaction);
    const result = await battleService.bombard({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, isGameMaster: true });
    await refreshBattleCard(interaction.client, result.view);
    await interaction.editReply({ content: `💥 **${result.catapultCount} Katapult** surları bombardımana tuttu. Sur hasarı: **${number(result.wallDamage)}**. Ordular temas etmedi; asker kaybı ve baskı oluşmadı. Güncel durum mevcut savaş kartına işlendi.` });
  } else if (sub === "yayinla") {
    requireGameMaster(interaction);
    const view = await battleService.publish({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id });
    const reply = await interaction.editReply(publicPayload(view));
    await battleService.setPublicMessage(view.battle.id, reply.id);
  } else if (sub === "tur-oynat") {
    requireGameMaster(interaction);
    const result = await battleService.resolve({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id });
    const reply = await interaction.editReply(publicPayload(result.view, result.round));
    await retireBattleCard(interaction.client, result.view, reply.id);
    await battleService.setPublicMessage(result.view.battle.id, reply.id);
    if (result.round.ended) {
      await interaction.followUp({ embeds: [casualtyReportEmbed(result.view, result.report)], flags: MessageFlags.Ephemeral });
      await publishCharacterTurnLogs(interaction.client,interaction.guildId,[]).catch(() => undefined);
    }
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
      const dismounted = key === "A" ? view.sides.A.participants.flatMap((participant) =>
        Object.entries(participant.dismounted_composition ?? {}).filter(([, quantity]) => Number(quantity) > 0).map(([source, quantity]) => {
          const sourceType = source as SiegeDismountUnitType;
          return `• ${participant.country_name}: ${number(Number(quantity))} ${BATTLE_UNIT_STATS[sourceType].label} → ${BATTLE_UNIT_STATS[SIEGE_ATTACKER_DISMOUNT_MAP[sourceType]].label}`;
        })) : [];
      const cargo=view.battle.terrain==="NAVAL"
        ?view.sides[key].participants.map((participant)=>participant.embarked_army_name
          ?`• ${participant.country_name}: **${participant.embarked_army_name}** • ${number(Object.values(participant.embarked_army_composition??{}).reduce((sum,quantity)=>sum+Number(quantity??0),0))} asker${Number(participant.embarked_army_loss??0)>0?` • Kayıp: **-${number(Number(participant.embarked_army_loss))}**`:""}`
          :`• ${participant.country_name}: **Askersiz**`)
        :[];
      return `**${key} — ${view.sides[key].country_name}**\n${lines}${cargo.length?`\n**Gemide Taşınan Ordular**\n${cargo.join("\n")}`:""}${support ? `\n**Kuşatma Desteği**\n${support}` : ""}${dismounted.length ? `\n**Yaya Hücum Emri**\n${dismounted.join("\n")}` : ""}\nBasınç: ${view.sides[key].pressure}`;
    }).join("\n\n");
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x333333).setTitle("🔒 Gizli Ordu Detayı").setDescription(detail)] });
  } else if (sub === "kayip-raporu") {
    requireGameMaster(interaction);
    const result = await battleService.casualtyReport(interaction.guildId, interaction.channelId);
    await interaction.editReply({ embeds: [casualtyReportEmbed(result.view, result.rows)] });
  } else if (sub === "bitir") {
    requireGameMaster(interaction);
    const winnerRaw = interaction.options.getString("galip", true);
    const result = await battleService.finish({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id, winner: winnerRaw === "NONE" ? null : winnerRaw as BattleSideKey, reason: interaction.options.getString("neden", true) });
    await interaction.editReply(publicPayload(result.view));
    await interaction.followUp({ embeds: [casualtyReportEmbed(result.view, result.report)], flags: MessageFlags.Ephemeral });
    await publishCharacterTurnLogs(interaction.client,interaction.guildId,[]).catch(() => undefined);
  } else if (sub === "iptal") {
    requireGameMaster(interaction);
    const view = await battleService.cancel({ guildId: interaction.guildId, channelId: interaction.channelId, actorId: interaction.user.id });
    await interaction.editReply({ embeds: [battleEmbed(view)] });
  }
}

export async function handleBattleButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("battle_")) return false;
  if (!interaction.guildId || !interaction.channelId) throw new GameError("Sunucu veya kanal bulunamadı.");
  const battleId = interaction.customId.split("|")[1];
  if (!battleId) throw new GameError("Savaş düğmesi bozuk.");
  if(interaction.customId.startsWith("battle_naval_lock_")){
    await interaction.deferReply({ephemeral:true});
    const side=interaction.customId.startsWith("battle_naval_lock_A|")?"A":"B";
    const view=await battleService.lockNavalOrder({
      guildId:interaction.guildId,channelId:interaction.channelId,battleId,actorId:interaction.user.id,
      isGameMaster:isGameMaster(interaction),side
    });
    await refreshBattleCard(interaction.client,view);
    await interaction.editReply(`🔒 **${view.sides[side].country_name}** filo emri gizli olarak kilitlendi.`);
  } else if(interaction.customId.startsWith("battle_naval_retreat_resolve|")){
    await interaction.deferReply();
    if(!isGameMaster(interaction))throw new GameError("Filo emirlerini yalnızca oyun yöneticisi sonuçlandırabilir.");
    const result=await battleService.resolveNavalRetreatOrders({
      guildId:interaction.guildId,channelId:interaction.channelId,battleId,actorId:interaction.user.id
    });
    const reply=await interaction.editReply(publicPayload(result.view));
    await retireBattleCard(interaction.client,result.view,reply.id);
    await battleService.setPublicMessage(result.view.battle.id,reply.id);
    await interaction.followUp({embeds:[casualtyReportEmbed(result.view,result.report)],ephemeral:true});
    await publishCharacterTurnLogs(interaction.client,interaction.guildId,[]).catch(()=>undefined);
  } else if(interaction.customId.startsWith("battle_resolve|")){
    await interaction.deferReply();
    if(!isGameMaster(interaction))throw new GameError("Değerlendirmeyi yalnızca oyun yöneticisi sonuçlandırabilir.");
    const result=await battleService.resolve({guildId:interaction.guildId,channelId:interaction.channelId,actorId:interaction.user.id});
    const reply=await interaction.editReply(publicPayload(result.view,result.round));
    await retireBattleCard(interaction.client,result.view,reply.id);
    await battleService.setPublicMessage(result.view.battle.id,reply.id);
    if(result.round.ended){
      await interaction.followUp({embeds:[casualtyReportEmbed(result.view,result.report)],ephemeral:true});
      await publishCharacterTurnLogs(interaction.client,interaction.guildId,[]).catch(()=>undefined);
    }
  } else if (interaction.customId.startsWith("battle_fleet_status_gm|")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if(!isGameMaster(interaction))throw new GameError("İki tarafın gemi durumunu yalnızca oyun yöneticileri görebilir.");
    const status=await battleService.adminFleetStatus({guildId:interaction.guildId,battleId});
    const embeds=playerFleetStatusEmbeds(status,"GM");
    const pages=fleetStatusEmbedPages(embeds);
    await interaction.editReply({content:"🔐 Deniz savaşındaki iki tarafın bütün gemi can durumları:",embeds:pages[0]??[]});
    for(const page of pages.slice(1)){
      await interaction.followUp({embeds:page,ephemeral:true});
    }
  } else if (interaction.customId.startsWith("battle_fleet_status|")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const status = await battleService.playerFleetStatus({ guildId: interaction.guildId, battleId, actorId: interaction.user.id });
    const embeds = playerFleetStatusEmbeds(status);
    const pages=fleetStatusEmbedPages(embeds);
    await interaction.editReply({ content: "⚓ Savaştaki kendi filolarınızın gemi can durumu:", embeds: pages[0]??[] });
    for (const page of pages.slice(1)) {
      await interaction.followUp({ embeds: page, flags: MessageFlags.Ephemeral });
    }
  } else if (interaction.customId.startsWith("battle_armies|")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const country = await gameService.countryForUser(interaction.guildId, interaction.user.id);
    if (!country) throw new GameError("Discord hesabına atanmış bir ülke bulunamadı.");
    const armies = await armyService.listBattleCountry(interaction.guildId, country.id, battleId);
    const fleets = await fleetService.listBattleCountry(interaction.guildId,country.id,battleId);
    if (!armies.length && !fleets.length) throw new GameError("Bu savaşta devletinize ait kalıcı bir ordu veya filo bulunmuyor.");
    const pages=batchDocumentEmbeds([...armies.map(renderArmyEmbed),...fleets.map(renderFleetEmbed)]);
    await interaction.editReply({
      content:fleets.length ? "⚓ Savaş kayıpları işlendi. Bu savaşa katılan filolarınızın ve taşıma kapasitelerinin güncel hâli:" : "⚔️ Savaş kayıpları işlendi. Bu savaşa katılan ordularınızın ve kompozisyonlarının güncel hâli:",
      embeds:pages[0]??[]
    });
    for(const page of pages.slice(1)){
      await interaction.followUp({embeds:page,flags:MessageFlags.Ephemeral});
    }
  } else if (interaction.customId.startsWith("battle_roll|")) {
    await interaction.deferReply();
    const result = await battleService.roll({ guildId: interaction.guildId, channelId: interaction.channelId, battleId, actorId: interaction.user.id, isGameMaster: isGameMaster(interaction) });
    await refreshBattleCard(interaction.client, result.view);
    if (interaction.message.id !== result.view.battle.public_message_id) {
      await interaction.message.edit({ components: [] }).catch((error) => console.error("Kullanılmış zar düğmesi kapatılamadı", { battleId, error }));
    }
    await interaction.editReply({ content: `<@${interaction.user.id}>`, embeds: [battleRollEmbed(result.view, result.side)], components: components(result.view) });
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

export async function handleBattleSelect(interaction:StringSelectMenuInteraction):Promise<boolean>{
  if(interaction.customId.startsWith("battle_roster_special|")){
    if(!interaction.guildId||!interaction.channelId)throw new GameError("Sunucu veya kanal bulunamadı.");
    if(!isGameMaster(interaction))throw new GameError("Savaş kadrosunu yalnızca oyun yöneticisi düzenleyebilir.");
    const [,sideRaw,indexRaw]=interaction.customId.split("|");
    const unitType=interaction.values[0] as BattleUnitType|undefined;
    const participantIndex=Number(indexRaw);
    if(!["A","B"].includes(sideRaw??"")||!Number.isSafeInteger(participantIndex)||participantIndex<0||!unitType||!(unitType in SPECIAL_UNITS)){
      throw new GameError("Özel birlik seçimi bozuk; `/savas kadro-ayarla` komutunu yeniden kullanın.");
    }
    const unit=SPECIAL_UNITS[unitType as keyof typeof SPECIAL_UNITS];
    const modal=new ModalBuilder()
      .setCustomId(`battle_roster_amount|${sideRaw}|${participantIndex}|${unitType}`)
      .setTitle(`${unit.name} miktarı`.slice(0,45));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("quantity")
        .setLabel("Savaş kadrosundaki asker sayısı")
        .setPlaceholder("Örn. 2500 — kadrodan çıkarmak için 0")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(9),
    ));
    await interaction.showModal(modal);
    return true;
  }
  if(!interaction.customId.startsWith("battle_naval_order|"))return false;
  if(!interaction.guildId||!interaction.channelId)throw new GameError("Sunucu veya kanal bulunamadı.");
  const battleId=interaction.customId.split("|")[1];
  const [sideRaw,orderRaw]=(interaction.values[0]??"").split("|");
  if(!battleId||!sideRaw||!["A","B"].includes(sideRaw)||!NAVAL_BATTLE_ORDERS[orderRaw as NavalBattleOrder]){
    throw new GameError("Filo emri seçimi bozuk; güncel savaş kartını kullanın.");
  }
  await interaction.deferReply({ephemeral:true});
  const side=sideRaw as BattleSideKey;
  const order=orderRaw as NavalBattleOrder;
  const view=await battleService.setNavalOrder({
    guildId:interaction.guildId,channelId:interaction.channelId,battleId,actorId:interaction.user.id,
    isGameMaster:isGameMaster(interaction),side,order
  });
  await refreshBattleCard(interaction.client,view);
  await interaction.editReply(`⚓ **${view.sides[side].country_name}** için **${NAVAL_BATTLE_ORDERS[order].label}** seçildi. Emir henüz kilitli değil; kilitlenene kadar değiştirilebilir.`);
  return true;
}

export async function handleBattleModal(interaction:ModalSubmitInteraction):Promise<boolean>{
  if(!interaction.customId.startsWith("battle_roster_amount|"))return false;
  if(!interaction.guildId||!interaction.channelId)throw new GameError("Sunucu veya kanal bulunamadı.");
  if(!isGameMaster(interaction))throw new GameError("Savaş kadrosunu yalnızca oyun yöneticisi düzenleyebilir.");
  const [,sideRaw,indexRaw,unitRaw]=interaction.customId.split("|");
  const participantIndex=Number(indexRaw);
  const unitType=unitRaw as BattleUnitType;
  if(!["A","B"].includes(sideRaw??"")||!Number.isSafeInteger(participantIndex)||participantIndex<0||!(unitType in SPECIAL_UNITS)){
    throw new GameError("Özel birlik miktarı kaydı bozuk; `/savas kadro-ayarla` komutunu yeniden kullanın.");
  }
  const quantity=Number(interaction.fields.getTextInputValue("quantity").trim());
  if(!Number.isSafeInteger(quantity)||quantity<0)throw new GameError("Asker sayısı sıfır veya pozitif bir tam sayı olmalıdır.");
  const side=sideRaw as BattleSideKey;
  const active=await battleService.active(interaction.guildId,interaction.channelId);
  if(!active)throw new GameError("Bu kanalda düzenlenebilecek aktif savaş bulunamadı.");
  const participant=active.sides[side].participants[participantIndex];
  if(!participant)throw new GameError("Savaş tarafı değişmiş; `/savas kadro-ayarla` komutunu yeniden kullanın.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const view=await battleService.setUnit({
    guildId:interaction.guildId,
    channelId:interaction.channelId,
    actorId:interaction.user.id,
    side,
    unitType,
    quantity,
    countryName:participant.country_name,
  });
  await interaction.editReply(`✅ **${participant.country_name} • ${SPECIAL_UNITS[unitType as keyof typeof SPECIAL_UNITS].name}** savaş kadrosu **${number(quantity)}** olarak ayarlandı. Tarafın açık toplamı: **${number(view.sides[side].initial_total)}**\nBaşka bir özel birlik için önceki kadro mesajındaki menüyü tekrar kullanabilirsin.`);
  return true;
}
