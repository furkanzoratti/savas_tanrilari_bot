import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("Curia muhafızlarının ağır piyade garnizonuna dönüşümü", () => {
  const migration = migrations.find((item) => item.version === 16);

  it("önceden verilmiş 500 Hafif Piyadeyi yalnızca normal ordu kaydından düşürür", () => {
    expect(migration?.sql).toContain("army.quantity-500");
    expect(migration?.sql).toContain("settlement.curia_guard_granted=TRUE");
    expect(migration?.sql).toContain("army.unit_type='light_infantry'");
    expect(migration?.sql).toContain("army.force_type='ARMY'");
  });

  it("her eski Curia muhafızını 200 Ağır Piyade olarak sabit garnizona taşır", () => {
    expect(migration?.sql).toContain("SELECT id,'heavy_infantry',200,'GARRISON','GARRISON'");
    expect(migration?.sql).toContain("DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity");
  });
});
