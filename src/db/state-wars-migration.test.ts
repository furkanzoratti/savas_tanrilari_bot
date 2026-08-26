import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("resmî devlet savaşları ve barış antlaşmaları migration'ı", () => {
  const migration = migrations.find((item) => item.version === 18);

  it("savaş duyuru kanalını ve resmî savaş kayıtlarını oluşturur", () => {
    expect(migration?.name).toBe("state_war_declarations_and_peace_treaties");
    expect(migration?.sql).toContain("war_announcement_channel_id TEXT");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS state_wars");
    expect(migration?.sql).toContain("LEAST(attacker_country_id,defender_country_id)");
    expect(migration?.sql).toContain("GREATEST(attacker_country_id,defender_country_id)");
    expect(migration?.sql).toContain("CHECK (attacker_country_id <> defender_country_id)");
  });

  it("tek kullanımlık barış teklifini ve tazminat taraflarını doğrular", () => {
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS peace_offers");
    expect(migration?.sql).toContain("indemnity_amount BIGINT NOT NULL DEFAULT 0");
    expect(migration?.sql).toContain("payer_country_id UUID REFERENCES countries(id)");
    expect(migration?.sql).toContain("recipient_country_id UUID REFERENCES countries(id)");
    expect(migration?.sql).toContain("peace_offers_pending_war_idx");
    expect(migration?.sql).toContain("WHERE status='PENDING'");
  });
});
