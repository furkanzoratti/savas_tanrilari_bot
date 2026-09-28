import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { signValue, verifySignedValue } from "../security/signed-value.js";
import { adminConfig } from "./config.js";
import { adminPool } from "./db.js";

export interface AdminSession {
  sub: string;
  username: string;
  avatar: string | null;
  csrf: string;
  exp: number;
}

interface AdminLoginToken {
  sub: string;
  username: string;
  avatar: string | null;
  guildId: string;
  nonce: string;
  exp: number;
}

const SESSION_COOKIE = "amrp_admin_session";

function cookies(request: IncomingMessage): Record<string, string> {
  const values: Record<string, string> = {};
  for (const item of (request.headers.cookie ?? "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    values[item.slice(0, separator).trim()] = decodeURIComponent(item.slice(separator + 1).trim());
  }
  return values;
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${adminConfig.secureCookies ? "; Secure" : ""}`;
}

export function sessionFromRequest(request: IncomingMessage): AdminSession | null {
  const session = verifySignedValue<AdminSession>(cookies(request)[SESSION_COOKIE], adminConfig.sessionSecret);
  if (!session || session.exp <= Date.now() || !adminConfig.allowedUserIds.has(session.sub)) return null;
  return session;
}

export function assertMutationRequest(request: IncomingMessage, session: AdminSession): boolean {
  const origin = request.headers.origin;
  const csrf = request.headers["x-csrf-token"];
  return origin === adminConfig.baseUrl && typeof csrf === "string" && csrf === session.csrf;
}

export async function completeDiscordLinkLogin(response: ServerResponse, url: URL): Promise<AdminSession> {
  const token = url.searchParams.get("token") ?? undefined;
  const signed = verifySignedValue<AdminLoginToken>(token, adminConfig.sessionSecret);
  if (!token || !signed || signed.exp <= Date.now() || signed.guildId !== adminConfig.guildId) {
    throw new Error("Operasyon Masası bağlantısı geçersiz veya süresi dolmuş.");
  }
  if (!adminConfig.allowedUserIds.has(signed.sub)) throw new Error("Bu Discord hesabının GM paneline erişim yetkisi yok.");

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const client = await adminPool.connect();
  let row: { user_id: string; username: string; avatar: string | null } | undefined;
  try {
    await client.query("BEGIN");
    row = (await client.query<{ user_id: string; username: string; avatar: string | null }>(
      `UPDATE admin_panel_login_tokens SET used_at=NOW()
       WHERE token_hash=$1 AND guild_id=$2 AND user_id=$3 AND used_at IS NULL AND expires_at>NOW()
       RETURNING user_id,username,avatar`,
      [tokenHash, adminConfig.guildId, signed.sub]
    )).rows[0];
    if (!row) throw new Error("Operasyon Masası bağlantısı daha önce kullanılmış veya süresi dolmuş.");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const session: AdminSession = {
    sub: row.user_id,
    username: row.username,
    avatar: row.avatar,
    csrf: randomBytes(24).toString("base64url"),
    exp: Date.now() + 12 * 60 * 60_000
  };
  response.setHeader("set-cookie", cookie(SESSION_COOKIE, signValue(session, adminConfig.sessionSecret), 12 * 60 * 60));
  return session;
}

export function clearSession(response: ServerResponse): void {
  response.setHeader("set-cookie", cookie(SESSION_COOKIE, "", 0));
}
