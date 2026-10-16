import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { playerAutoPurchaseShipModesMigration } from "./player-auto-purchase-ship-modes-migration.js";

describe("player auto purchase ship modes migration", () => {
  it("eski gemi modunu karışık gemiye taşır ve iki yeni modu sınırlar", () => {
    expect(playerAutoPurchaseShipModesMigration.version).toBe(211);
    expect(playerAutoPurchaseShipModesMigration.sql).toContain("mode = 'MIXED_SHIPS'");
    expect(playerAutoPurchaseShipModesMigration.sql).toContain("'HEAVY_SHIPS','MIXED_SHIPS','QUALITY','LIGHT','GENERAL'");
    expect(migrations.find((migration) => migration.version === playerAutoPurchaseShipModesMigration.version)).toBe(playerAutoPurchaseShipModesMigration);
  });
});
