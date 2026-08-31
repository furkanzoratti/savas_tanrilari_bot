import { Client, EmbedBuilder, GatewayIntentBits } from "discord.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { attachInteractionHandler } from "./discord/handler.js";
import { startHealthServer } from "./http.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { gameService } from "./services/game-service.js";
import { completedRoleReportRanges, roleReportService, type RoleReportPeriod } from "./services/role-report-service.js";
import { renderWelcomeMessage, welcomeService } from "./services/welcome-service.js";

function countWords(content: string): number {
  const cleaned = content
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/<[@#&]!?(?:\d+)>/gu, " ")
    .replace(/[`*_~>|]/gu, " ");
  return cleaned.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

await migrate();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

attachInteractionHandler(client);

client.on("guildCreate", (guild) => gameService.ensureGuild(guild.id).catch((error) => logger.error(error, "Sunucu kaydı oluşturulamadı")));
client.on("guildMemberAdd", async (member) => {
  if (member.user.bot) return;
  try {
    const welcome = await welcomeService.getConfig(member.guild.id);
    if (!welcome) return;
    const channel = await member.guild.channels.fetch(welcome.channelId);
    if (!channel?.isTextBased()) throw new Error("Hoş geldin kanalı bulunamadı veya metin kanalı değil");
    await channel.send({
      content: renderWelcomeMessage(welcome.message, member.toString(), member.guild.name),
      allowedMentions: { users: [member.id], roles: [], parse: [] }
    });
  } catch (error) {
    logger.error({ error, guildId: member.guild.id, userId: member.id }, "Hoş geldin mesajı gönderilemedi");
  }
});
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

const roleReportMeta: Record<RoleReportPeriod, { title: string; color: number; label: string }> = {
  daily: { title: "📖 Günlük Rol Sıralaması", color: 0x8b1e1e, label: "Gün" },
  weekly: { title: "📚 Haftalık Rol Sıralaması", color: 0xc59b45, label: "Hafta" },
  monthly: { title: "🏛️ Aylık Rol Sıralaması", color: 0x5865f2, label: "Ay" }
};

async function sendCompletedRoleReports(now = new Date()): Promise<void> {
  if (!client.isReady()) return;
  const reports = completedRoleReportRanges(now, config.TURN_TIMEZONE);
  for (const target of await roleReportService.targets()) {
    for (const report of reports) {
      const eventKey = `ROLE_${report.period.toUpperCase()}_REPORT:${report.range.startDate}`;
      if (!(await roleReportService.claim(target.guildId, eventKey))) continue;
      try {
        const channel = await client.channels.fetch(target.channelId);
        if (!channel?.isTextBased() || channel.isDMBased()) throw new Error("Rapor kanalı yazı kanalı değil veya bulunamadı");
        const rows = await roleReportService.forRange(target.guildId, report.range.startDate, report.range.endDateExclusive, report.period === "monthly" ? "messages" : "words");
        const lines = rows.length
          ? rows.map((row, index) => report.period === "monthly"
            ? `**${index + 1}.** <@${row.discord_user_id}> — ${row.messages.toLocaleString("tr-TR")} rol`
            : `**${index + 1}.** <@${row.discord_user_id}> — ${row.words.toLocaleString("tr-TR")} kelime / ${row.messages.toLocaleString("tr-TR")} rol`)
          : ["Seçili rol kanallarında bu dönem kaydedilmiş rol bulunmuyor."];
        const meta = roleReportMeta[report.period];
        await channel.send({ embeds: [new EmbedBuilder()
          .setColor(meta.color)
          .setTitle(meta.title)
          .setDescription(lines.join("\n"))
          .setFooter({ text: `${meta.label}: ${report.range.startDate} — ${report.range.endDateExclusive} • Takvim dönemi` })] });
      } catch (error) {
        await roleReportService.release(target.guildId, eventKey);
        logger.error({ error, guildId: target.guildId, channelId: target.channelId, period: report.period }, "Rol raporu gönderilemedi");
      }
    }
  }
}

client.once("clientReady", async (readyClient) => {
  logger.info({ user: readyClient.user.tag, guilds: readyClient.guilds.cache.size }, "Discord botu hazır");
  for (const guild of readyClient.guilds.cache.values()) await gameService.ensureGuild(guild.id);
  await sendCompletedRoleReports();
});

// 23:59:50 sonrası kapanış raporunu yakalar; 00:00'dan itibaren komutlar yeni
// gün/hafta/ay aralığını kullandığı için sayaçlar mantıksal olarak sıfırlanır.
const roleReportTimer = setInterval(() => {
  void sendCompletedRoleReports().catch((error) => logger.error(error, "Rol raporu görevi başarısız"));
}, 10_000);
roleReportTimer.unref();
const healthServer = startHealthServer(client);
await client.login(config.DISCORD_TOKEN);

async function shutdown(signal: string) {
  logger.info({ signal }, "Bot kapatılıyor");
  clearInterval(roleReportTimer);
  healthServer.close();
  client.destroy();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));