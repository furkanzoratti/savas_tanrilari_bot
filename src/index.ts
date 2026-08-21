import { Client, GatewayIntentBits } from "discord.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { attachInteractionHandler } from "./discord/handler.js";
import { startHealthServer } from "./http.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { gameService } from "./services/game-service.js";

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
    await gameService.recordRoleMessage({ messageId: message.id, guildId: message.guildId, channelId: message.channelId, userId: message.author.id, wordCount, createdAt: message.createdAt });
  } catch (error) {
    logger.error(error, "Rol mesajı kaydedilemedi");
  }
});

client.once("clientReady", async (readyClient) => {
  logger.info({ user: readyClient.user.tag, guilds: readyClient.guilds.cache.size }, "Discord botu hazır");
  for (const guild of readyClient.guilds.cache.values()) await gameService.ensureGuild(guild.id);
});

const healthServer = startHealthServer(client);
await client.login(config.DISCORD_TOKEN);

async function shutdown(signal: string) {
  logger.info({ signal }, "Bot kapatılıyor");
  healthServer.close();
  client.destroy();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
