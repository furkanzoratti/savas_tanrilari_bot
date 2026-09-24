import { describe,expect,it } from "vitest";
import { navalHullRepairMigration } from "./naval-hull-repair-migration.js";

describe("naval hull and repair migration",()=>{
  it("creates hull, damage and repair group storage",()=>{
    expect(navalHullRepairMigration.version).toBe(88);
    expect(navalHullRepairMigration.sql).toContain("CREATE TABLE IF NOT EXISTS battle_ship_hulls");
    expect(navalHullRepairMigration.sql).toContain("CREATE TABLE IF NOT EXISTS naval_ship_damage");
    expect(navalHullRepairMigration.sql).toContain("CREATE TABLE IF NOT EXISTS fleet_repair_groups");
  });
});
