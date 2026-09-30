import {describe,expect,it} from "vitest";
import {religionDistributionMigration} from "./religion-distribution-migration.js";

describe("yüz dördüncü migration",()=>{
  it("yerleşke din ve mezhep paylarını yüzde yüz toplamla saklar",()=>{
    expect(religionDistributionMigration.version).toBe(104);
    expect(religionDistributionMigration.name).toBe("settlement_religion_percentage_distribution");
    expect(religionDistributionMigration.sql).toContain("settlement_religion_shares");
    expect(religionDistributionMigration.sql).toContain("primary_percent");
    expect(religionDistributionMigration.sql).toContain("secondary_percent");
    expect(religionDistributionMigration.sql).toContain("share_total <> 100");
    expect(religionDistributionMigration.sql).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(religionDistributionMigration.sql).toContain("religion_adherence_percent,100-religion_adherence_percent");
  });
});
