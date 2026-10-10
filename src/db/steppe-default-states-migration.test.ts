import {describe,expect,it} from "vitest";
import {steppeDefaultStatesMigration} from "./steppe-default-states-migration.js";

describe("varsayılan bozkır devletleri göçü",()=>{
  it("iki boş devleti, üç Han makamını ve Xiongnu hegemonyasını güvenle kurar",()=>{
    expect(steppeDefaultStatesMigration.version).toBe(166);
    expect(steppeDefaultStatesMigration.sql).toContain("Dingling Konfederasyonu");
    expect(steppeDefaultStatesMigration.sql).toContain("Xianbei Konfederasyonu");
    expect(steppeDefaultStatesMigration.sql).toContain("Xiongnu Konfederasyonu");
    expect(steppeDefaultStatesMigration.sql).toContain("INSERT INTO steppe_internal_titles");
    expect(steppeDefaultStatesMigration.sql).toContain("INSERT INTO steppe_hegemonies");
    expect(steppeDefaultStatesMigration.sql).toContain("INSERT INTO steppe_tributaries");
    expect(steppeDefaultStatesMigration.sql).not.toContain("INSERT INTO settlements");
  });
});
