import { EmbedBuilder } from "discord.js";
import { BATTLE_UNIT_STATS, type BattleUnitType } from "../domain/battle.js";
import { UNITS } from "../domain/catalog.js";
import { number } from "../domain/format.js";
import type { ArmyPoolUnit, ArmyPoolView } from "../services/army-service.js";

const PAGE_DESCRIPTION_LIMIT = 3_900;

function unitLabel(unitType: BattleUnitType): string {
  return BATTLE_UNIT_STATS[unitType]?.label ?? UNITS[unitType]?.name ?? unitType;
}

function unitLines(units: ArmyPoolUnit[]): string {
  return units
    .slice()
    .sort((left, right) => unitLabel(left.unit_type).localeCompare(unitLabel(right.unit_type), "tr"))
    .map((unit) => `• **${unitLabel(unit.unit_type)}:** ${number(unit.available)}`)
    .join("\n");
}

export function renderArmyPool(countryName: string, pool: ArmyPoolView): EmbedBuilder[] {
  const sections = [
    [
      "Yerleşkelerde bulunan ve henüz herhangi bir orduya tahsis edilmemiş **saha birlikleri** aşağıda gösterilir.",
      "Garnizonlar, milisler ve hâlihazırda ordularda bulunan askerler bu havuza dahil değildir.",
      `**Yerleşke:** ${number(pool.settlements.length)} • **Toplam müsait asker:** ${number(pool.grandTotal)}`
    ].join("\n"),
    ...pool.settlements.map((settlement) => [
      `### 🏘️ ${settlement.settlement_name}`,
      settlement.units.length ? unitLines(settlement.units) : "• Ordulara tahsis edilmemiş saha birliği bulunmuyor.",
      `**Yerleşke toplamı:** ${number(settlement.total)} asker`
    ].join("\n")),
    [
      "### 📊 Genel Toplam",
      pool.totals.length ? unitLines(pool.totals) : "• Ordulara tahsis edilmemiş saha birliği bulunmuyor.",
      `**Genel havuz:** ${number(pool.grandTotal)} asker`
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
    .setColor(index === pages.length - 1 ? 0x2e8b57 : 0xc59b45)
    .setTitle(`⚔️ ${countryName} • Asker Havuzu${pages.length > 1 ? ` • Sayfa ${index + 1}/${pages.length}` : ""}`)
    .setDescription(description)
    .setFooter({ text: `Genel havuz: ${number(pool.grandTotal)} asker` }));
}
