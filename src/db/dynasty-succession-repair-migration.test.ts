import {describe,expect,it} from "vitest";
import {dynastySuccessionRepairMigration} from "./dynasty-succession-repair-migration.js";

describe("hanedan veraset onarımı migration",()=>{
  it("erkek çocukları kardeşlerden önce sıralayıp ilk sırayı tek varis yapar",()=>{
    expect(dynastySuccessionRepairMigration.version).toBe(221);
    expect(dynastySuccessionRepairMigration.sql).toContain("candidate.father_id=ruler.id OR candidate.mother_id=ruler.id");
    expect(dynastySuccessionRepairMigration.sql).toContain("THEN 0");
    expect(dynastySuccessionRepairMigration.sql).toContain("THEN 1");
    expect(dynastySuccessionRepairMigration.sql).toContain("SET is_heir=FALSE");
    expect(dynastySuccessionRepairMigration.sql).toContain("repair.next_rank=1");
  });
});
