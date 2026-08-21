import { EmbedBuilder } from "discord.js";
import { BRAND_BANNER_URL } from "./assets.js";

export type TurnAnnouncement = "ADVANCE" | "OPEN" | "PAUSE" | "CLOSE";

export function turnAnnouncement(input: {
  kind: TurnAnnouncement;
  turn: number;
  acquisition?: boolean;
  completedBuildings?: number;
  recruitmentArrivals?: number;
  completedShips?: number;
}): EmbedBuilder {
  const details = {
    ADVANCE: {
      color: 0xb58b32,
      title: `⚔️ TUR ${input.turn} BAŞLADI`,
      description: [
        "Yeni rol turu açılmıştır. Askerî hareketler, diplomatik girişimler ve devlet hamleleri işleme alınabilir.",
        input.acquisition ? "🪙 **Bu tur bir Alım Turudur.** Gelir, nüfus, bakım ve tamamlanan üretimler işlenmiştir." : "Bu tur standart rol turudur.",
        `🏗️ Tamamlanan bina: **${input.completedBuildings ?? 0}**`,
        `⚔️ Orduya katılan asker: **${(input.recruitmentArrivals ?? 0).toLocaleString("tr-TR")}**`,
        `🚢 Tamamlanan gemi: **${input.completedShips ?? 0}**`
      ].join("\n")
    },
    OPEN: {
      color: 0x3f7f5f,
      title: `🟢 TUR ${input.turn} HAREKETLERE AÇILDI`,
      description: "Oyuncular askerî hareketlerini, diplomasilerini ve diğer tur hamlelerini gönderebilir. Hamlelerin açık ve eksiksiz yazılması gerekir."
    },
    PAUSE: {
      color: 0xd28b26,
      title: `⏸️ TUR ${input.turn} DURDURULDU`,
      description: "Yeni oyuncu hamleleri durdurulmuştur. Savaşlar, isyanlar ve tur içi olaylar oyun yöneticisi tarafından çözülmektedir."
    },
    CLOSE: {
      color: 0x8b1e1e,
      title: `🔴 TUR ${input.turn} KAPATILDI`,
      description: "Bu turun bütün hareketleri sona ermiştir. Yeni hamle gönderilemez; bir sonraki tur duyurusu beklenmelidir."
    }
  } as const;
  const selected = details[input.kind];
  return new EmbedBuilder()
    .setColor(selected.color)
    .setTitle(selected.title)
    .setDescription(selected.description)
    .setImage(BRAND_BANNER_URL)
    .setFooter({ text: "Savaş Tanrıları Role Play • Resmî Tur Duyurusu" })
    .setTimestamp();
}
