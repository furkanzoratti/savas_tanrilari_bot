import {describe,expect,it} from "vitest";
import {greatProjectsMigration} from "./great-projects-migration.js";

describe("büyük proje göçü",()=>{
  it("218 sürümünde sahiplikten bağımsız yerleşke kaydı kurar",()=>{
    expect(greatProjectsMigration.version).toBe(218);
    expect(greatProjectsMigration.sql).toContain("settlement_great_projects");
    expect(greatProjectsMigration.sql).toContain("settlement_id UUID NOT NULL UNIQUE");
    expect(greatProjectsMigration.sql).toContain("founded_by_country_id");
    expect(greatProjectsMigration.sql).toContain("ON DELETE SET NULL");
    expect(greatProjectsMigration.sql).not.toContain("owner_country_id");
  });
});
