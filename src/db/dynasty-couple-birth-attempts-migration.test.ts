import {describe,expect,it} from "vitest";
import {dynastyCoupleBirthAttemptsMigration} from "./dynasty-couple-birth-attempts-migration.js";

describe("dynasty couple birth attempt migration",()=>{
  it("stores the birth cooldown per canonical married couple",()=>{
    expect(dynastyCoupleBirthAttemptsMigration.version).toBe(125);
    expect(dynastyCoupleBirthAttemptsMigration.name).toBe("dynasty_birth_attempt_cooldown_per_couple");
    expect(dynastyCoupleBirthAttemptsMigration.sql).toContain("dynasty_couple_birth_attempts");
    expect(dynastyCoupleBirthAttemptsMigration.sql).toContain("PRIMARY KEY (dynasty_id,first_member_id,second_member_id)");
    expect(dynastyCoupleBirthAttemptsMigration.sql).toContain("LEAST(session.mother_id,session.father_id)");
    expect(dynastyCoupleBirthAttemptsMigration.sql).toContain("BIRTH_ATTEMPT_FAILED");
  });
});
