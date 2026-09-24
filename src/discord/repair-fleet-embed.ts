import { EmbedBuilder } from "discord.js";
import { SHIPS } from "../domain/catalog.js";
import { number } from "../domain/format.js";
import type { RepairFleetView } from "../services/naval-repair-service.js";

export function renderRepairFleetEmbed(repair:RepairFleetView):EmbedBuilder{
  const state=repair.status==="REPAIRING"
    ? `🛠️ Tamirde • Tur ${repair.completion_turn} tamamlanır`
    : repair.status==="READY"?"✅ Tamamlandı • Normal filoya aktarılmayı bekliyor":"📦 Normal filoya aktarıldı";
  const ships=repair.ships.map((ship)=>
    `• **${number(ship.quantity)}** ${SHIPS[ship.ship_type]?.name??ship.ship_type} • **${number(ship.current_hp)}/${number(ship.max_hp)} HP**${ship.disabled?` • ${ship.disabled} iş göremez`:""}\n  Köken: **${ship.settlement_name}**`
  ).join("\n")||"Bu kayıttaki gemiler normal filoya aktarıldı.";
  return new EmbedBuilder()
    .setColor(repair.status==="REPAIRING"?0xd28b26:repair.status==="READY"?0x3f7f5f:0x6b7280)
    .setTitle(`🛠️ ${repair.name} • Tamir Filosu`)
    .setDescription(`**${repair.country_name}** • ${state}\nTamir tersanesi: **${repair.repair_settlement_name} (Sv${repair.shipyard_level})**\nKaynak filo: **${repair.source_fleet_name??"Dağıtılmış filo"}**\nBaşlangıç: **Tur ${repair.started_turn}** • Süre: **${Math.max(1,repair.completion_turn-repair.started_turn)} tur**\nEksik gövde: **${number(repair.missingHp)} HP**`)
    .addFields({name:"🚢 Tamirdeki Gemiler",value:ships.slice(0,1024)});
}
