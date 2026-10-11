import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("bozkır haraç kademeleri",()=>{
  it("Hanlar Hanını Hanlara, diğer Hanları aktif vassallarına yönlendirir",()=>{
    const source=readFileSync(new URL("./steppe-hegemony-service.ts",import.meta.url),"utf8");
    expect(source).toContain("const isGreatKhan=requester.id===state.hegemonCountryId");
    expect(source).toContain("const targets=isGreatKhan?state.tributaries");
    expect(source).toContain("FROM country_vassalages relation");
    expect(source).toContain("relation.overlord_country_id=$2");
    expect(source).toContain("relation.status='ACTIVE'");
    expect(source).toContain('requestLevel:isGreatKhan?"GREAT_KHAN_TO_KHAN":"KHAN_TO_VASSAL"');
  });

  it("teklif oluşturmayı yalnız Alım Turunda ve tur başına bir kez yapar",()=>{
    const source=readFileSync(new URL("./steppe-hegemony-service.ts",import.meta.url),"utf8");
    expect(source).toContain("isAcquisitionTurn(state.currentTurn,state.acquisitionInterval)");
    expect(source).toContain("turn=$2 AND tributary_country_id=ANY($3::uuid[])");
    expect(source).toContain("kind='ACQUISITION_TURN'");
  });
});
