import {describe,expect,it} from "vitest";
import {steppeTitleFamilyRostersMigration} from "./steppe-title-family-rosters-migration.js";

describe("steppe title family rosters migration",()=>{
  it("creates an eight-member linked roster for every empty title house",()=>{
    expect(steppeTitleFamilyRostersMigration.version).toBe(180);
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Hane Reisinin Eşi");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Hane Reisinin Oğlu");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Hane Reisinin Kızı");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Hane Reisinin Erkek Kardeşi");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Hane Reisinin Kız Kardeşi");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Hane Reisinin Babası");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Hane Reisinin Annesi");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("FAMILY_ROSTER_INITIALIZED");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Modu Chanyu");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Murong Shegui");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Qara Tarkan");
  });

  it("uses separate cultural name pools for all three confederations",()=>{
    expect(steppeTitleFamilyRostersMigration.sql).toContain("%xiongnu%");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("%xianbei%");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Altani");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Tanshihuai");
    expect(steppeTitleFamilyRostersMigration.sql).toContain("Alp Boro");
  });
});
