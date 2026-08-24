import { EmbedBuilder } from "discord.js";
import { BRAND_BANNER_URL } from "./assets.js";

export type TurnAnnouncement = "ADVANCE" | "OPEN" | "PAUSE" | "CLOSE";

export interface TurnAnnouncementInput {
  kind: TurnAnnouncement;
  turn: number;
  acquisition?: boolean;
  completedBuildings?: number;
  recruitmentArrivals?: number;
  completedShips?: number;
  completedSiegeAssets?: number;
  garrisonUpgrades?: number;
  completedBuildingDetails?: Array<{ settlementName: string; buildingName: string; level: number }>;
  recruitmentArrivalDetails?: Array<{ settlementName: string; unitName: string; quantity: number }>;
  completedShipDetails?: Array<{ settlementName: string; shipName: string; quantity: number }>;
  completedSiegeDetails?: Array<{ settlementName: string; assetName: string; quantity: number }>;
  garrisonUpgradeDetails?: string[];
}

function fieldValue(lines: string[]): string {
  return lines.join("\n").slice(0, 1_024);
}

export function turnAnnouncement(input: TurnAnnouncementInput): EmbedBuilder {
  if (input.kind !== "ADVANCE") {
    const details = {
      OPEN: { color: 0x3f7f5f, title: `🟢 TUR ${input.turn} HAREKETLERE AÇILDI`, description: "Oyuncular askerî hareketlerini, diplomasilerini ve diğer tur hamlelerini gönderebilir. Hamlelerin açık ve eksiksiz yazılması gerekir." },
      PAUSE: { color: 0xd28b26, title: `⏸️ TUR ${input.turn} DURDURULDU`, description: "Yeni oyuncu hamleleri durdurulmuştur. Savaşlar, isyanlar ve tur içi olaylar oyun yöneticisi tarafından çözülmektedir." },
      CLOSE: { color: 0x8b1e1e, title: `🔴 TUR ${input.turn} KAPATILDI`, description: "Bu turun bütün hareketleri sona ermiştir. Yeni hamle gönderilemez; bir sonraki tur duyurusu beklenmelidir." }
    } as const;
    const selected = details[input.kind];
    return new EmbedBuilder().setColor(selected.color).setTitle(selected.title).setDescription(selected.description).setImage(BRAND_BANNER_URL).setFooter({ text: "Savaş Tanrıları Role Play • Resmî Tur Duyurusu" }).setTimestamp();
  }

  const embed = new EmbedBuilder()
    .setColor(0xb58b32)
    .setTitle(`⚔️ TUR ${input.turn} BAŞLADI`)
    .setDescription([
      "Yeni rol turu açılmıştır. Askerî hareketler, diplomatik girişimler ve devlet hamleleri işleme alınabilir.",
      input.acquisition ? "🪙 **Bu tur bir Alım Turudur.** Gelir, nüfus ve bakım sonuçları işlenmiştir." : "Bu tur standart rol turudur.",
      `🏗️ Tamamlanan bina: **${input.completedBuildings ?? 0}** • ⚔️ Katılan asker: **${(input.recruitmentArrivals ?? 0).toLocaleString("tr-TR")}**`,
      `🛡️ Garnizon yükselişi: **${input.garrisonUpgrades ?? 0}** • 🚢 Tamamlanan gemi: **${input.completedShips ?? 0}** • 🛠️ Kuşatma aleti: **${input.completedSiegeAssets ?? 0}**`
    ].join("\n"))
    .setImage(BRAND_BANNER_URL)
    .setFooter({ text: "Savaş Tanrıları Role Play • Resmî Tur Duyurusu" })
    .setTimestamp();

  if (input.completedBuildingDetails?.length) embed.addFields({
    name: "🏗️ Tamamlanan Binalar",
    value: fieldValue(input.completedBuildingDetails.map((item) => `• **${item.settlementName}** — ${item.buildingName} Sv${item.level}`))
  });
  if (input.recruitmentArrivalDetails?.length) embed.addFields({
    name: "⚔️ Orduya Katılan Birlikler",
    value: fieldValue(input.recruitmentArrivalDetails.map((item) => `• **${item.settlementName}** — ${item.quantity.toLocaleString("tr-TR")} ${item.unitName}`))
  });
  if (input.completedShipDetails?.length) embed.addFields({
    name: "🚢 Tamamlanan Gemiler",
    value: fieldValue(input.completedShipDetails.map((item) => `• **${item.settlementName}** — ${item.quantity.toLocaleString("tr-TR")} ${item.shipName}`))
  });
  if (input.completedSiegeDetails?.length) embed.addFields({
    name: "🛠️ Tamamlanan Kuşatma Aletleri",
    value: fieldValue(input.completedSiegeDetails.map((item) => `• **${item.settlementName}** — ${item.quantity.toLocaleString("tr-TR")} ${item.assetName}`))
  });
  if (input.garrisonUpgradeDetails?.length) embed.addFields({
    name: "🛡️ Garnizon Kademesi Yükselen Yerleşkeler",
    value: fieldValue(input.garrisonUpgradeDetails.map((name) => `• **${name}**`))
  });
  return embed;
}
