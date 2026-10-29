import { EmbedBuilder } from "discord.js";
import type { NavalUnitType } from "../domain/battle.js";
import { SHIPS } from "../domain/catalog.js";
import { number } from "../domain/format.js";
import type { FleetPoolShip, FleetPoolView } from "../services/fleet-service.js";

const PAGE_DESCRIPTION_LIMIT = 3_900;

function shipLabel(shipType: NavalUnitType): string {
  return SHIPS[shipType]?.name ?? shipType;
}

function shipLines(ships: FleetPoolShip[]): string {
  return ships
    .slice()
    .sort((left, right) => shipLabel(left.ship_type).localeCompare(shipLabel(right.ship_type), "tr"))
    .map((ship) => `• **${shipLabel(ship.ship_type)}:** ${number(ship.available)}`)
    .join("\n");
}

export function renderFleetPool(countryName: string, pool: FleetPoolView): EmbedBuilder[] {
  const populatedSettlements = pool.settlements.filter((settlement) => settlement.total > 0);
  const sections = [
    [
      "Limanlarda bulunan ve henüz herhangi bir filoya tahsis edilmemiş **gemiler** aşağıda gösterilir.",
      "Filolarda veya tamirde bulunan gemiler bu havuza dahil değildir.",
      `**Liman:** ${number(populatedSettlements.length)} • **Toplam müsait gemi:** ${number(pool.grandTotal)}`
    ].join("\n"),
    ...populatedSettlements.map((settlement) => [
      `### ⚓ ${settlement.settlement_name}`,
      settlement.ships.length ? shipLines(settlement.ships) : "• Filolara tahsis edilmemiş gemi bulunmuyor.",
      `**Liman toplamı:** ${number(settlement.total)} gemi`
    ].join("\n")),
    [
      "### 📊 Genel Toplam",
      pool.totals.length ? shipLines(pool.totals) : "• Filolara tahsis edilmemiş gemi bulunmuyor.",
      `**Genel havuz:** ${number(pool.grandTotal)} gemi`
    ].join("\n")
  ];

  const pages: string[] = [];
  let page = "";
  for (const section of sections) {
    const candidate = page ? `${page}\n\n${section}` : section;
    if (candidate.length <= PAGE_DESCRIPTION_LIMIT) {
      page = candidate;
      continue;
    }
    if (page) pages.push(page);
    page = section;
  }
  if (page) pages.push(page);

  return pages.map((description, index) => new EmbedBuilder()
    .setColor(index === pages.length - 1 ? 0x2878a8 : 0xc59b45)
    .setTitle(`🚢 ${countryName} • Gemi Havuzu${pages.length > 1 ? ` • Sayfa ${index + 1}/${pages.length}` : ""}`)
    .setDescription(description)
    .setFooter({ text: `Genel havuz: ${number(pool.grandTotal)} gemi` }));
}
