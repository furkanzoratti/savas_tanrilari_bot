import {describe,expect,it} from "vitest";
import {steppeTitleDynastiesMigration} from "./steppe-title-dynasties-migration.js";

describe("steppe title family trees migration",()=>{
  it("gives every active Khan and landholder a separate dynasty",()=>{
    expect(steppeTitleDynastiesMigration.version).toBe(179);
    expect(steppeTitleDynastiesMigration.sql).toContain("steppe_title_id");
    expect(steppeTitleDynastiesMigration.sql).toContain("dynasties_one_country_house_idx");
    expect(steppeTitleDynastiesMigration.sql).toContain("dynasties_one_steppe_title_house_idx");
    expect(steppeTitleDynastiesMigration.sql).toContain("title.holder_name");
    expect(steppeTitleDynastiesMigration.sql).toContain("'Hane Reisi'");
  });
});
