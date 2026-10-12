import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { siegePhaseRevealColumn, siegePhaseShouldReveal } from "./battle-service.js";

describe("kuşatma aşaması kartı yayınlama sınırı", () => {
  it("bombardıman ve hücum için ayrı kalıcı işaret kullanır", () => {
    expect(siegePhaseRevealColumn("BOMBARDMENT")).toBe("bombardment_revealed");
    expect(siegePhaseRevealColumn("ASSAULT")).toBe("assault_revealed");
  });

  it("her aşamayı yalnız daha önce yayınlanmadıysa reveal eder", () => {
    const fresh = { bombardment_revealed: false, assault_revealed: false };
    expect(siegePhaseShouldReveal(fresh, "BOMBARDMENT")).toBe(true);
    expect(siegePhaseShouldReveal(fresh, "ASSAULT")).toBe(true);
    expect(siegePhaseShouldReveal({ bombardment_revealed: true, assault_revealed: false }, "BOMBARDMENT")).toBe(false);
    expect(siegePhaseShouldReveal({ bombardment_revealed: true, assault_revealed: true }, "ASSAULT")).toBe(false);
  });
});
