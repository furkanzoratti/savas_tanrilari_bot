import { EmbedBuilder } from "discord.js";
import { BUILDINGS, MOBILIZATION_RULES, SHIPS, SIEGE_ASSETS, UNITS } from "../domain/catalog.js";
import { gold, number } from "../domain/format.js";
import type { CountryDocument } from "../services/game-service.js";

const ruinLabels = ["Normal", "Harap — sonraki Alım Turu %0", "Toparlanıyor — sonraki Alım Turu %50"];

export function renderDocument(document: CountryDocument): EmbedBuilder[] {
  const summary = new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle(`📜 ${document.country.name} — Devlet Belgesi`)
    .setDescription(`Tur **${document.guild.current_turn}** • ${document.guild.turn_phase} • ${MOBILIZATION_RULES[document.country.mobilization].label}`)
    .addFields(
      { name: "💰 Hazine", value: gold(document.country.treasury), inline: true },
      { name: "👥 Özgür Nüfus", value: number(document.freePopulation), inline: true },
      { name: "⚔️ Askerî Personel", value: `${number(document.militaryUsed)} / ${number(document.militaryLimit)}`, inline: true },
      { name: "📈 Alım Turu Geliri", value: gold(document.totalPayableIncome), inline: true },
      { name: "🧾 Toplam Bakım", value: gold(document.totalUpkeep), inline: true },
      { name: "⚖️ Net Değişim", value: gold(document.netIncome), inline: true }
    )
    .setFooter({ text: "Rakamlar aktif binalardan anlık olarak yeniden hesaplanır." });

  const settlementEmbeds = document.settlements.map((settlement) => {
    const buildings = settlement.buildings.length
      ? settlement.buildings.map((building) => {
          const name = BUILDINGS[building.building_type]?.name ?? building.building_type;
          return building.status === "BUILDING"
            ? `🏗️ ${name} → Sv${building.target_level} (Tur ${building.completion_turn}; ${Math.max(0, (building.completion_turn ?? 0) - document.guild.current_turn)} tur)`
            : `• ${name} Sv${building.level}`;
        }).join("\n") : "Yok";
    const units = settlement.units.length
      ? settlement.units.map((unit) => `• ${number(unit.quantity)} ${UNITS[unit.unit_type]?.name ?? unit.unit_type} — ${unit.status}`).join("\n") : "Yok";
    const ships = settlement.ships.length
      ? settlement.ships.map((ship) => `• ${ship.quantity} ${SHIPS[ship.ship_type]?.name ?? ship.ship_type} — ${ship.status}`).join("\n") : "Yok";
    const assets = settlement.siegeAssets.length
      ? settlement.siegeAssets.map((asset) => `• ${asset.quantity} ${SIEGE_ASSETS[asset.asset_type as keyof typeof SIEGE_ASSETS]?.name ?? asset.asset_type}`).join("\n") : "Yok";
    const pending = [
      ...settlement.pendingRecruitment.map((wave) => `• Tur ${wave.due_turn}: ${number(wave.quantity)} ${UNITS[wave.unit_type]?.name ?? wave.unit_type}`),
      ...settlement.pendingShips.map((ship) => `• Tur ${ship.completion_turn}: ${ship.quantity} ${SHIPS[ship.ship_type]?.name ?? ship.ship_type}`)
    ].join("\n") || "Yok";

    return new EmbedBuilder()
      .setColor(settlement.ruin_stage ? 0x8b4513 : 0x3f7f5f)
      .setTitle(`🏛️ ${settlement.name}`)
      .setDescription(`${ruinLabels[settlement.ruin_stage]} • Bina slotu ${settlement.buildings.length}/${settlement.slotLimit}`)
      .addFields(
        { name: "Nüfus", value: `${number(settlement.population)} özgür\n${number(settlement.slave_population)} köle`, inline: true },
        { name: "Gelir", value: `${gold(settlement.payableIncome)}\nNormal: ${gold(settlement.grossIncome)}`, inline: true },
        { name: "Sonraki Nüfus", value: `+${number(settlement.populationGain)}`, inline: true },
        { name: "Binalar", value: buildings.slice(0, 1024) },
        { name: "Birlikler", value: units.slice(0, 1024), inline: true },
        { name: "Donanma", value: ships.slice(0, 1024), inline: true },
        { name: "Kuşatma Aletleri", value: assets.slice(0, 1024), inline: true },
        { name: "Bekleyen Teslimatlar", value: pending.slice(0, 1024) }
      );
  });
  return [summary, ...settlementEmbeds];
}
