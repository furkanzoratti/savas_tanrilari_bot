import { EmbedBuilder } from "discord.js";
import { BUILDINGS, CHARACTER_ROLES, CITY_POLICIES, MOBILIZATION_RULES, PORT_SHIP_CAPACITY, SHIPS, SIEGE_ASSETS, UNITS, fleetTransportCapacity, shipHarborRequirement } from "../domain/catalog.js";
import { CULTURE_GROUPS } from "../domain/cultures.js";
import { calculateShipUpkeep, calculateUnitUpkeep } from "../domain/economy.js";
import { SETTLEMENT_EVENT_TYPES, type SettlementEventType } from "../domain/events.js";
import { gold, number } from "../domain/format.js";
import { RESOURCES } from "../domain/resources.js";
import { SPECIAL_UNITS } from "../domain/special-units.js";
import { FORMABLE_COUNTRIES, formableModifiers } from "../domain/formable-countries.js";
import { TRADE_ROUTE_LABELS } from "../domain/trade.js";
import type { CountryDocument } from "../services/game-service.js";
import { TEMPLE_BANNER_URL } from "./assets.js";
import { renderArmyEmbed } from "./army-embed.js";

const ruinLabels = ["Normal", "Harap • sonraki Alım Turu %0", "Toparlanıyor • sonraki Alım Turu %50"];
const phaseLabels: Record<string, string> = { OPEN: "Hareketler Açık", CLOSED: "Hareketler Kapalı", RESOLVING: "Olaylar Çözülüyor" };

type SettlementDocument = CountryDocument["settlements"][number];

const DISCORD_EMBEDS_PER_MESSAGE = 10;
const DISCORD_EMBED_TEXT_PER_MESSAGE = 6_000;
const DOCUMENT_BATCH_TEXT_LIMIT = 5_900;

export function embedTextLength(embed: EmbedBuilder): number {
  const data = embed.toJSON();
  return (data.title?.length ?? 0)
    + (data.description?.length ?? 0)
    + (data.author?.name.length ?? 0)
    + (data.footer?.text.length ?? 0)
    + (data.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
}

export function batchDocumentEmbeds(embeds: EmbedBuilder[]): EmbedBuilder[][] {
  const batches: EmbedBuilder[][] = [];
  let current: EmbedBuilder[] = [];
  let currentTextLength = 0;

  for (const embed of embeds) {
    const textLength = embedTextLength(embed);
    const exceedsCount = current.length >= DISCORD_EMBEDS_PER_MESSAGE;
    const exceedsText = current.length > 0 && currentTextLength + textLength > DOCUMENT_BATCH_TEXT_LIMIT;
    if (exceedsCount || exceedsText) {
      batches.push(current);
      current = [];
      currentTextLength = 0;
    }
    current.push(embed);
    currentTextLength += textLength;
  }

  if (current.length) batches.push(current);
  return batches;
}

export { DISCORD_EMBED_TEXT_PER_MESSAGE };

function incomeLine(label: string, amount: number): string {
  return `${label}: **${gold(amount)}**`;
}

function spacedSection(value: string): string {
  return `${value.slice(0, 1022)}\n\u200B`;
}

function renderLandForces(
  settlement: SettlementDocument,
  forceType: "GARRISON" | "ARMY",
  mobilization: CountryDocument["country"]["mobilization"],
  overLimitPenalty: boolean
): string | null {
  const units = settlement.units.filter((unit) => unit.force_type === forceType);
  if (!units.length) return null;
  const upkeep = units.reduce((sum, unit) => sum + calculateUnitUpkeep(unit.unit_type, unit.quantity, unit.status, mobilization, settlement.effectiveResources, overLimitPenalty), 0);
  const rows = units.map((unit) => unit.unit_type === "observer"
    ? `• **${number(Math.ceil(unit.quantity / 200))}** Gözcü Birliği (${number(unit.quantity)} personel)`
    : `• **${number(unit.quantity)}** ${UNITS[unit.unit_type]?.name ?? unit.unit_type}`);
  return [...rows, `**Toplam:** ${number(units.reduce((sum, unit) => sum + unit.quantity, 0))} • Bakım ${gold(upkeep)}`].join("\n");
}

const mercenaryStatusLabels: Record<string, string> = {
  PENDING: "⏳ Yolda",
  ACTIVE: "✅ Aktif",
  UNPAID: "⚠️ Bakımı Ödenmedi",
  ENDED: "Sona Erdi",
  CANCELLED: "İptal Edildi",
  DESTROYED: "Yok Edildi"
};

function renderMercenaryContract(contract: CountryDocument["mercenaries"][number], currentTurn: number): string {
  const units = contract.units.filter((row) => row.current_quantity > 0)
    .map((row) => `• **${number(row.current_quantity)}** ${UNITS[row.unit_type]?.name ?? row.unit_type}`);
  const ships = contract.ships.filter((row) => row.current_quantity > 0)
    .map((row) => `• **${number(row.current_quantity)}** ${SHIPS[row.ship_type]?.name ?? row.ship_type}`);
  const assets = contract.assets.filter((row) => row.current_quantity > 0)
    .map((row) => `• **${number(row.current_quantity)}** ${SIEGE_ASSETS[row.asset_type]?.name ?? row.asset_type}`);
  const timing = contract.status === "PENDING"
    ? `Ulaşma: **Tur ${contract.arrival_turn}**`
    : `Sözleşme: **Feshedilene kadar**${contract.last_upkeep_turn === currentTurn ? " • Bu turun bakımı ödendi" : ""}`;
  return [
    `**${contract.companyName}** • ${mercenaryStatusLabels[contract.status] ?? contract.status}`,
    `${timing} • Bakım: **${gold(contract.turn_upkeep)}**`,
    ...units,
    ...ships,
    ...assets
  ].join("\n");
}

export function renderDocument(document: CountryDocument): EmbedBuilder[] {
  const tradeSummary = document.tradeAgreements.length
    ? document.tradeAgreements.map((agreement) => `${agreement.status === "ACTIVE" ? "✅" : "⏳"} **${agreement.partner_name}** • ${TRADE_ROUTE_LABELS[agreement.route]}\n${agreement.proposer_settlement_name} (${RESOURCES[agreement.proposer_resource].label}) ⇄ ${agreement.receiver_settlement_name} (${RESOURCES[agreement.receiver_resource].label})`).join("\n\n")
    : "Aktif veya bekleyen ticaret antlaşması yok.";
  const remainingCapacity = Math.max(0, document.militaryLimit - document.militaryUsed);
  const characterSummary = (document.characters ?? []).length
    ? (document.characters ?? []).map((character) => {
        const role = CHARACTER_ROLES[character.role];
        const location = character.assigned_settlement_name
          ? `${character.assigned_country_name ?? document.country.name} • ${character.assigned_settlement_name}`
          : null;
        const assignment = character.assignment === "NONE" ? "Görev bekliyor"
          : character.assignment === "AGORA" ? "Agora / Forum"
          : character.assignment === "ARMY" ? `Ordu komutanı${character.assigned_army_name ? ` • ${character.assigned_army_name}` : ""}`
          : character.assignment === "CURIA" ? "Curia"
          : character.assignment === "ASSIMILATION" ? `Asimilasyon görevi${location ? ` • ${location}` : ""} • Tur ${character.assignment_ready_turn}`
          : character.assignment === "ESPIONAGE" ? `Casusluk görevi • yolda${location ? ` • ${location}` : ""}`
          : character.assignment === "ESPIONAGE_RETURNING" ? `Casusluk görevi tamamlandı • dönüş yolunda${location ? ` • ${location}` : ""}`
          : character.assignment === "CAPTURED" ? `Yakalandı${location ? ` • ${location}` : ""}`
          : character.assignment === "COUNTERINTELLIGENCE_TRAVELING_COUNTRY" ? `Ülke karşı casusluğuna gidiyor • ${document.country.name}`
          : character.assignment === "COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT" ? `Şehir karşı casusluğuna gidiyor${location ? ` • ${location}` : ""}`
          : character.assignment === "COUNTERINTELLIGENCE_COUNTRY" ? `Ülke çapında karşı casusluk • ${document.country.name}`
          : `Şehir karşı casusluğu${location ? ` • ${location}` : ""}`;
        return `${role.emoji} **${character.name}** — ${role.label} (+${character.skill_bonus})\n↳ ${assignment}`;
      }).join("\n\n")
    : "Henüz yetiştirilmiş devlet görevlisi yok.";
  const formable = document.country.active_formable_key ? FORMABLE_COUNTRIES[document.country.active_formable_key] : null;
  const mercenarySummary = (document.mercenaries ?? []).length
    ? (document.mercenaries ?? []).map((contract) => `• **${contract.companyName}** — ${contract.settlement_name}\n↳ ${mercenaryStatusLabels[contract.status] ?? contract.status} • Bakım ${gold(contract.turn_upkeep)}`).join("\n\n")
    : "Aktif veya yolda paralı asker sözleşmesi yok.";

  const summary = new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle(`📜 ${document.country.name} • Devlet Belgesi`)
    .setDescription([
      `**Tur ${document.guild.current_turn}** • ${phaseLabels[document.guild.turn_phase] ?? document.guild.turn_phase}`,
      `Seferberlik: **${MOBILIZATION_RULES[document.country.mobilization].label}**`,
      "_Gelir, nüfus ve bakım işlemleri Alım Turlarında hazineye uygulanır._"
    ].join("\n"))
    .setImage(TEMPLE_BANNER_URL)
    .addFields(
      { name: "👑 Yönetim", value: spacedSection(document.playerIds.length ? document.playerIds.map((id) => `<@${id}>`).join(" • ") : "Oyuncu atanmamış.") },
      { name: "🏦 Hazine", value: spacedSection(`**${gold(document.country.treasury)}**`), inline: true },
      { name: "👥 Özgür Nüfus", value: spacedSection(`**${number(document.freePopulation)}**`), inline: true },
      { name: "⚔️ Askerî Kapasite", value: spacedSection(`Mevcut: **${number(document.militaryUsed)}**\nSınır: ${number(document.militaryLimit)}\nKalan: ${number(remainingCapacity)}${document.manpowerPenaltyActive ? "\n⚠️ Sınır aşımı: bakım +%25" : document.militaryUsed > document.militaryLimit ? "\n⏳ Sınır aşımı: düzeltme süresi" : ""}`), inline: true },
      { name: "🛡️ Özel Birlik Erişimi", value: spacedSection((document.specialUnitUnlocks ?? []).length ? (document.specialUnitUnlocks ?? []).map((unitType) => `• **${SPECIAL_UNITS[unitType].name}**`).join("\n") : "Özel birlik erişimi bulunmuyor.") },
      ...(formable ? [{ name: `${formable.emoji} Kurulabilir Ülke Bonusları`, value: spacedSection(formable.buffs.map((buff) => `• ${buff}`).join("\n")) }] : []),
      {
        name: "📥 Gelir Dağılımı",
        value: spacedSection([
          `🏗️ Binalar: ${gold(document.totalIncomeBreakdown.building)}`,
          `👥 Halk Vergisi: ${gold(document.totalIncomeBreakdown.tax)}`,
          `🐎 Kara Ticareti: ${gold(document.totalIncomeBreakdown.landTrade)}`,
          `⚓ Deniz Ticareti: ${gold(document.totalIncomeBreakdown.seaTrade)}`
        ].join("\n")),
        inline: true
      },
      {
        name: "📈 Dönem Bilançosu",
        value: spacedSection(`Dönem geliri: **${gold(document.totalPayableIncome)}**\nToplam bakım: **−${gold(document.totalUpkeep)}**\nNet değişim: **${document.netIncome >= 0 ? "+" : ""}${gold(document.netIncome)}**`),
        inline: true
      },
      { name: "🎓 Devlet Görevlileri", value: spacedSection(characterSummary) },
      { name: "🪙 Paralı Asker Sözleşmeleri", value: spacedSection(mercenarySummary) },
      { name: "🛡️ Müttefikler", value: spacedSection((document.allies ?? []).length
        ? (document.allies ?? []).map((ally) => `• **${ally.name}**`).join("\n")
        : "Aktif müttefik bulunmuyor.") },
      { name: "🏛️ Üye Olunan Paktlar", value: spacedSection((document.pacts ?? []).length
        ? (document.pacts ?? []).map((pact) => `• **${pact.name}** — ${pact.purpose}`).join("\n")
        : "Herhangi bir pakta üye değil.") },
      { name: "🤝 Ticaret Antlaşmaları", value: spacedSection(tradeSummary) }
    )
    .setFooter({ text: "Tüm değerler mevcut bina, kaynak, ticaret, haraplık ve seferberlik etkileriyle hesaplanır." });

  const settlementEmbeds = document.settlements.map((settlement) => {
    const occupiedSlots = settlement.buildings.filter((building) => building.level > 0 || building.status === "BUILDING").length;
    const activeConstruction = settlement.buildings.filter((building) => building.status === "BUILDING").length;
    const culture = CULTURE_GROUPS[settlement.culture_group]?.label ?? settlement.culture_group;
    const producedResource = RESOURCES[settlement.resource_type].label;
    const fixedGarrison = renderLandForces(settlement, "GARRISON", document.country.mobilization, document.manpowerPenaltyActive);
    const army = renderLandForces(settlement, "ARMY", document.country.mobilization, document.manpowerPenaltyActive);
    const assimilationDiplomat = document.characters.find((character) => character.assignment === "ASSIMILATION" && character.assigned_settlement_id === settlement.id);
    const assimilationTurn = settlement.is_conquered && settlement.conquered_turn !== null
      ? settlement.conquered_turn + 6 - (assimilationDiplomat ? 1 : 0)
      : null;

    const buildings = settlement.buildings.length
      ? settlement.buildings.map((building) => {
          const definition = BUILDINGS[building.building_type];
          const name = definition?.name ?? building.building_type;
          return building.status === "BUILDING"
            ? `🏗️ **${name} Sv${building.target_level}** • Tur ${building.completion_turn} • ${Math.max(0, (building.completion_turn ?? 0) - document.guild.current_turn)} tur kaldı`
            : building.status === "SABOTAGED"
              ? `🕵️ **${name} Sv${building.level}** • Sabotaj nedeniyle geçici olarak devre dışı`
              : `• ${name} Sv${building.level}`;
        }).join("\n")
      : "Henüz bina bulunmuyor.";

    const resourceDetails = settlement.effectiveResources.map((resource, index) => {
      const source = index === 0 ? "Yerel üretim" : "Ticaret etkisi";
      return `**${RESOURCES[resource].label}** • ${source}\n${RESOURCES[resource].effects.map((effect) => `• ${effect}`).join("\n")}`;
    }).join("\n\n");

    const hasActivePort = settlement.buildings.some((building) => building.building_type === "port" && building.status === "ACTIVE" && building.level >= 1);
    const incomeLines = [
      incomeLine("🏗️ Binalar", settlement.incomeBreakdown.building),
      incomeLine("👥 Halk Vergisi", settlement.incomeBreakdown.tax),
      incomeLine("🐎 Kara Ticareti", settlement.incomeBreakdown.landTrade)
    ];
    if (hasActivePort) incomeLines.push(incomeLine("⚓ Deniz Ticareti", settlement.incomeBreakdown.seaTrade));
    const incomes = [...incomeLines, `**Toplam: ${gold(settlement.payableIncome)}**`].join("\n");

    const embed = new EmbedBuilder()
      .setColor(settlement.ruin_stage ? 0x9a5a2e : settlement.is_conquered ? 0x8c6d46 : 0x3f7f5f)
      .setTitle(`🏛️ ${settlement.name} • Yerleşke Belgesi`)
      .setDescription([
        `**${ruinLabels[settlement.ruin_stage]}** • ${settlement.is_conquered ? `Fethedilmiş${settlement.conquered_turn !== null ? ` (Tur ${settlement.conquered_turn})` : ""}` : "Yerleşik Toprak"}`,
        ...(assimilationTurn === null ? [] : [`Asimilasyon: **Tur ${assimilationTurn}**${assimilationDiplomat ? ` • 🤝 ${assimilationDiplomat.name}` : ""}`]),
        `Bina: **${occupiedSlots}/${settlement.slotLimit} slot** • İnşaat: **${activeConstruction}/${settlement.constructionLimit ?? 2}**${settlement.is_coastal ? " • ⚓ Kıyı" : ""}`
      ].join("\n"))
      .addFields(
        { name: "🏺 Kültür", value: spacedSection(`**${culture}**`), inline: true },
        { name: "📦 Yerel Hammadde", value: spacedSection(`**${producedResource}**`), inline: true },
        { name: "🏦 Yerel Hazine", value: spacedSection(`**${gold(settlement.local_treasury)}**`), inline: true },
        {
          name: "👥 Nüfus",
          value: spacedSection([
            `Özgür: **${number(settlement.population)}**`,
            `Köle: ${number(settlement.slave_population)}`,
            "",
            "🎖️ **Ordu Limiti**",
            `Mevcut: **${number(settlement.militaryUsed)}**`,
            `Kapasite: **${number(settlement.militaryLimit)}**`,
            "",
            "🏋️ **Eğitim Kapasitesi**",
            `Bu Alım Turu: **${number(settlement.trainingUsed ?? 0)}/${number(settlement.trainingCapacity ?? 0)}**`,
            `Kalan: **${number(settlement.trainingRemaining ?? 0)}**`
          ].join("\n")),
          inline: true
        },
        { name: "💰 Gelir Kalemleri", value: spacedSection(incomes), inline: true },
        { name: "🧾 Yerleşke Giderleri", value: spacedSection(`Bina: ${gold(settlement.buildingUpkeep)}\nOrdu: ${gold(settlement.unitUpkeep)}\nDonanma: ${gold(settlement.shipUpkeep)}\n**Toplam: ${gold(settlement.totalSettlementUpkeep)}**`), inline: true },
        { name: "🌐 Etkin Kaynaklar ve Etkileri", value: spacedSection(resourceDetails) },
        { name: "🏗️ Binalar ve İnşaatlar", value: spacedSection(buildings) }
      );

    const activeEvents = (Object.keys(SETTLEMENT_EVENT_TYPES) as SettlementEventType[])
      .filter((type) => settlement[SETTLEMENT_EVENT_TYPES[type].stateColumn])
      .map((type) => `${SETTLEMENT_EVENT_TYPES[type].emoji} **${SETTLEMENT_EVENT_TYPES[type].label}**`);
    if (activeEvents.length) embed.addFields({ name: "🚨 Aktif Yerleşke Olayları", value: spacedSection(activeEvents.join("\n")) });
    if (settlement.incomePenalty) {
      embed.addFields({
        name: "📉 Süreli Gelir Cezası",
        value: spacedSection(
          `**%${settlement.incomePenalty.penalty_percent}** gelir kaybı • Kalan: **${settlement.incomePenalty.remaining_acquisition_turns} Alım Turu**\n` +
          `Neden: ${settlement.incomePenalty.reason}`
        )
      });
    }

    const policies = settlement.policies ?? [];
    const hasCuria = settlement.buildings.some((building) => building.building_type === "curia" && building.status === "ACTIVE" && building.level > 0);
    if (hasCuria || policies.length || (settlement.unrestRisk ?? 0) > 0 || (settlement.starvationBonus ?? 0) > 0) {
      const policyLines = policies.length
        ? policies.map((policy) => `${policy.status === "ACTIVE" ? "✅" : "⏳"} ${policy.slot}. **${CITY_POLICIES[policy.policy_key]?.label ?? policy.policy_key}**${policy.status === "PENDING" ? ` • Tur ${policy.activation_turn}` : ""}`)
        : ["Aktif politika bulunmuyor."];
      if ((settlement.unrestRisk ?? 0) > 0) policyLines.push(`⚠️ Huzursuzluk riski: **%${settlement.unrestRisk}**`);
      if ((settlement.starvationBonus ?? 0) > 0) policyLines.push(`🏰 Açlığa dayanıklılık: **+${settlement.starvationBonus} tur**`);
      embed.addFields({ name: "⚖️ Şehir Politikaları ve Etkileri", value: spacedSection(policyLines.join("\n")) });
    }
    if (fixedGarrison) {
      const garrisonText = `${fixedGarrison}${settlement.temporaryMilitia ? `\n• **${number(settlement.temporaryMilitia)}** Geçici Savunma Milisi` : ""}`;
      embed.addFields({ name: "🛡️ Garnizon", value: spacedSection(garrisonText), inline: true });
    }
    if (army) embed.addFields({ name: "⚔️ Ordu", value: spacedSection(army), inline: true });

    if ((settlement.mercenaries ?? []).length) {
      embed.addFields({
        name: "🪙 Paralı Askerler",
        value: spacedSection((settlement.mercenaries ?? []).map((contract) => renderMercenaryContract(contract, document.guild.current_turn)).join("\n\n"))
      });
    }

    if (settlement.ships.length) {
      const ships = settlement.ships.map((ship) => `• **${ship.quantity}** ${SHIPS[ship.ship_type]?.name ?? ship.ship_type}`).join("\n");
      const crew = settlement.ships.reduce((sum, ship) => sum + SHIPS[ship.ship_type].manpower * ship.quantity, 0);
      const fleet = settlement.ships.reduce<Partial<Record<keyof typeof SHIPS, number>>>((result, ship) => {
        result[ship.ship_type] = (result[ship.ship_type] ?? 0) + ship.quantity;
        return result;
      }, {});
      const transportMultiplier = formableModifiers(document.country.active_formable_key).shipTransportMultiplier ?? 1;
      const transport = fleetTransportCapacity(fleet, transportMultiplier);
      embed.addFields({ name: "🚢 Donanma", value: spacedSection(`${ships}\n**Mürettebat: ${number(crew)}**\n**Asker Taşıma: ${number(transport)}**`), inline: true });
    }
    if (hasActivePort) {
      const reserveHarbor = settlement.ships
        .filter((ship) => ship.status === "RESERVE")
        .reduce((sum, ship) => sum + shipHarborRequirement(ship.ship_type, ship.quantity), 0);
      const productionHarbor = settlement.pendingShips
        .reduce((sum, ship) => sum + shipHarborRequirement(ship.ship_type, ship.quantity), 0);
      embed.addFields({
        name: "⚓ Liman Kapasitesi",
        value: spacedSection(`Kullanım: **${number(reserveHarbor + productionHarbor)}/${number(PORT_SHIP_CAPACITY)} rıhtım puanı**\nRezerv: ${number(reserveHarbor)} • Üretim: ${number(productionHarbor)}`),
        inline: true
      });
    }
    if (settlement.siegeAssets.length) {
      const assets = settlement.siegeAssets.map((asset) => `• **${asset.quantity}** ${SIEGE_ASSETS[asset.asset_type as keyof typeof SIEGE_ASSETS]?.name ?? asset.asset_type}`).join("\n");
      embed.addFields({ name: "🛠️ Kuşatma Aletleri", value: spacedSection(assets), inline: true });
    }
    const pending = [
      ...settlement.pendingRecruitment.map((wave) => wave.unit_type === "observer"
        ? `👁️ Tur ${wave.due_turn}: **1 Gözcü Birliği** (${number(wave.quantity)} personel)`
        : `⚔️ Tur ${wave.due_turn}: **${number(wave.quantity)}** ${UNITS[wave.unit_type]?.name ?? wave.unit_type}`),
      ...settlement.pendingShips.map((ship) => `🚢 Tur ${ship.completion_turn}: **${ship.quantity}** ${SHIPS[ship.ship_type]?.name ?? ship.ship_type}`),
      ...(settlement.pendingSiege ?? []).map((order) => `🛠️ Tur ${order.completion_turn}: **${order.quantity}** ${SIEGE_ASSETS[order.asset_type]?.name ?? order.asset_type}`),
      ...(settlement.pendingGarrison ?? []).map((order) => `🛡️ Tur ${order.completion_turn}: **${number(order.personnel_reserved)}** zorunlu garnizon • ${gold(order.paid_amount)} ödendi`)
    ];
    if (pending.length) embed.addFields({ name: "⚙️ Üretim", value: spacedSection(pending.join("\n")) });

    return embed;
  });

  const armyEmbeds = (document.armies ?? []).map(renderArmyEmbed);

  return [summary, ...settlementEmbeds, ...armyEmbeds];
}
