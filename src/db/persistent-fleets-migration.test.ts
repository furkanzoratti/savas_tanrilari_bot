import { describe,expect,it } from "vitest";
import { migrations } from "./migrations.js";

describe("persistent fleet migration",() => {
  const migration = migrations.find((item) => item.version === 54);

  it("creates fleets, ship allocations and battle assignments",() => {
    expect(migration?.name).toBe("persistent_fleets");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS fleets");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS fleet_ships");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS battle_fleet_assignments");
    expect(migration?.sql).toContain("'FLEET'");
  });
});
