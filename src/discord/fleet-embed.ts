import { EmbedBuilder } from "discord.js";
import { SHIPS } from "../domain/catalog.js";
import type { NavalUnitType } from "../domain/battle.js";
import { number } from "../domain/format.js";
import type { FleetView } from "../services/fleet-service.js";

const trimField = (value: string): string => value.length <= 1024 ? value : `${value.slice(0, 1018)}\n…`;

export function renderFleetEmbed(fleet: FleetView): EmbedBuilder {
  const healthGroups = new Map<string,{shipType:NavalUnitType;percent:number;quantity:number;disabled:number}>();
  const damagedByType = new Map<NavalUnitType,number>();
  for (const ship of fleet.damagedShips ?? []) {
    damagedByType.set(ship.ship_type,(damagedByType.get(ship.ship_type)??0)+ship.quantity);
    const percent=Math.max(0,Math.min(100,Math.floor(ship.current_hp/Math.max(1,ship.max_hp)*100)));
    const disabled=ship.disabled>0;
    const key=`${ship.ship_type}:${percent}:${disabled?"disabled":"active"}`;
    const group=healthGroups.get(key)??{shipType:ship.ship_type,percent,quantity:0,disabled:0};
    group.quantity+=ship.quantity;
    group.disabled+=ship.disabled;
    healthGroups.set(key,group);
  }
  for (const [shipType,total] of Object.entries(fleet.composition) as Array<[NavalUnitType,number|undefined]>) {
    const healthy=Math.max(0,Number(total??0)-(damagedByType.get(shipType)??0));
    if(!healthy)continue;
    const key=`${shipType}:100:active`;
    const group=healthGroups.get(key)??{shipType,percent:100,quantity:0,disabled:0};
    group.quantity+=healthy;
    healthGroups.set(key,group);
  }
  const ships=[...healthGroups.values()]
    .sort((a,b)=>(SHIPS[a.shipType]?.name??a.shipType).localeCompare(SHIPS[b.shipType]?.name??b.shipType,"tr")||b.percent-a.percent||a.disabled-b.disabled)
    .map((ship)=>`• **${number(ship.quantity)}** ${SHIPS[ship.shipType]?.name??ship.shipType} — **%${number(ship.percent)}**${ship.disabled?` • **${number(ship.disabled)} iş göremez**`:""}`)
    .join("\n")||"Henüz gemi tahsis edilmedi.";
  const sources = new Map<string,string[]>();
  for (const ship of fleet.ships) {
    const rows = sources.get(ship.settlement_name) ?? [];
    rows.push(`${number(ship.quantity)} ${SHIPS[ship.ship_type]?.name ?? ship.ship_type}`);
    sources.set(ship.settlement_name,rows);
  }
  const sourceText = [...sources.entries()].map(([settlement,rows]) => `**${settlement}:** ${rows.join(" • ")}`).join("\n") || "Kaynak liman bulunmuyor.";
  const state = fleet.active_battle_id ? "⚔️ Etkin deniz savaşına bağlı" : "✅ Kullanıma hazır";
  const multiplier = Math.abs(fleet.transportMultiplier-1) > 0.001 ? ` • Ülke etkisi ×${fleet.transportMultiplier.toFixed(2)}` : "";
  const embed = new EmbedBuilder()
    .setColor(fleet.active_battle_id ? 0xb33a3a : 0x2878a8)
    .setTitle(`🚢 ${fleet.name} • Filo Belgesi`)
    .setDescription(`**${fleet.country_name}** • ${state}\nToplam gemi: **${number(fleet.totalShips)}**\nAmiral: **${fleet.commander_name ?? "Atanmamış"}**${fleet.commander_name ? ` (+${fleet.commander_skill_bonus})` : ""}`)
    .addFields(
      { name:"🚢 Gemiler ve Can Durumu",value:trimField(ships) },
      { name:"⚓ Kaynak Limanlar",value:trimField(sourceText) },
      { name:"👥 Zorunlu Mürettebat",value:`**${number(fleet.crew)}** kişi`,inline:true },
      { name:"🛡️ Toplam Asker Taşıma Kapasitesi",value:`**${number(fleet.transportCapacity)}** asker${multiplier}`,inline:true }
    );
  return embed;
}
