import { AttachmentBuilder, ChannelType, EmbedBuilder, type Client } from "discord.js";
import { GameError } from "../services/game-service.js";
import { greatPowerService, type GreatPowerRankingRow, type GreatPowerSnapshot } from "../services/great-power-service.js";
import { BRAND_BANNER_NAME, BRAND_BANNER_PATH, BRAND_BANNER_URL } from "./assets.js";

function movementLabel(row: GreatPowerRankingRow): string {
  if (row.movement === "NEW") return "🆕 Yeni";
  if (row.movement === "UP") return `↑ ${row.movementAmount}`;
  if (row.movement === "DOWN") return `↓ ${row.movementAmount}`;
  return "—";
}

function rankIcon(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `**${rank}.**`;
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00.000Z`));
}

export function renderGreatPowerEmbed(snapshot: GreatPowerSnapshot): EmbedBuilder {
  const lines = snapshot.rows.map((row) => `${rankIcon(row.rank)} **${row.countryName}** • ${movementLabel(row)}`);
  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle(`🏛️ Büyük Güçler • ${displayDate(snapshot.date)}`)
    .setDescription(lines.length ? lines.join("\n") : "Sıralamaya alınabilecek aktif devlet bulunmuyor.")
    .setImage(BRAND_BANNER_URL)
    .setFooter({ text: "Askerî, ekonomik, şehirleşme, donanma ve yapı gücü birlikte değerlendirilir • Kesin değerler devlet sırrıdır" })
    .setTimestamp();
}

export async function publishGreatPowerRanking(client: Client, guildId: string, channelId: string, date: string): Promise<GreatPowerSnapshot> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== guildId) {
    throw new GameError("Büyük Güçler kanalı bulunamadı veya geçerli bir sunucu metin kanalı değil.");
  }
  const snapshot = await greatPowerService.createSnapshot(guildId, date);
  if (!snapshot.rows.length) throw new GameError("Sıralamaya alınabilecek aktif devlet bulunmuyor.");
  await channel.send({
    embeds: [renderGreatPowerEmbed(snapshot)],
    files: [new AttachmentBuilder(BRAND_BANNER_PATH, { name: BRAND_BANNER_NAME })]
  });
  return snapshot;
}
