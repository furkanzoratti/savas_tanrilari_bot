import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { cultureMilitaryPenaltyActivationMigration } from "./culture-military-penalty-activation-migration.js";

describe("foreign culture military penalty activation migration", () => {
  it("activates the 0.80 military population contribution for current and future guilds", () => {
    expect(cultureMilitaryPenaltyActivationMigration.version).toBe(240);
    expect(migrations.find((migration) => migration.version === 240))
      .toBe(cultureMilitaryPenaltyActivationMigration);
    expect(cultureMilitaryPenaltyActivationMigration.sql)
      .toContain("ALTER COLUMN culture_military_penalty_enabled SET DEFAULT TRUE");
    expect(cultureMilitaryPenaltyActivationMigration.sql)
      .toContain("SET culture_military_penalty_enabled=TRUE");
  });
});
