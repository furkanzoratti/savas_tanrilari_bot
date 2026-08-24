import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("on birinci migration", () => {
  const migration = migrations.find((item) => item.version === 11);

  it("yerel hazine ve geri alınabilir kara ticareti tabanı ekler", () => {
    expect(migration?.sql).toContain("local_treasury BIGINT NOT NULL DEFAULT 0");
    expect(migration?.sql).toContain("base_land_trade_income BIGINT NOT NULL DEFAULT 0");
  });

  it("eski gelir sütunlarını silmez veya sıfırlamaz", () => {
    expect(migration?.sql).not.toContain("base_income=0");
    expect(migration?.sql).not.toContain("tax_income=0");
    expect(migration?.sql).not.toContain("sea_trade_income=0");
  });
});
