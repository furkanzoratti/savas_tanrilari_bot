import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("Capua gladyatör can ve dövüş kaydı migration", () => {
  it("kalıcı can puanlarını ve hücum turu kayıtlarını ekler", () => {
    const migration = migrations.find((item) => item.version === 118);
    expect(migration?.name).toBe("capua_gladiator_hit_points_and_combat_log");
    expect(migration?.sql).toContain("ADD COLUMN IF NOT EXISTS max_hp");
    expect(migration?.sql).toContain("ADD COLUMN IF NOT EXISTS combat_turns");
    expect(migration?.sql).toContain("ADD COLUMN IF NOT EXISTS combat_log");
    expect(migration?.sql).toContain("28 + ((substring(code FROM 5)::integer * 19) % 18)");
  });
});
