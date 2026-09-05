import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("kırk üçüncü migration", () => {
  const migration = migrations.find((item) => item.version === 43);

  it("kuşatma garnizonunu savaştan ayrı bir kaynak olarak saklar", () => {
    expect(migration?.name).toBe("automatic_siege_garrisons");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS battle_garrison_assignments");
    expect(migration?.sql).toContain("settlement_id UUID NOT NULL");
    expect(migration?.sql).toContain("initial_composition JSONB");
  });
});