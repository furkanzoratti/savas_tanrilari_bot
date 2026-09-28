import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_PANEL_BASE_URL: z.string().url(),
  ADMIN_DISCORD_USER_IDS: z.string().min(1),
  ADMIN_GUILD_ID: z.string().min(1),
  ADMIN_SESSION_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AI_COUNTRY_MODEL: z.string().min(1).default("gpt-6-sol"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info")
});

const parsed = schema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  ADMIN_PANEL_BASE_URL: process.env.ADMIN_PANEL_BASE_URL,
  ADMIN_DISCORD_USER_IDS: process.env.ADMIN_DISCORD_USER_IDS,
  ADMIN_GUILD_ID: process.env.ADMIN_GUILD_ID ?? process.env.DISCORD_GUILD_ID,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  AI_COUNTRY_MODEL: process.env.AI_COUNTRY_MODEL,
  PORT: process.env.PORT,
  LOG_LEVEL: process.env.LOG_LEVEL
});

if (!parsed.success) {
  throw new Error(`GM paneli ortam değişkenleri eksik veya hatalı: ${parsed.error.message}`);
}

const baseUrl = parsed.data.ADMIN_PANEL_BASE_URL.replace(/\/+$/u, "");

export const adminConfig = {
  databaseUrl: parsed.data.DATABASE_URL,
  baseUrl,
  allowedUserIds: new Set(parsed.data.ADMIN_DISCORD_USER_IDS.split(",").map((value) => value.trim()).filter(Boolean)),
  guildId: parsed.data.ADMIN_GUILD_ID,
  sessionSecret: parsed.data.ADMIN_SESSION_SECRET,
  openAiApiKey: parsed.data.OPENAI_API_KEY,
  aiCountryModel: parsed.data.AI_COUNTRY_MODEL,
  port: parsed.data.PORT,
  logLevel: parsed.data.LOG_LEVEL,
  secureCookies: baseUrl.startsWith("https://")
} as const;
