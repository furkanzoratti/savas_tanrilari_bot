import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { renderGreatPowerEmbed } from "./great-power-ui.js";

describe("Büyük Güç herkese açık kartı", () => {
  it("sıra hareketlerini gösterir fakat gizli puanları yayımlamaz", () => {
    const json = renderGreatPowerEmbed({
      date: "2026-08-31",
      previousDate: "2026-08-30",
      rows: [{
        countryId: "country-1", countryName: "Roma", rank: 1, previousRank: 2,
        movement: "UP", movementAmount: 1, score: 987_654,
        breakdown: { land: 700_000, economy: 100_000, settlements: 50_000, navy: 50_000, buildings: 87_654, total: 987_654 }
      }]
    }).toJSON();

    expect(json.description).toContain("Roma");
    expect(json.description).toContain("↑ 1");
    expect(JSON.stringify(json)).not.toContain("987654");
    expect(json.footer?.text).toContain("Kesin değerler devlet sırrıdır");
  });
});
