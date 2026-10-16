import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("casusluk oyuncu yayını teslim migration", () => {
  const migration = migrations.find((item) => item.version === 213);

  it("yeni sonuçlar için teslim kuyruğu oluşturur ve eski kayıtları geriye dönük yayımlamaz", () => {
    expect(migration?.name).toBe("espionage_publication_delivery");
    expect(migration?.sql).toContain("public_posted_at");
    expect(migration?.sql).toContain("SET public_posted_at=NOW()");
    expect(migration?.sql).toContain("espionage_publication_pending_idx");
  });
});
