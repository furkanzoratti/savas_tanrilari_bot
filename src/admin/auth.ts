import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { adminConfig } from "./config.js";

export interface AdminSession {
  sub: string;
  username: string;
  avatar: string | null;
  csrf: string;
  exp: number;
}

interface OAuthState { state: string; exp: number }
interface DiscordUser { id: string; username: string; global_name?: string | null; avatar: string | null }

const SESSION_COOKIE = "amrp_admin_session";
const STATE_COOKIE = "amrp_admin_oauth_state";

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function signValue(value: unknown, secret: string): string {
  const body = encoded(value);
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySignedValue<T>(token: string | undefined, secret: string): T | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const body = token.slice(0, separator);
  const actual = Buffer.from(token.slice(separator + 1), "base64url");
  const expected = createHmac("sha256", secret).update(body).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T; }
  catch { return null; }
}

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

export function beginDiscordLogin(response: ServerResponse): void {
  const state = randomBytes(24).toString("base64url");
  const signed = signValue({ state, exp: Date.now() + 10 * 60_000 } satisfies OAuthState, adminConfig.sessionSecret);
  response.setHeader("set-cookie", cookie(STATE_COOKIE, signed, 10 * 60));
  const query = new URLSearchParams({
    client_id: adminConfig.discordClientId,
    redirect_uri: `${adminConfig.baseUrl}/auth/callback`,
    response_type: "code",
    scope: "identify",
    state
  });
  response.writeHead(302, { location: `https://discord.com/oauth2/authorize?${query.toString()}` }).end();
}

export async function completeDiscordLogin(request: IncomingMessage, response: ServerResponse, url: URL): Promise<AdminSession> {
  const saved = verifySignedValue<OAuthState>(cookies(request)[STATE_COOKIE], adminConfig.sessionSecret);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!saved || saved.exp <= Date.now() || !state || state !== saved.state || !code) throw new Error("Discord giriş doğrulaması geçersiz veya süresi dolmuş.");

  const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: adminConfig.discordClientId,
      client_secret: adminConfig.discordClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${adminConfig.baseUrl}/auth/callback`
    })
  });
  if (!tokenResponse.ok) throw new Error("Discord erişim anahtarı alınamadı.");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("Discord erişim anahtarı yanıtı eksik.");

  const userResponse = await fetch("https://discord.com/api/v10/users/@me", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!userResponse.ok) throw new Error("Discord kullanıcı bilgisi alınamadı.");
  const user = await userResponse.json() as DiscordUser;
  if (!adminConfig.allowedUserIds.has(user.id)) throw new Error("Bu Discord hesabının GM paneline erişim yetkisi yok.");

  const session: AdminSession = {
    sub: user.id,
    username: user.global_name?.trim() || user.username,
    avatar: user.avatar,
    csrf: randomBytes(24).toString("base64url"),
    exp: Date.now() + 12 * 60 * 60_000
  };
  response.setHeader("set-cookie", [
    cookie(SESSION_COOKIE, signValue(session, adminConfig.sessionSecret), 12 * 60 * 60),
    cookie(STATE_COOKIE, "", 0)
  ]);
  return session;
}

export function clearSession(response: ServerResponse): void {
  response.setHeader("set-cookie", cookie(SESSION_COOKIE, "", 0));
}
