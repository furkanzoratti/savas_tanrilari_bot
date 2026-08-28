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

describe("on üçüncü migration", () => {
  const migration = migrations.find((item) => item.version === 13);

  it("kuşatma üretimleri ile personel sınırı durumunu saklar", () => {
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS siege_orders");
    expect(migration?.sql).toContain("manpower_penalty_active");
  });

  it("kuşatmayı savunulan yerleşkeye bağlar", () => {
    expect(migration?.sql).toContain("defender_settlement_id");
    expect(migration?.sql).toContain("active_siege_settlement_idx");
  });
});

describe("yirmi ikinci migration", () => {
  const migration = migrations.find((item) => item.version === 22);

  it("kusatma kritik duzenini iki taraf icin kabul eder", () => {
    expect(migration?.name).toBe("siege_critical_battle_order");
    expect(migration?.sql).toContain("DROP CONSTRAINT IF EXISTS battle_rounds_order_a_check");
    expect(migration?.sql).toContain("DROP CONSTRAINT IF EXISTS battle_rounds_order_b_check");
    expect(migration?.sql.match(/'CRITICAL'/g)).toHaveLength(2);
  });
});
