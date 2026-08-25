import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("şehir politikaları ve Akademi migration", () => {
  const migration = migrations.find((item) => item.version === 14);

  it("Curia politikaları ve etkileşimli Akademi karakter tablolarını oluşturur", () => {
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS settlement_policies");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS country_characters");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS academy_training_sessions");
    expect(migration?.sql).toContain("'PENDING_ROLL','AWAITING_NAME','COMPLETED','CANCELLED'");
    expect(migration?.sql).toContain("UNIQUE (settlement_id,acquisition_turn)");
  });

  it("kıyı, Panteon kredisi, şehir olayı ve zorunlu askerlik kayıtlarını ekler", () => {
    expect(migration?.sql).toContain("is_coastal BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS pantheon_loans");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS settlement_events");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS settlement_conscriptions");
  });

  it("gelişmiş topçu, geçici milis, açlık ve Panteon savunmasını kalıcı saklar", () => {
    expect(migration?.sql).toContain("engineering_enhanced BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration?.sql).toContain("enhanced_quantity INTEGER NOT NULL DEFAULT 0");
    expect(migration?.sql).toContain("support_enhanced JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(migration?.sql).toContain("temporary_militia INTEGER NOT NULL DEFAULT 0");
    expect(migration?.sql).toContain("starvation_remaining INTEGER");
    expect(migration?.sql).toContain("defender_pantheon_pressure_used BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration?.sql).toContain("AND b.starvation_capacity IS NULL");
  });
});
