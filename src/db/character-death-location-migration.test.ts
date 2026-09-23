import { describe, expect, it } from "vitest";
import { characterDeathLocationMigration } from "./character-death-location-migration.js";

describe("karakter ölüm konumu ve ölü casus görev temizliği migration", () => {
  it("ölüm bilgilerini saklar ve yalnız ölü casusların yoldaki casusluk görevlerini kapatır", () => {
    expect(characterDeathLocationMigration.version).toBe(83);
    expect(characterDeathLocationMigration.sql).toContain("died_at TIMESTAMPTZ");
    expect(characterDeathLocationMigration.sql).toContain("death_settlement_id UUID");
    expect(characterDeathLocationMigration.sql).toContain("character.role='SPY'");
    expect(characterDeathLocationMigration.sql).toContain("operation.status='TRAVELING'");
    expect(characterDeathLocationMigration.sql).not.toContain("merchant_operations");
    expect(characterDeathLocationMigration.sql).not.toContain("diplomat_operations");
    expect(characterDeathLocationMigration.sql).not.toContain("UPDATE armies");
    expect(characterDeathLocationMigration.sql).not.toContain("UPDATE fleets");
  });
});
