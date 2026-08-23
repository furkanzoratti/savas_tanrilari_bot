import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("dokuzuncu migration", () => {
  const migration = migrations.find((item) => item.version === 9);

  it("bombardımanları oyun turuna bağlar", () => {
    expect(migration?.sql).toContain("battle_bombardments ADD COLUMN IF NOT EXISTS game_turn");
    expect(migration?.sql).toContain("battle_bombardments_turn_idx");
  });

  it("yerleşkelere fethedilmiş durumunu ekler", () => {
    expect(migration?.sql).toContain("is_conquered BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration?.sql).toContain("conquered_turn INTEGER");
  });
});
