import {describe,expect,it} from "vitest";
import {dynastyMarriagesMigration} from "./dynasty-marriages-migration.js";

describe("cross dynasty marriage migration",()=>{
  it("stores accepted and pending diplomatic marriages safely",()=>{
    expect(dynastyMarriagesMigration.version).toBe(110);
    expect(dynastyMarriagesMigration.sql).toContain("CREATE TABLE IF NOT EXISTS dynasty_marriage_proposals");
    expect(dynastyMarriagesMigration.sql).toContain("status='PENDING'");
    expect(dynastyMarriagesMigration.sql).toContain("dynasty_member_one_pending_marriage_as_proposer");
  });
});
