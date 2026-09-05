import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("kırk dördüncü migration", () => {
  const migration = migrations.find((item) => item.version === 44);

  it("tur bazlı casusluğu, gizli log kanalını ve geçici bina sabotajını oluşturur", () => {
    expect(migration?.name).toBe("turn_based_espionage_and_building_sabotage");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS espionage_operations");
    expect(migration?.sql).toContain("espionage_log_channel_id");
    expect(migration?.sql).toContain("sabotaged_until_turn");
    expect(migration?.sql).toContain("'ESPIONAGE_RETURNING'");
    expect(migration?.sql).toContain("espionage_one_live_operation_per_spy");
  });
});
