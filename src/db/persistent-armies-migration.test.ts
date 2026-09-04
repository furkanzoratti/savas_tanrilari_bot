import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("kırk ikinci migration", () => {
  const migration = migrations.find((item) => item.version === 42);

  it("kalıcı orduları, kaynak birliklerini ve savaş bağlantılarını saklar", () => {
    expect(migration?.name).toBe("persistent_player_armies");
    expect(migration?.sql).toContain("'NONE','CURIA','AGORA','ARMY'");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS armies");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS army_units");
    expect(migration?.sql).toContain("PRIMARY KEY(army_id,settlement_id,unit_type)");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS battle_army_assignments");
    expect(migration?.sql).toContain("initial_composition JSONB");
  });
});
