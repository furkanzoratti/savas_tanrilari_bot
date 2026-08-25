import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("yönetici kontrollü yerleşke olayları migration'ı", () => {
  const migration = migrations.find((item) => item.version === 15);

  it("dört olayın kalıcı aktif durumunu yerleşkelere ekler", () => {
    expect(migration?.sql).toContain("black_market_active BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration?.sql).toContain("epidemic_active BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration?.sql).toContain("unrest_active BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration?.sql).toContain("rebellion_active BOOLEAN NOT NULL DEFAULT FALSE");
  });

  it("ağırlıklı seçimleri ve tekrar koruması için tetiklenmiş olay geçmişini saklar", () => {
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS settlement_event_draws");
    expect(migration?.sql).toContain("'BLACK_MARKET','EPIDEMIC','UNREST','REBELLION'");
    expect(migration?.sql).toContain("'PENDING','APPLIED','CANCELLED'");
    expect(migration?.sql).toContain("settlement_events_triggered_history_idx");
  });
});
