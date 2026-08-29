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
  garrisonReplenishmentStartedDetails?: Array<{ settlementName: string; personnel: number; cost: number; completionTurn: number; reason: string }>;
  garrisonReplenishmentCompletedDetails?: Array<{ settlementName: string; personnel: number }>;
  garrisonUpgradeDetails?: string[];
  activatedPolicyDetails?: Array<{ settlementName: string; policyName: string }>;
  unrestDetails?: Array<{ settlementName: string; chance: number; roll: number }>;
  starvationDetails?: Array<{ settlementName: string; remaining: number; capacity: number }>;
  pantheonLoanDetails?: Array<{ settlementName: string; amount: number; remaining: number }>;
  incomePenaltyDetails?: Array<{ settlementName: string; percent: number; deductedAmount: number; remainingAcquisitionTurns: number; reason: string }>;
  mercenaryArrivalDetails?: Array<{ countryName: string; settlementName: string; companyName: string; upkeep: number }>;
  mercenaryUpkeepDetails?: Array<{ countryName: string; companyName: string; amount: number }>;
  mercenaryUnpaidDetails?: Array<{ countryName: string; companyName: string; amount: number }>;
  mercenaryEndedDetails?: Array<{ countryName: string; companyName: string; reason: string }>;
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
      `🛡️ Tamamlanan garnizon: **${input.garrisonUpgrades ?? 0}** • 🚢 Tamamlanan gemi: **${input.completedShips ?? 0}** • 🛠️ Kuşatma aleti: **${input.completedSiegeAssets ?? 0}**`
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
    name: "🛡️ Garnizonu Tamamlanan Yerleşkeler",
    value: fieldValue((input.garrisonReplenishmentCompletedDetails ?? []).map((item) => `• **${item.settlementName}** — ${item.personnel.toLocaleString("tr-TR")} asker`))
  });
  if (input.garrisonReplenishmentStartedDetails?.length) embed.addFields({
    name: "🛡️ Başlatılan Zorunlu Garnizon Yenilemeleri",
    value: fieldValue(input.garrisonReplenishmentStartedDetails.map((item) =>
      `• **${item.settlementName}** — ${item.personnel.toLocaleString("tr-TR")} asker • ${item.cost.toLocaleString("tr-TR")} Altın • Tur ${item.completionTurn}`
    ))
  });
  if (input.activatedPolicyDetails?.length) embed.addFields({
    name: "⚖️ Etkinleşen Şehir Politikaları",
    value: fieldValue(input.activatedPolicyDetails.map((item) => `• **${item.settlementName}** — ${item.policyName}`))
  });
  if (input.unrestDetails?.length) embed.addFields({
    name: "⚠️ Huzursuzluk Olayları",
    value: fieldValue(input.unrestDetails.map((item) => `• **${item.settlementName}** — Risk %${item.chance} • Zar ${item.roll}`))
  });
  if (input.starvationDetails?.length) embed.addFields({
    name: "🏰 Kuşatma Erzak Durumu",
    value: fieldValue(input.starvationDetails.map((item) => `• **${item.settlementName}** — ${item.remaining}/${item.capacity} tur${item.remaining === 0 ? " • Erzak tükendi" : ""}`))
  });
  if (input.pantheonLoanDetails?.length) embed.addFields({
    name: "🏛️ Panteon Kredisi Ödemeleri",
    value: fieldValue(input.pantheonLoanDetails.map((item) => `• **${item.settlementName}** — ${item.amount.toLocaleString("tr-TR")} Altın ödendi • Kalan: ${item.remaining.toLocaleString("tr-TR")}`))
  });
  if (input.incomePenaltyDetails?.length) embed.addFields({
    name: "📉 Uygulanan Gelir Cezaları",
    value: fieldValue(input.incomePenaltyDetails.map((item) =>
      `• **${item.settlementName}** — %${item.percent} • ${item.deductedAmount.toLocaleString("tr-TR")} Altın kesildi • Kalan: ${item.remainingAcquisitionTurns} Alım Turu • ${item.reason}`
    ))
  });
  if (input.mercenaryArrivalDetails?.length) embed.addFields({
    name: "\u{1FA99} Yerleşkeye Ulaşan Paralı Askerler",
    value: fieldValue(input.mercenaryArrivalDetails.map((item) =>
      `- **${item.countryName} / ${item.settlementName}** - ${item.companyName} - Ilk bakim: ${item.upkeep.toLocaleString("tr-TR")} Altin`
    ))
  });
  if (input.mercenaryUpkeepDetails?.length) embed.addFields({
    name: "\u{1F4B0} Paralı Asker Bakımları",
    value: fieldValue(input.mercenaryUpkeepDetails.map((item) =>
      `- **${item.countryName}** - ${item.companyName}: -${item.amount.toLocaleString("tr-TR")} Altin`
    ))
  });
  if (input.mercenaryUnpaidDetails?.length) embed.addFields({
    name: "\u26A0\uFE0F Ödenemeyen Paralı Asker Bakımları",
    value: fieldValue(input.mercenaryUnpaidDetails.map((item) =>
      `- **${item.countryName}** - ${item.companyName}: ${item.amount.toLocaleString("tr-TR")} Altin - Hareket ve savas kilitlendi`
    ))
  });
  if (input.mercenaryEndedDetails?.length) embed.addFields({
    name: "\u{1F4DC} Sona Eren Paralı Asker Sözleşmeleri",
    value: fieldValue(input.mercenaryEndedDetails.map((item) => `- **${item.countryName}** - ${item.companyName} - ${item.reason}`))
  });
  return embed;
}
