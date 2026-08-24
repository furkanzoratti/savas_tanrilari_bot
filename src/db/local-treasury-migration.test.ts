import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("yerel hazinenin ana bakiye olması", () => {
  const migration = migrations.find((item) => item.version === 12);

  it("mevcut devlet hazinesini ilk yerleşkeye aktarır", () => {
    expect(migration?.name).toBe("local_treasury_is_country_treasury_source");
    expect(migration?.sql).toContain("SET local_treasury=s.local_treasury+c.treasury");
  });

  it("devlet hazinesi önbelleğini şehir hazinelerinin toplamına eşitler", () => {
    expect(migration?.sql).toContain("SET treasury=(SELECT COALESCE(SUM(s.local_treasury),0)");
  });
});
