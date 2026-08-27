import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("devlet Discord rolleri migration'ı", () => {
  const migration = migrations.find((item) => item.version === 20);

  it("ülkeyi Discord rol kimliğiyle eşleştirir", () => {
    expect(migration?.name).toBe("discord_country_roles");
    expect(migration?.sql).toContain("discord_role_id TEXT");
    expect(migration?.sql).toContain("countries_discord_role_id_unique");
    expect(migration?.sql).toContain("WHERE discord_role_id IS NOT NULL");
  });
});
