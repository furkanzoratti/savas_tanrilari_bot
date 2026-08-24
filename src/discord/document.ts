import { EmbedBuilder } from "discord.js";
import { BUILDINGS, MOBILIZATION_RULES, SHIPS, SIEGE_ASSETS, UNITS } from "../domain/catalog.js";
import { CULTURE_GROUPS } from "../domain/cultures.js";
import { calculateShipUpkeep, calculateUnitUpkeep } from "../domain/economy.js";
import { gold, number } from "../domain/format.js";
import { RESOURCES } from "../domain/resources.js";
import { TRADE_ROUTE_LABELS } from "../domain/trade.js";
import type { CountryDocument } from "../services/game-service.js";
import { TEMPLE_BANNER_URL } from "./assets.js";

const ruinLabels = ["Normal", "Harap • sonraki Alım Turu %0", "Toparlanıyor • sonraki Alım Turu %50"];
const phaseLabels: Record<string, string> = { OPEN: "Hareketler Açık", CLOSED: "Hareketler Kapalı", RESOLVING: "Olaylar Çözülüyor" };

type SettlementDocument = CountryDocument["settlements"][number];

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

export function renderDocument(document: CountryDocument): EmbedBuilder[] {
  const tradeSummary = document.tradeAgreements.length
    ? document.tradeAgreements.map((agreement) => `${agreement.status === "ACTIVE" ? "✅" : "⏳"} **${agreement.partner_name}** • ${TRADE_ROUTE_LABELS[agreement.route]}\n${agreement.proposer_settlement_name} (${RESOURCES[agreement.proposer_resource].label}) ⇄ ${agreement.receiver_settlement_name} (${RESOURCES[agreement.receiver_resource].label})`).join("\n\n")
    : "Aktif veya bekleyen ticaret antlaşması yok.";
  const remainingCapacity = Math.max(0, document.militaryLimit - document.militaryUsed);

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
      { name: "👑 Yönetim", value: document.playerIds.length ? document.playerIds.map((id) => `<@${id}>`).join(" • ") : "Oyuncu atanmamış." },
      { name: "🏦 Hazine", value: `**${gold(document.country.treasury)}**`, inline: true },
      { name: "👥 Özgür Nüfus", value: `**${number(document.freePopulation)}**`, inline: true },
      { name: "⚔️ Askerî Kapasite", value: `Mevcut: **${number(document.militaryUsed)}**\nSınır: ${number(document.militaryLimit)}\nKalan: ${number(remainingCapacity)}${document.manpowerPenaltyActive ? "\n⚠️ Sınır aşımı: bakım +%25" : document.militaryUsed > document.militaryLimit ? "\n⏳ Sınır aşımı: düzeltme süresi" : ""}`, inline: true },
      {
        name: "📥 Gelir Dağılımı",
        value: [
          `🏗️ Binalar: ${gold(document.totalIncomeBreakdown.building)}`,
          `👥 Halk Vergisi: ${gold(document.totalIncomeBreakdown.tax)}`,
          `🐎 Kara Ticareti: ${gold(document.totalIncomeBreakdown.landTrade)}`,
          `⚓ Deniz Ticareti: ${gold(document.totalIncomeBreakdown.seaTrade)}`
        ].join("\n"),
        inline: true
      },
      {
        name: "📈 Dönem Bilançosu",
        value: `Dönem geliri: **${gold(document.totalPayableIncome)}**\nToplam bakım: **−${gold(document.totalUpkeep)}**\nNet değişim: **${document.netIncome >= 0 ? "+" : ""}${gold(document.netIncome)}**`,
        inline: true
      },
      { name: "🤝 Ticaret Antlaşmaları", value: tradeSummary.slice(0, 1024) }
    )
    .setFooter({ text: "Tüm değerler mevcut bina, kaynak, ticaret, haraplık ve seferberlik etkileriyle hesaplanır." });

  const settlementEmbeds = document.settlements.map((settlement) => {
    const occupiedSlots = settlement.buildings.filter((building) => building.level > 0 || building.status === "BUILDING").length;
    const activeConstruction = settlement.buildings.filter((building) => building.status === "BUILDING").length;
    const culture = CULTURE_GROUPS[settlement.culture_group]?.label ?? settlement.culture_group;
    const producedResource = RESOURCES[settlement.resource_type].label;
    const fixedGarrison = renderLandForces(settlement, "GARRISON", document.country.mobilization, document.manpowerPenaltyActive);
    const army = renderLandForces(settlement, "ARMY", document.country.mobilization, document.manpowerPenaltyActive);

    const buildings = settlement.buildings.length
      ? settlement.buildings.map((building) => {
          const name = BUILDINGS[building.building_type]?.name ?? building.building_type;
          return building.status === "BUILDING"
            ? `🏗️ **${name} Sv${building.target_level}** • Tur ${building.completion_turn} • ${Math.max(0, (building.completion_turn ?? 0) - document.guild.current_turn)} tur kaldı`
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
        `Bina: **${occupiedSlots}/${settlement.slotLimit} slot** • İnşaat: **${activeConstruction}/2**`
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

    if (fixedGarrison) embed.addFields({ name: "🛡️ Garnizon", value: spacedSection(fixedGarrison), inline: true });
    if (army) embed.addFields({ name: "⚔️ Ordu", value: spacedSection(army), inline: true });

    if (settlement.ships.length) {
      const ships = settlement.ships.map((ship) => `• **${ship.quantity}** ${SHIPS[ship.ship_type]?.name ?? ship.ship_type}`).join("\n");
      const crew = settlement.ships.reduce((sum, ship) => sum + SHIPS[ship.ship_type].manpower * ship.quantity, 0);
      embed.addFields({ name: "🚢 Donanma", value: spacedSection(`${ships}\n**Mürettebat: ${number(crew)}**`), inline: true });
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
      ...(settlement.pendingSiege ?? []).map((order) => `🛠️ Tur ${order.completion_turn}: **${order.quantity}** ${SIEGE_ASSETS[order.asset_type]?.name ?? order.asset_type}`)
    ];
    if (pending.length) embed.addFields({ name: "⚙️ Üretim", value: spacedSection(pending.join("\n")) });

    return embed;
  });

  return [summary, ...settlementEmbeds];
}
