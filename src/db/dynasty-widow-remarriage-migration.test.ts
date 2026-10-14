import {describe,expect,it} from "vitest";
import {dynastyWidowRemarriageMigration} from "./dynasty-widow-remarriage-migration.js";

describe("dul kalan hanedan üyelerinin yeniden evlenmesi",()=>{
  it("iki aile sisteminde de ölen eş bağını ve bekleyen teklifleri temizler",()=>{
    expect(dynastyWidowRemarriageMigration.version).toBe(201);
    expect(dynastyWidowRemarriageMigration.sql).toContain("dynasty_marriage_death_cleanup_trigger");
    expect(dynastyWidowRemarriageMigration.sql).toContain("roman_family_marriage_death_cleanup_trigger");
    expect(dynastyWidowRemarriageMigration.sql).toContain("UPDATE dynasty_members");
    expect(dynastyWidowRemarriageMigration.sql).toContain("UPDATE roman_family_members");
    expect(dynastyWidowRemarriageMigration.sql).toContain("NEW.spouse_id:=NULL");
  });
});
