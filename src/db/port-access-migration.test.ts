import {describe,expect,it} from "vitest";
import {portAccessMigration} from "./port-access-migration.js";

describe("diplomatik liman erişimi göçü",()=>{
  it("yönlü teklifleri ve etkin erişimi saklar",()=>{
    expect(portAccessMigration.version).toBe(138);
    expect(portAccessMigration.sql).toContain("CREATE TABLE IF NOT EXISTS country_port_access");
    expect(portAccessMigration.sql).toContain("requester_country_id");
    expect(portAccessMigration.sql).toContain("grantor_country_id");
    expect(portAccessMigration.sql).toContain("WHERE status IN ('PENDING','ACTIVE')");
  });
});
