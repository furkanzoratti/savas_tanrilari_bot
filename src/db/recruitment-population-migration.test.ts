import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("asker alımında nüfus rezervinin kaldırılması", () => {
  it("bekleyen eğitim ve garnizon rezervlerini bir kez iade eder", () => {
    const migration = migrations.find((item) => item.version === 79);
    expect(migration?.name).toBe("stop_reserving_population_for_recruitment");
    expect(migration?.sql).toContain("SUM(remaining_quantity)");
    expect(migration?.sql).toContain("status='TRAINING'");
    expect(migration?.sql).toContain("SET population_reserved=FALSE");
    expect(migration?.sql).toContain("population_reserved SET DEFAULT FALSE");
    expect(migration?.sql).toContain("SUM(personnel_reserved)");
    expect(migration?.sql).toContain("status='BUILDING'");
    expect(migration?.sql).toContain("population=settlement.population+refund.amount");
  });
});
