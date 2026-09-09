import { EmbedBuilder } from "discord.js";
import { SHIPS } from "../domain/catalog.js";
import type { NavalUnitType } from "../domain/battle.js";
import { number } from "../domain/format.js";
import type { FleetView } from "../services/fleet-service.js";

const trimField = (value: string): string => value.length <= 1024 ? value : `${value.slice(0, 1018)}\n…`;

export function renderFleetEmbed(fleet: FleetView): EmbedBuilder {
  const ships = (Object.entries(fleet.composition) as Array<[NavalUnitType, number | undefined]>)
    .filter(([, quantity]) => Number(quantity ?? 0) > 0)
    .sort((a,b) => Number(b[1] ?? 0)-Number(a[1] ?? 0))
    .map(([shipType,quantity]) => `• **${number(Number(quantity))}** ${SHIPS[shipType]?.name ?? shipType}`)
    .join("\n") || "Henüz gemi tahsis edilmedi.";
  const sources = new Map<string,string[]>();
  for (const ship of fleet.ships) {
    const rows = sources.get(ship.settlement_name) ?? [];
    rows.push(`${number(ship.quantity)} ${SHIPS[ship.ship_type]?.name ?? ship.ship_type}`);
    sources.set(ship.settlement_name,rows);
  }
  const sourceText = [...sources.entries()].map(([settlement,rows]) => `**${settlement}:** ${rows.join(" • ")}`).join("\n") || "Kaynak liman bulunmuyor.";
  const state = fleet.active_battle_id ? "⚔️ Etkin deniz savaşına bağlı" : "✅ Kullanıma hazır";
  const multiplier = Math.abs(fleet.transportMultiplier-1) > 0.001 ? ` • Ülke etkisi ×${fleet.transportMultiplier.toFixed(2)}` : "";
  return new EmbedBuilder()
    .setColor(fleet.active_battle_id ? 0xb33a3a : 0x2878a8)
    .setTitle(`🚢 ${fleet.name} • Filo Belgesi`)
    .setDescription(`**${fleet.country_name}** • ${state}\nToplam gemi: **${number(fleet.totalShips)}**\nKomutan: **${fleet.commander_name ?? "Atanmamış"}**${fleet.commander_name ? ` (+${fleet.commander_skill_bonus})` : ""}`)
    .addFields(
      { name:"🚢 Gemiler",value:trimField(ships) },
      { name:"⚓ Kaynak Limanlar",value:trimField(sourceText) },
      { name:"👥 Zorunlu Mürettebat",value:`**${number(fleet.crew)}** kişi`,inline:true },
      { name:"🛡️ Toplam Asker Taşıma Kapasitesi",value:`**${number(fleet.transportCapacity)}** asker${multiplier}`,inline:true }
    );
}
