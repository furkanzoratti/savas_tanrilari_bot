import { EmbedBuilder } from "discord.js";
import { BUILDINGS, MOBILIZATION_RULES, SHIPS, SIEGE_ASSETS, UNITS } from "../domain/catalog.js";
import { calculateShipUpkeep, calculateUnitUpkeep } from "../domain/economy.js";
import { TRADE_ROUTE_LABELS } from "../domain/trade.js";
import { RESOURCES } from "../domain/resources.js";
import { gold, number } from "../domain/format.js";
import type { CountryDocument } from "../services/game-service.js";
import { TEMPLE_BANNER_URL } from "./assets.js";

const ruinLabels = ["Normal", "Harap — sonraki Alım Turu %0", "Toparlanıyor — sonraki Alım Turu %50"];
const phaseLabels: Record<string, string> = { OPEN: "Hareketler Açık", CLOSED: "Hareketler Kapalı", RESOLVING: "Olaylar Çözülüyor" };
const unitStatusLabels = { GARRISON: "Garnizon", FIELD_FRIENDLY: "Dost Bölgede Sefer", FIELD_HOSTILE: "Düşman Bölgesinde Sefer" } as const;
const shipStatusLabels = { RESERVE: "Limanda/Rezerv", ACTIVE: "Aktif Donanma", HOSTILE: "Düşman Sularında" } as const;

function incomeLine(label: string, amount: number, buildingBonus: number): string {
  return `${label}: **${gold(amount)}**${buildingBonus ? ` (bina katkısı ${buildingBonus > 0 ? "+" : ""}${gold(buildingBonus)})` : ""}`;
}

export function renderDocument(document: CountryDocument): EmbedBuilder[] {
  const templeHeader = new EmbedBuilder().setColor(0xc59b45).setImage(TEMPLE_BANNER_URL);
  const tradeSummary = document.tradeAgreements.length
    ? document.tradeAgreements.map((agreement) => `${agreement.status === "ACTIVE" ? "✅" : "⏳"} ${agreement.partner_name} • ${TRADE_ROUTE_LABELS[agreement.route]}\n${agreement.proposer_settlement_name} (${RESOURCES[agreement.proposer_resource].label}) ⇄ ${agreement.receiver_settlement_name} (${RESOURCES[agreement.receiver_resource].label})`).join("\n\n")
    : "Aktif veya bekleyen antlaşma yok.";

  const summary = new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle(`📜 ${document.country.name} — Devlet Belgesi`)
    .setDescription([
      `**Tur ${document.guild.current_turn}** • ${phaseLabels[document.guild.turn_phase] ?? document.guild.turn_phase}`,
      `Seferberlik: **${MOBILIZATION_RULES[document.country.mobilization].label}**`,
      "Gelir ve nüfus hazinede yalnızca Alım Turlarında işlenir; aşağıdaki rakamlar güncel tahmindir."
    ].join("\n"))
    .addFields(
      { name: "👑 Ülkeye Bağlı Oyuncular", value: document.playerIds.length ? document.playerIds.map((id) => `<@${id}>`).join(" • ") : "Henüz oyuncu atanmamış." },
      { name: "💰 Hazine", value: gold(document.country.treasury), inline: true },
      { name: "👥 Özgür Nüfus", value: number(document.freePopulation), inline: true },
      { name: "⚔️ Askerî Personel", value: `${number(document.militaryUsed)} / ${number(document.militaryLimit)}`, inline: true },
      {
        name: "📊 Alım Turu Gelirleri",
        value: [
          `🏛️ Yerleşke: ${gold(document.totalIncomeBreakdown.settlement)}`,
          `⚖️ Vergi: ${gold(document.totalIncomeBreakdown.tax)}`,
          `🐎 Kara Ticareti: ${gold(document.totalIncomeBreakdown.landTrade)}`,
          `⚓ Deniz Ticareti: ${gold(document.totalIncomeBreakdown.seaTrade)}`,
          `**Toplam: ${gold(document.totalPayableIncome)}**`
        ].join("\n"),
        inline: true
      },
      { name: "🧾 Bakım ve Net", value: `Toplam bakım: **${gold(document.totalUpkeep)}**\nHazineye net: **${gold(document.netIncome)}**`, inline: true },
      { name: "🤝 Ticaret Antlaşmaları", value: tradeSummary.slice(0, 1024) }
    )
    .setFooter({ text: "Bina, seferberlik, haraplık ve ticaret etkileri anlık yeniden hesaplanır." });

  const settlementEmbeds = document.settlements.map((settlement) => {
    const occupiedSlots = settlement.buildings.filter((building) => building.level > 0 || building.status === "BUILDING").length;
    const activeConstruction = settlement.buildings.filter((building) => building.status === "BUILDING").length;
    const buildings = settlement.buildings.length
      ? settlement.buildings.map((building) => {
          const name = BUILDINGS[building.building_type]?.name ?? building.building_type;
          return building.status === "BUILDING"
            ? `🏗️ ${name} → Sv${building.target_level} • Tur ${building.completion_turn} (${Math.max(0, (building.completion_turn ?? 0) - document.guild.current_turn)} tur kaldı)`
            : `• ${name} Sv${building.level}`;
        }).join("\n")
      : "Bina yok.";

    const units = settlement.units.length
      ? settlement.units.map((unit) => {
          const upkeep = calculateUnitUpkeep(unit.unit_type, unit.quantity, unit.status, document.country.mobilization, settlement.effectiveResources);
          return `• ${number(unit.quantity)} ${UNITS[unit.unit_type]?.name ?? unit.unit_type}\n  ${unitStatusLabels[unit.status]} • Bakım ${gold(upkeep)}`;
        }).join("\n")
      : "Birlik yok.";

    const ships = settlement.ships.length
      ? settlement.ships.map((ship) => {
          const upkeep = calculateShipUpkeep(ship.ship_type, ship.quantity, ship.status, document.country.mobilization);
          return `• ${ship.quantity} ${SHIPS[ship.ship_type]?.name ?? ship.ship_type}\n  ${shipStatusLabels[ship.status]} • Bakım ${gold(upkeep)}`;
        }).join("\n")
      : "Donanma yok.";

    const assets = settlement.siegeAssets.length
      ? settlement.siegeAssets.map((asset) => `• ${asset.quantity} ${SIEGE_ASSETS[asset.asset_type as keyof typeof SIEGE_ASSETS]?.name ?? asset.asset_type}`).join("\n")
      : "Kuşatma aleti yok.";

    const pending = [
      ...settlement.pendingRecruitment.map((wave) => `⚔️ Tur ${wave.due_turn}: ${number(wave.quantity)} ${UNITS[wave.unit_type]?.name ?? wave.unit_type}`),
      ...settlement.pendingShips.map((ship) => `🚢 Tur ${ship.completion_turn}: ${ship.quantity} ${SHIPS[ship.ship_type]?.name ?? ship.ship_type}`)
    ].join("\n") || "Bekleyen teslimat yok.";

    const resourceDetails = settlement.effectiveResources.map((resource, index) => {
      const source = index === 0 ? "Üretim" : "Ticaret";
      return `**${RESOURCES[resource].label}** (${source})\n${RESOURCES[resource].effects.map((effect) => `• ${effect}`).join("\n")}`;
    }).join("\n\n");

    const incomes = [
      incomeLine("🏛️ Yerleşke", settlement.incomeBreakdown.settlement, settlement.buildingIncomeBonus.settlement),
      incomeLine("⚖️ Vergi", settlement.incomeBreakdown.tax, settlement.buildingIncomeBonus.tax),
      incomeLine("🐎 Kara Ticareti", settlement.incomeBreakdown.landTrade, settlement.buildingIncomeBonus.landTrade),
      incomeLine("⚓ Deniz Ticareti", settlement.incomeBreakdown.seaTrade, settlement.buildingIncomeBonus.seaTrade),
      `**Toplam: ${gold(settlement.payableIncome)}**`
    ].join("\n");

    return new EmbedBuilder()
      .setColor(settlement.ruin_stage ? 0x8b4513 : 0x3f7f5f)
      .setTitle(`🏛️ ${settlement.name}`)
      .setDescription([
        `Durum: **${ruinLabels[settlement.ruin_stage]}**`,
        `Bina slotları: **${occupiedSlots}/${settlement.slotLimit}** • Devam eden inşaat: **${activeConstruction}/2**`
      ].join("\n"))
      .addFields(
        { name: "📦 Hammadde ve Etkileri", value: resourceDetails.slice(0, 1024) },
        { name: "👥 Nüfus", value: `${number(settlement.population)} özgür\n${number(settlement.slave_population)} köle\nSonraki Alım Turu: +${number(settlement.populationGain)}`, inline: true },
        { name: "💰 Gelir Kalemleri", value: incomes.slice(0, 1024), inline: true },
        { name: "🧾 Şehir Bakımı", value: `Binalar: ${gold(settlement.buildingUpkeep)}\nAskerler: ${gold(settlement.unitUpkeep)}\nDonanma: ${gold(settlement.shipUpkeep)}\n**Toplam: ${gold(settlement.totalSettlementUpkeep)}**`, inline: true },
        { name: "🏗️ Binalar", value: buildings.slice(0, 1024) },
        { name: "⚔️ Birlikler", value: units.slice(0, 1024), inline: true },
        { name: "🚢 Donanma", value: ships.slice(0, 1024), inline: true },
        { name: "🛠️ Kuşatma Aletleri", value: assets.slice(0, 1024), inline: true },
        { name: "⏳ Bekleyen Teslimatlar", value: pending.slice(0, 1024) }
      );
  });
  return [templeHeader, summary, ...settlementEmbeds];
}