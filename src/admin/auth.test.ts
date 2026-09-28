import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.ADMIN_PANEL_BASE_URL = "https://panel.example.test";
  process.env.ADMIN_DISCORD_USER_IDS = "123";
  process.env.ADMIN_GUILD_ID = "456";
  process.env.ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
});

describe("GM panel signed values", () => {
  it("round-trips an authentic value", async () => {
    const { signValue, verifySignedValue } = await import("../security/signed-value.js");
    const token = signValue({ actor: "123", exp: 42 }, process.env.ADMIN_SESSION_SECRET!);
    expect(verifySignedValue(token, process.env.ADMIN_SESSION_SECRET!)).toEqual({ actor: "123", exp: 42 });
  });

  it("rejects a modified value", async () => {
    const { signValue, verifySignedValue } = await import("../security/signed-value.js");
    const token = signValue({ actor: "123" }, process.env.ADMIN_SESSION_SECRET!);
    const modified = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verifySignedValue(modified, process.env.ADMIN_SESSION_SECRET!)).toBeNull();
  });
});
