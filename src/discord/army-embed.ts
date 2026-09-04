import { EmbedBuilder } from "discord.js";
import { BATTLE_UNIT_STATS, type BattleUnitType } from "../domain/battle.js";
import { number } from "../domain/format.js";
import type { ArmyView } from "../services/army-service.js";

const percent = (value: number): string => `%${Math.round(value * 100)}`;
const trimField = (value: string): string => value.length <= 1024 ? value : `${value.slice(0, 1018)}\n…`;

export function renderArmyEmbed(army: ArmyView): EmbedBuilder {
  const unitTotals = Object.entries(army.composition)
    .filter(([, quantity]) => Number(quantity ?? 0) > 0)
    .sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0))
    .map(([unitType, quantity]) => `• **${number(Number(quantity))}** ${BATTLE_UNIT_STATS[unitType as BattleUnitType]?.label ?? unitType}`)
    .join("\n") || "Henüz asker tahsis edilmedi.";
  const sources = new Map<string, string[]>();
  for (const unit of army.units) {
    const rows = sources.get(unit.settlement_name) ?? [];
    rows.push(`${number(unit.quantity)} ${BATTLE_UNIT_STATS[unit.unit_type]?.label ?? unit.unit_type}`);
    sources.set(unit.settlement_name, rows);
  }
  const sourceText = [...sources.entries()].map(([settlement, rows]) => `**${settlement}:** ${rows.join(" • ")}`).join("\n") || "Kaynak yerleşke bulunmuyor.";
  const state = army.active_battle_id ? "⚔️ Etkin savaşa bağlı" : "✅ Kullanıma hazır";
  const activation = army.composition_active
    ? `Çarpışma **×${army.assessment.clashMultiplier.toFixed(2)}** • Hasar **×${army.assessment.damageMultiplier.toFixed(2)}**`
    : `⏸️ Katsayılar Tur ${army.composition_activation_turn ?? "?"} başlangıcına kadar pasif`;
  return new EmbedBuilder()
    .setColor(army.active_battle_id ? 0xb33a3a : 0x3f7f5f)
    .setTitle(`⚔️ ${army.name} • Ordu Belgesi`)
    .setDescription(`**${army.country_name}** • ${state}\nToplam mevcut: **${number(army.total)}**\nKomutan: **${army.commander_name ?? "Atanmamış"}**${army.commander_name ? ` (+${army.commander_skill_bonus})` : ""}`)
    .addFields(
      {
        name: "🧭 Kompozisyon Durumu",
        value: [
          `**${army.assessment.label}**`, activation,
          `Hat ${percent(army.assessment.roleShares.line)} • Mızrak ${percent(army.assessment.roleShares.spear)}`,
          `Menzilli ${percent(army.assessment.roleShares.ranged)} • Hareketli ${percent(army.assessment.roleShares.mobile)}`,
          `Baskın birim oranı: ${percent(army.assessment.dominantUnitShare)}`
        ].join("\n")
      },
      { name: "🪖 Birlikler", value: trimField(unitTotals) },
      { name: "🏛️ Kaynak Yerleşkeler", value: trimField(sourceText) }
    );
}
