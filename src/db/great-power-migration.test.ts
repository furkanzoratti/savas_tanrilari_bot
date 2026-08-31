import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("otuz ikinci migration", () => {
  const migration = migrations.find((item) => item.version === 32);

  it("kanal ayarını ve gizli günlük ilk on sıralamasını saklar", () => {
    expect(migration?.name).toBe("daily_great_power_rankings");
    expect(migration?.sql).toContain("great_power_channel_id");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_power_snapshots");
    expect(migration?.sql).toContain("secret_score BIGINT");
    expect(migration?.sql).toContain("rank BETWEEN 1 AND 10");
  });
});
