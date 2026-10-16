import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("casusluk yayın paneli migration", () => {
  const migration = migrations.find((item) => item.version === 212);

  it("yerleşke kanalını ve yönetilebilir olay şablonlarını oluşturur", () => {
    expect(migration?.name).toBe("espionage_publications_panel");
    expect(migration?.sql).toContain("espionage_event_channel_id");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS espionage_public_templates");
    expect(migration?.sql).toContain("PRIMARY KEY (guild_id,target_type,outcome)");
    expect(migration?.sql).toContain("CHECK (outcome IN ('SUCCESS','FAILURE'))");
  });
});
