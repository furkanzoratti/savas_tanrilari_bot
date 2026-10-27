import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("liman ablukası savaş skoru",()=>{
  it("karşı cepheler arasındaki her limanı savaş başına yalnızca bir kez iki puanla kaydeder",()=>{
    const source=readFileSync(new URL("./naval-operations-service.ts",import.meta.url),"utf8");
    expect(source).toContain("target.side<>blockader.side");
    expect(source).toContain("'BLOCKADE',2");
    expect(source).toContain("`blockade:${war.war_id}:${input.targetSettlementId}`");
    expect(source).toContain("ON CONFLICT(source_key) DO NOTHING");
    expect(source).toContain("recalculateWarScore(client,war.war_id)");
  });
});
