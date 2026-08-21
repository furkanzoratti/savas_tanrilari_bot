import { pool } from "../db/pool.js";

export interface PlayerCommandLog {
  id: string;
  discord_user_id: string;
  command_name: string;
  command_text: string;
  success: boolean | null;
  created_at: Date;
}

export const commandLogService = {
  async record(input: {
    guildId: string;
    userId: string;
    commandName: string;
    commandText: string;
  }): Promise<{ id: string; channelId: string | null }> {
    await pool.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [input.guildId]);
    const result = await pool.query<{ id: string; command_log_channel_id: string | null }>(
      `WITH inserted AS (
         INSERT INTO player_command_logs(guild_id,discord_user_id,command_name,command_text)
         VALUES($1,$2,$3,$4) RETURNING id
       )
       SELECT inserted.id,g.command_log_channel_id FROM inserted JOIN guilds g ON g.discord_id=$1`,
      [input.guildId, input.userId, input.commandName, input.commandText]
    );
    return { id: result.rows[0]!.id, channelId: result.rows[0]!.command_log_channel_id };
  },

  async markResult(id: string, success: boolean): Promise<void> {
    await pool.query("UPDATE player_command_logs SET success=$1 WHERE id=$2", [success, id]);
  },

  async setChannel(guildId: string, channelId: string | null): Promise<void> {
    await pool.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [guildId]);
    await pool.query("UPDATE guilds SET command_log_channel_id=$1,updated_at=NOW() WHERE discord_id=$2", [channelId, guildId]);
  },

  async recent(guildId: string, limit = 20): Promise<PlayerCommandLog[]> {
    const result = await pool.query<PlayerCommandLog>(
      `SELECT id,discord_user_id,command_name,command_text,success,created_at
         FROM player_command_logs WHERE guild_id=$1
        ORDER BY created_at DESC LIMIT $2`,
      [guildId, Math.min(50, Math.max(1, limit))]
    );
    return result.rows;
  }
};
