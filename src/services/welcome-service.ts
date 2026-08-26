import { pool } from "../db/pool.js";

export const DEFAULT_WELCOME_MESSAGE = "🏛️ Hoş geldin {uye}!\n**{sunucu}** topluluğuna katıldın. Kuralları ve bilgilendirme kanallarını inceleyerek aramıza katılabilirsin.";

export interface WelcomeConfig {
  channelId: string;
  message: string;
}

export function renderWelcomeMessage(template: string, userMention: string, guildName: string): string {
  const rendered = template.replaceAll("{uye}", userMention).replaceAll("{sunucu}", guildName).trim();
  return rendered.includes(userMention) ? rendered : `${userMention}\n${rendered}`;
}

export const welcomeService = {
  async setConfig(guildId: string, channelId: string, message = DEFAULT_WELCOME_MESSAGE): Promise<void> {
    await pool.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [guildId]);
    await pool.query(
      "UPDATE guilds SET welcome_channel_id=$1,welcome_message=$2,updated_at=NOW() WHERE discord_id=$3",
      [channelId, message, guildId]
    );
  },

  async clearConfig(guildId: string): Promise<void> {
    await pool.query("UPDATE guilds SET welcome_channel_id=NULL,welcome_message=NULL,updated_at=NOW() WHERE discord_id=$1", [guildId]);
  },

  async getConfig(guildId: string): Promise<WelcomeConfig | null> {
    const result = await pool.query<{ welcome_channel_id: string | null; welcome_message: string | null }>(
      "SELECT welcome_channel_id,welcome_message FROM guilds WHERE discord_id=$1", [guildId]
    );
    const row = result.rows[0];
    if (!row?.welcome_channel_id) return null;
    return { channelId: row.welcome_channel_id, message: row.welcome_message || DEFAULT_WELCOME_MESSAGE };
  }
};
