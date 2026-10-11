import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("koalisyon ordusu savaş ataması",()=>{
  it("orduyu yalnız ana ülkeye değil aynı cephedeki ilgili katılımcıya doğrular",()=>{
    const source=readFileSync(new URL("./battle-service.ts",import.meta.url),"utf8");
    const assignment=source.slice(source.indexOf("async setArmyAssignment"),source.indexOf("async setFleetAssignment"));
    expect(assignment).toContain("bsp.side_key=side_record.side_key AND bsp.country_id=a.country_id");
    expect(assignment).not.toContain("bsp.is_primary=TRUE");
    expect(assignment).toContain("OR side_record.steppe_title_id IS NULL");
  });
});
