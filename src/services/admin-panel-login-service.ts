import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { signValue } from "../security/signed-value.js";
import { GameError } from "./game-service.js";

export interface AdminPanelLoginToken {
  sub: string;
  username: string;
  avatar: string | null;
  guildId: string;
  nonce: string;
  exp: number;
}

export function adminPanelTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const adminPanelLoginService = {
  async issue(input: { guildId: string; userId: string; username: string; avatar: string | null }): Promise<{ url: string; expiresAt: Date }> {
    if (!config.ADMIN_PANEL_BASE_URL || !config.ADMIN_SESSION_SECRET) {
      throw new GameError("Operasyon Masası bağlantısı henüz yapılandırılmadı.");
    }
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const payload: AdminPanelLoginToken = {
      sub: input.userId,
      username: input.username,
      avatar: input.avatar,
      guildId: input.guildId,
      nonce: randomBytes(24).toString("base64url"),
      exp: expiresAt.getTime()
    };
    const token = signValue(payload, config.ADMIN_SESSION_SECRET);
    await pool.query("DELETE FROM admin_panel_login_tokens WHERE expires_at<NOW() OR used_at IS NOT NULL");
    await pool.query(
      `INSERT INTO admin_panel_login_tokens(token_hash,guild_id,user_id,username,avatar,expires_at)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [adminPanelTokenHash(token), input.guildId, input.userId, input.username, input.avatar, expiresAt]
    );
    const baseUrl = config.ADMIN_PANEL_BASE_URL.replace(/\/+$/u, "");
    return { url: `${baseUrl}/auth/discord?token=${encodeURIComponent(token)}`, expiresAt };
  }
};
