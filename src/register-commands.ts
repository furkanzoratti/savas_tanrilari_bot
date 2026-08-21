import { REST, Routes } from "discord.js";
import { commandBuilders } from "./discord/commands.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
const route = config.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

await rest.put(route, { body: commandBuilders });
logger.info({ scope: config.DISCORD_GUILD_ID ? "guild" : "global", count: commandBuilders.length }, "Slash komutları kaydedildi");
