import {describe,expect,it} from "vitest";
import {dynastyBirthNamingMigration} from "./dynasty-birth-naming-migration.js";

describe("dynasty birth naming migration",()=>{
  it("persists a successful gender roll until the child is named",()=>{
    expect(dynastyBirthNamingMigration.version).toBe(114);
    expect(dynastyBirthNamingMigration.sql).toContain("CREATE TABLE IF NOT EXISTS dynasty_birth_sessions");
    expect(dynastyBirthNamingMigration.sql).toContain("gender_roll INTEGER NOT NULL");
    expect(dynastyBirthNamingMigration.sql).toContain("status IN ('PENDING_NAME','COMPLETED')");
    expect(dynastyBirthNamingMigration.sql).toContain("dynasty_one_pending_birth_name");
  });
});
