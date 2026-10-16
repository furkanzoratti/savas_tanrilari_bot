import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("casusluk oyuncu yayınlarını etkinleştirme migration", () => {
  const migration = migrations.find((item) => item.version === 214);

  it("özel şablonların tamamını yayına açar", () => {
    expect(migration?.name).toBe("espionage_publication_activation");
    expect(migration?.sql).toContain("UPDATE espionage_public_templates");
    expect(migration?.sql).toContain("SET enabled=TRUE");
    expect(migration?.sql).toContain("WHERE enabled=FALSE");
    expect(migration?.sql).not.toContain("public_posted_at");
  });
});
