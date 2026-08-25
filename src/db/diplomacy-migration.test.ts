import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("ittifak, pakt ve diplomasi kanalı migrationı", () => {
  const migration = migrations.find((item) => item.version === 17);

  it("yönetimin seçeceği kalıcı diplomasi kanalını ekler", () => {
    expect(migration?.name).toBe("alliances_pacts_and_diplomacy_channel");
    expect(migration?.sql).toContain("diplomacy_channel_id TEXT");
  });

  it("ittifak davetlerini tekilleştirir ve ters yöndeki ikinci daveti engeller", () => {
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS country_alliances");
    expect(migration?.sql).toContain("LEAST(proposer_country_id,receiver_country_id)");
    expect(migration?.sql).toContain("GREATEST(proposer_country_id,receiver_country_id)");
    expect(migration?.sql).toContain("WHERE status IN ('PENDING','ACTIVE')");
  });

  it("çok üyeli paktları, üyelikleri ve tek kullanımlık davetleri saklar", () => {
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS diplomatic_pacts");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS pact_memberships");
    expect(migration?.sql).toContain("PRIMARY KEY(pact_id,country_id)");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS pact_invitations");
    expect(migration?.sql).toContain("pact_pending_invitation_idx");
  });

  it("devlet veya pakt silinince ilişkili diplomasi kayıtlarını otomatik temizler", () => {
    expect(migration?.sql).toContain("REFERENCES countries(id) ON DELETE CASCADE");
    expect(migration?.sql).toContain("REFERENCES diplomatic_pacts(id) ON DELETE CASCADE");
  });
});
