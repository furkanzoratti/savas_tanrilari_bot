import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("altmış dokuzuncu migration", () => {
  const migration = migrations.find((item) => item.version === 69);

  it("Hex harita, konum ve çok turlu hareket emirlerini saklar", () => {
    expect(migration?.name).toBe("extensible_hex_movement_and_reconnaissance_foundation");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS map_hexes");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS map_hex_edges");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS army_map_positions");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS fleet_map_positions");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS movement_orders");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS movement_order_steps");
    expect(migration?.sql).toContain("movement_orders_active_army_idx");
    expect(migration?.sql).toContain("movement_resolution_runs");
  });

  it("hareketten doğan gizli keşif ve gecikmeli istihbarat kayıtlarını saklar", () => {
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS regional_observer_posts");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS army_scout_detachments");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS reconnaissance_checks");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS intelligence_reports");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS movement_events");
    expect(migration?.sql).toContain("reconnaissance_checks_observer_turn_idx");
  });

  it("oyun açılmadan önce sistemi varsayılan olarak pasif tutar", () => {
    expect(migration?.sql).toContain("enabled BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration?.sql).toContain("visibility_mode TEXT NOT NULL DEFAULT 'INTELLIGENCE'");
  });
});

describe("yetmişinci migration", () => {
  it("ordu-filo taşıma manifestini tekilleştirir", () => {
    const migration = migrations.find((item) => item.version === 70);
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS fleet_cargo_armies");
    expect(migration?.sql).toContain("army_id UUID PRIMARY KEY");
  });
});

describe("yetmiş birinci migration", () => {
  it("uzak asker intikalini ve yönetici Hex kararlarını saklar", () => {
    const migration = migrations.find((item) => item.version === 71);
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS army_muster_orders");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS movement_encounters");
    expect(migration?.sql).toContain("movement_encounters_pair_idx");
  });
});

describe("yetmiş ikinci migration", () => {
  it("geri çağrılan asker intikalinin yönünü saklar", () => {
    const migration=migrations.find((item)=>item.version===72);
    expect(migration?.sql).toContain("returning BOOLEAN NOT NULL DEFAULT FALSE");
  });
});

describe("yetmiş üçüncü migration", () => {
  it("GM raporunu otomatik keşif zarıyla çakışmayan ayrı türde tutar", () => {
    const migration=migrations.find((item)=>item.version===73);
    expect(migration?.sql).toContain("'GM_REPORT'");
    expect(migration?.sql).toContain("reconnaissance_checks_check_kind_check");
  });
});
