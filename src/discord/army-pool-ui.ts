import { EmbedBuilder } from "discord.js";
import { BATTLE_UNIT_STATS, type BattleUnitType } from "../domain/battle.js";
import { UNITS } from "../domain/catalog.js";
import { number } from "../domain/format.js";
import type { ArmyPoolUnit, ArmyPoolView } from "../services/army-service.js";

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
  const embeds: EmbedBuilder[] = [
    new EmbedBuilder()
      .setColor(0x8f6b35)
      .setTitle(`⚔️ ${countryName} • Asker Havuzu`)
      .setDescription([
        "Yerleşkelerde bulunan ve henüz herhangi bir orduya tahsis edilmemiş **saha birlikleri** aşağıda gösterilir.",
        "Garnizonlar, milisler ve hâlihazırda ordularda bulunan askerler bu havuza dahil değildir.",
        `**Yerleşke:** ${number(pool.settlements.length)} • **Toplam müsait asker:** ${number(pool.grandTotal)}`
      ].join("\n\n"))
  ];

  for (const settlement of pool.settlements) {
    embeds.push(
      new EmbedBuilder()
        .setColor(settlement.total > 0 ? 0xc59b45 : 0x4b4d52)
        .setTitle(`🏘️ ${settlement.settlement_name}`)
        .setDescription(settlement.units.length ? unitLines(settlement.units) : "Ordulara tahsis edilmemiş saha birliği bulunmuyor.")
        .setFooter({ text: `Yerleşke havuzu: ${number(settlement.total)} asker` })
    );
  }

  embeds.push(
    new EmbedBuilder()
      .setColor(0x2e8b57)
      .setTitle("📊 Genel Toplam • Orduya Eklenmemiş Birlikler")
      .setDescription(pool.totals.length ? unitLines(pool.totals) : "Ordulara tahsis edilmemiş saha birliği bulunmuyor.")
      .setFooter({ text: `Genel havuz: ${number(pool.grandTotal)} asker` })
  );
  return embeds;
}
