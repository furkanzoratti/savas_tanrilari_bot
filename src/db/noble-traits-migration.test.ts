import {describe,expect,it} from "vitest";
import {nobleTraitsMigration} from "./noble-traits-migration.js";

describe("soylu trait göçü",()=>{
  it("219 sürümünde yaşayan üyeleri trait ile geriye dönük doldurur",()=>{
    expect(nobleTraitsMigration.version).toBe(219);
    expect(nobleTraitsMigration.sql).toContain("ADD COLUMN IF NOT EXISTS trait_key");
    expect(nobleTraitsMigration.sql).toContain("WHERE status='ALIVE' AND trait_key IS NULL");
    expect(nobleTraitsMigration.sql).toContain("dynasty_members_trait_key_check");
  });
});

