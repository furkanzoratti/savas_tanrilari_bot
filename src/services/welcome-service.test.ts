import { describe, expect, it } from "vitest";
process.env.DISCORD_TOKEN = "test-token";
process.env.DISCORD_CLIENT_ID = "test-client";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
const { DEFAULT_WELCOME_MESSAGE, renderWelcomeMessage } = await import("./welcome-service.js");

describe("hoş geldin mesajı", () => {
  it("üye ve sunucu alanlarını doldurur", () => {
    expect(renderWelcomeMessage("Selam {uye}, {sunucu} sunucusuna hoş geldin!", "<@42>", "TUNÇ RP"))
      .toBe("Selam <@42>, TUNÇ RP sunucusuna hoş geldin!");
  });

  it("özel metinde üye alanı yoksa etiketi otomatik ekler", () => {
    expect(renderWelcomeMessage("Aramıza hoş geldin.", "<@42>", "TUNÇ RP"))
      .toBe("<@42>\nAramıza hoş geldin.");
  });

  it("varsayılan mesaj gerekli alanları içerir", () => {
    expect(DEFAULT_WELCOME_MESSAGE).toContain("{uye}");
    expect(DEFAULT_WELCOME_MESSAGE).toContain("{sunucu}");
  });
});
