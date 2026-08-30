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

describe("yirmi ucuncu migration", () => {
  const migration = migrations.find((item) => item.version === 23);
  it("parali asker sozlesmelerini ve savas kaynaklarini saklar", () => {
    expect(migration?.name).toBe("mercenary_contracts_and_battle_sources");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS mercenary_contracts");
    expect(migration?.sql).toContain("arrival_turn=hired_turn+1");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS battle_mercenary_assignments");

    expect(migration?.sql).toContain("mercenary_loss_applied INTEGER");
  });
});

describe("yirmi dördüncü migration", () => {
  const migration = migrations.find((item) => item.version === 24);

  it("zorunlu garnizon yenilemesini iki rol turuna bağlar", () => {
    expect(migration?.name).toBe("mandatory_garrison_replenishment");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS garrison_replenishment_orders");
    expect(migration?.sql).toContain("completion_turn=ordered_turn+2");
    expect(migration?.sql).toContain("personnel_reserved=light_infantry+spears+archers");
    expect(migration?.sql).toContain("garrison_replenishment_active_settlement_idx");
  });
});

describe("yirmi beşinci migration", () => {
  const migration = migrations.find((item) => item.version === 25);

  it("savaş taraflarında birden fazla ülkeyi ve ülke kadrolarını saklar", () => {
    expect(migration?.name).toBe("battle_side_coalitions");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS battle_side_participants");
    expect(migration?.sql).toContain("PRIMARY KEY(battle_id,country_id)");
    expect(migration?.sql).toContain("initial_composition JSONB");
    expect(migration?.sql).toContain("INSERT INTO battle_side_participants");
  });
});