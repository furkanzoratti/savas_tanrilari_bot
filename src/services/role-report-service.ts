import { pool, withTransaction } from "../db/pool.js";
import { currentRolePeriodRange, type RoleReportPeriod } from "../domain/role-periods.js";
export { completedRoleReportRanges, currentRolePeriodRange, type RoleReportPeriod } from "../domain/role-periods.js";

export interface RoleLeaderboardRow {
  discord_user_id: string;
  words: number;
  messages: number;
}

function nextDate(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export const roleReportService = {
  async setReportChannel(guildId: string, channelId: string | null): Promise<void> {
    await pool.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [guildId]);
    await pool.query("UPDATE guilds SET role_report_channel_id=$1,updated_at=NOW() WHERE discord_id=$2", [channelId, guildId]);
  },

  async targets(): Promise<Array<{ guildId: string; channelId: string }>> {
    const result = await pool.query<{ guild_id: string; channel_id: string }>(
      "SELECT discord_id AS guild_id,role_report_channel_id AS channel_id FROM guilds WHERE role_report_channel_id IS NOT NULL"
    );
    return result.rows.map((row) => ({ guildId: row.guild_id, channelId: row.channel_id }));
  },

  async claim(guildId: string, eventKey: string): Promise<boolean> {
    const result = await pool.query(
      "INSERT INTO processed_events(guild_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_key",
      [guildId, eventKey]
    );
    return Boolean(result.rowCount);
  },

  async release(guildId: string, eventKey: string): Promise<void> {
    await pool.query("DELETE FROM processed_events WHERE guild_id=$1 AND event_key=$2", [guildId, eventKey]);
  },

  async forDate(guildId: string, date: string): Promise<RoleLeaderboardRow[]> {
    return this.forRange(guildId, date, nextDate(date));
  },

  async forRange(guildId: string, startDate: string, endDateExclusive: string, orderBy: "words" | "messages" = "words"): Promise<RoleLeaderboardRow[]> {
    const ordering = orderBy === "messages" ? "messages DESC, words DESC" : "words DESC, messages DESC";
    const result = await pool.query<RoleLeaderboardRow>(
      `SELECT discord_user_id,SUM(word_count)::integer AS words,COUNT(*)::integer AS messages
         FROM role_messages WHERE guild_id=$1 AND message_date >= $2::date AND message_date < $3::date
        GROUP BY discord_user_id ORDER BY ${ordering} LIMIT 15`,
      [guildId, startDate, endDateExclusive]
    );
    return result.rows;
  },

  async currentLeaderboard(guildId: string, period: RoleReportPeriod, timezone: string): Promise<RoleLeaderboardRow[]> {
    const range = currentRolePeriodRange(period, new Date(), timezone);
    return this.forRange(guildId, range.startDate, range.endDateExclusive, period === "monthly" ? "messages" : "words");
  },

  async recordMessage(input: {
    messageId: string; guildId: string; channelId: string; userId: string;
    wordCount: number; createdAt: Date; timezone: string;
  }): Promise<void> {
    await withTransaction(async (client) => {
      const enabled = await client.query("SELECT 1 FROM role_channels WHERE guild_id=$1 AND channel_id=$2", [input.guildId, input.channelId]);
      if (!enabled.rowCount) return;
      await client.query(
        `INSERT INTO role_messages(message_id,guild_id,channel_id,discord_user_id,word_count,message_date,created_at)
         VALUES($1,$2,$3,$4,$5,($6::timestamptz AT TIME ZONE $7)::date,$6::timestamptz)
         ON CONFLICT DO NOTHING`,
        [input.messageId, input.guildId, input.channelId, input.userId, input.wordCount, input.createdAt, input.timezone]
      );
    });
  }
};
