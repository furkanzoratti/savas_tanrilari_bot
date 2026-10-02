import {describe,expect,it} from "vitest";
import {dynastyMarriageMessageMigration} from "./dynasty-marriage-message-migration.js";

describe("dynasty marriage Discord form migration",()=>{
  it("stores the published proposal message",()=>{
    expect(dynastyMarriageMessageMigration.version).toBe(116);
    expect(dynastyMarriageMessageMigration.sql).toContain("public_channel_id TEXT");
    expect(dynastyMarriageMessageMigration.sql).toContain("public_message_id TEXT");
    expect(dynastyMarriageMessageMigration.sql).toContain("dynasty_marriage_public_message_idx");
  });
});
