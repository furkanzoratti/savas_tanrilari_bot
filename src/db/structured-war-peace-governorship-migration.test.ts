import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { structuredWarPeaceGovernorshipMigration } from "./structured-war-peace-governorship-migration.js";

describe("structured war, peace, occupation and governorship migration", () => {
  it("is registered after the current schema", () => {
    expect(migrations.find((migration) => migration.version === 224)).toBe(structuredWarPeaceGovernorshipMigration);
  });

  it("creates idempotent war and governor ledgers", () => {
    expect(structuredWarPeaceGovernorshipMigration.sql).toContain("state_war_score_events");
    expect(structuredWarPeaceGovernorshipMigration.sql).toContain("settlement_occupations");
    expect(structuredWarPeaceGovernorshipMigration.sql).toContain("peace_offer_terms");
    expect(structuredWarPeaceGovernorshipMigration.sql).toContain("settlement_governorships");
  });
});
