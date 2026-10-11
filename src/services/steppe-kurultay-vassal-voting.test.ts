import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=readFileSync(new URL("./steppe-kurultay-service.ts",import.meta.url),"utf8");

describe("Kurultay vassal seçmenleri",()=>{
  it("aktif bozkır vassallarını bir puanlık seçmen olarak toplar",()=>{
    expect(source).toContain("JOIN country_vassalages relation");
    expect(source).toContain("'VASSAL'::text");
    expect(source).toContain('weight:voter.tier==="KHAN"?2:1');
    expect(source).toContain("voter_country_id");
    expect(source).toContain("NOT EXISTS(SELECT 1 FROM steppe_confederations own");
  });

  it("adaylığı yalnız etkin Han makamlarında bırakır",()=>{
    expect(source).toContain("title.status='ACTIVE' AND title.tier='KHAN'");
    expect(source).toContain("INSERT INTO steppe_kurultay_candidates");
  });
});
