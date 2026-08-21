import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  ADMIN_ROLE_IDS: z.string().default(""),
  AUTO_TURN_SCHEDULE: z.enum(["true", "false"]).default("false"),
  TURN_TIMEZONE: z.string().default("Europe/Istanbul"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info")
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Eksik veya hatalı ortam değişkenleri: ${parsed.error.message}`);
}

export const config = {
  ...parsed.data,
  adminRoleIds: new Set(parsed.data.ADMIN_ROLE_IDS.split(",").map((id) => id.trim()).filter(Boolean)),
  autoTurnSchedule: parsed.data.AUTO_TURN_SCHEDULE === "true"
};
