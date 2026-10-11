import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("bozkır haraç kademeleri",()=>{
  it("Hanlar Hanını hem Hanlara hem kendi vassallarına, diğer Hanları kendi vassallarına yönlendirir",()=>{
    const source=readFileSync(new URL("./steppe-hegemony-service.ts",import.meta.url),"utf8");
    expect(source).toContain("const isGreatKhan=requester.id===state.hegemonCountryId");
    expect(source).toContain("for(const khan of state.tributaries)");
    expect(source).toContain('requestLevel:"GREAT_KHAN_TO_KHAN"');
    expect(source).toContain('requestLevel:isGreatKhan?"GREAT_KHAN_TO_VASSAL":"KHAN_TO_VASSAL"');
    expect(source).toContain("FROM country_vassalages relation");
    expect(source).toContain("relation.overlord_country_id=$2");
    expect(source).toContain("relation.status='ACTIVE'");
    expect(source).toContain("if(!targetByCountryId.has(vassal.countryId))");
  });

  it("teklif oluşturmayı yalnız Alım Turunda ve tur başına bir kez yapar",()=>{
    const source=readFileSync(new URL("./steppe-hegemony-service.ts",import.meta.url),"utf8");
    expect(source).toContain("isAcquisitionTurn(state.currentTurn,state.acquisitionInterval)");
    expect(source).toContain("turn=$2 AND tributary_country_id=ANY($3::uuid[])");
    expect(source).toContain("const pendingTargets=targets.filter");
    expect(source).toContain("kind='ACQUISITION_TURN'");
  });

  it("haraç muhasebesini teklif ve ödeme anında kalıcılaştırır",()=>{
    const source=readFileSync(new URL("./steppe-hegemony-service.ts",import.meta.url),"utf8");
    expect(source).toContain("full_due,acquisition_income,offered_by");
    expect(source).toContain("const treasuryBefore=await currentTreasury");
    expect(source).toContain("const treasuryAfter=await currentTreasury");
    expect(source).toContain("treasury_before=$4,treasury_after=$5");
    expect(source).toContain("acquisitionIncome:normalized.acquisition_income,treasuryBefore,treasuryAfter");
  });
});
