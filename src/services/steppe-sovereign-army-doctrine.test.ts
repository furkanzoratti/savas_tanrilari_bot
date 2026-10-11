import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=(name:string)=>readFileSync(new URL(name,import.meta.url),"utf8");

describe("bağımsız bozkır devletlerinin ordu doktrini",()=>{
  it("alım, ordu üretimi ve savaş kompozisyonunda kalıcı ülke bayrağını kullanır",()=>{
    const game=source("./game-service.ts");
    expect(game).toContain("country.is_steppe_state");
    expect(game).toContain("!steppeConfederation && isSteppeArmyUnitType(input.unitType)");
    expect(source("./army-service.ts")).toContain("c.is_steppe_state");
    const battle=source("./battle-service.ts");
    expect(battle).toContain("country.is_steppe_state");
    expect(battle).not.toContain("country.is_steppe_state OR title_confederation.id IS NOT NULL");
  });
});
