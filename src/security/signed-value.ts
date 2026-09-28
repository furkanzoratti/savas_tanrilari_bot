import { createHmac, timingSafeEqual } from "node:crypto";

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
