import {describe,expect,it} from "vitest";
import {movementRuntimeRetirementMigration} from "./movement-runtime-retirement-migration.js";

describe("movement runtime retirement migration",()=>{
  it("hareket verilerini silmeden sistemi kapatır",()=>{
    expect(movementRuntimeRetirementMigration.sql).toContain("SET enabled=FALSE");
    expect(movementRuntimeRetirementMigration.sql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE)\b/i);
  });
});
