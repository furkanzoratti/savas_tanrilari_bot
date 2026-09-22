import { describe, expect, it } from "vitest";
import { academyCapacityAdmiralsMigration } from "./academy-capacity-admirals-migration.js";

describe("Akademi kapasitesi, Amiraller ve görevden alma migration", () => {
  it("Amiral ve görevden alınmış karakter durumunu geriye uyumlu ekler", () => {
    expect(academyCapacityAdmiralsMigration.version).toBe(82);
    expect(academyCapacityAdmiralsMigration.sql).toContain("is_admiral");
    expect(academyCapacityAdmiralsMigration.sql).toContain("'DISMISSED'");
    expect(academyCapacityAdmiralsMigration.sql).toContain("FROM fleets");
  });
});
