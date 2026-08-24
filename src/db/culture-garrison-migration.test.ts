import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("onuncu migration", () => {
  const migration = migrations.find((item) => item.version === 10);

  it("yerleşke kültürü ile garnizon kademesini ekler", () => {
    expect(migration?.sql).toContain("culture_group TEXT NOT NULL DEFAULT 'UNASSIGNED'");
    expect(migration?.sql).toContain("garrison_level INTEGER NOT NULL DEFAULT 0");
  });

  it("sabit garnizon ile seferberlik ordusunu veri seviyesinde ayırır", () => {
    expect(migration?.sql).toContain("force_type IN ('GARRISON','ARMY')");
    expect(migration?.sql).toContain("unit_stacks_settlement_unit_status_force_key");
  });

  it("mevcut yerleşkelerin standart garnizonunu geriye dönük oluşturur", () => {
    expect(migration?.sql).toContain("WITH standard AS");
    expect(migration?.sql).toContain("'GARRISON','GARRISON'");
    expect(migration?.sql).toContain("UPDATE settlements SET garrison_level");
  });
});
