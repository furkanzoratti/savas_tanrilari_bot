import { Client, EmbedBuilder, GatewayIntentBits } from "discord.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { attachInteractionHandler } from "./discord/handler.js";
import { startHealthServer } from "./http.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { gameService } from "./services/game-service.js";
import { roleReportService } from "./services/role-report-service.js";

function countWords(content: string): number {
  const cleaned = content
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/<[@#&]!?(?:\d+)>/gu, " ")
    .replace(/[`*_~>|]/gu, " ");
  return cleaned.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

await migrate();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

attachInteractionHandler(client);

client.on("guildCreate", (guild) => gameService.ensureGuild(guild.id).catch((error) => logger.error(error, "Sunucu kaydı oluşturulamadı")));
client.on("messageCreate", async (message) => {
  if (!message.guildId || message.author.bot) return;
  const wordCount = countWords(message.content);
  if (wordCount === 0) return;
  try {
    await roleReportService.recordMessage({ messageId: message.id, guildId: message.guildId, channelId: message.channelId, userId: message.author.id, wordCount, createdAt: message.createdAt, timezone: config.TURN_TIMEZONE });
  } catch (error) {
    logger.error(error, "Rol mesajı kaydedilemedi");
  }
});

client.once("clientReady", async (readyClient) => {
  logger.info({ user: readyClient.user.tag, guilds: readyClient.guilds.cache.size }, "Discord botu hazır");
  for (const guild of readyClient.guilds.cache.values()) await gameService.ensureGuild(guild.id);
  await sendDailyRoleReports();
});

function localDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.TURN_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function previousLocalDate(): string {
  const anchor = new Date(`${localDate(new Date())}T12:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() - 1);
  return anchor.toISOString().slice(0, 10);
}

async function sendDailyRoleReports(): Promise<void> {
  if (!client.isReady()) return;
  const reportDate = previousLocalDate();
  for (const target of await roleReportService.targets()) {
    if (!(await roleReportService.claim(target.guildId, reportDate))) continue;
    try {
      const channel = await client.channels.fetch(target.channelId);
      if (!channel?.isTextBased() || channel.isDMBased()) throw new Error("Rapor kanalı yazı kanalı değil veya bulunamadı");
      const rows = await roleReportService.forDate(target.guildId, reportDate);
      const lines = rows.length
        ? rows.map((row, index) => `**${index + 1}.** <@${row.discord_user_id}> — ${row.words.toLocaleString("tr-TR")} kelime / ${row.messages.toLocaleString("tr-TR")} mesaj`)
        : ["Seçili rol kanallarında kaydedilmiş rol mesajı bulunmuyor."];
      await channel.send({ embeds: [new EmbedBuilder()
        .setColor(0x8b1e1e)
        .setTitle("📖 Günlük Rol Sıralaması")
        .setDescription(lines.join("\n"))
        .setFooter({ text: `${reportDate} • Yalnızca yönetim tarafından seçilen rol kanalları` })] });
    } catch (error) {
      await roleReportService.release(target.guildId, reportDate);
      logger.error({ error, guildId: target.guildId, channelId: target.channelId }, "Günlük rol raporu gönderilemedi");
    }
  }
}

const dailyReportTimer = setInterval(() => {
  void sendDailyRoleReports().catch((error) => logger.error(error, "Günlük rol raporu görevi başarısız"));
}, 60_000);
dailyReportTimer.unref();
const healthServer = startHealthServer(client);
await client.login(config.DISCORD_TOKEN);

async function shutdown(signal: string) {
  logger.info({ signal }, "Bot kapatılıyor");
  clearInterval(dailyReportTimer);
  healthServer.close();
  client.destroy();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
