import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("bozkır devletlerinin normal belge erişimi",()=>{
  it("bozkır makamına özel belge kapsamı uygulamaz",()=>{
    const handler=readFileSync(new URL("./handler.ts",import.meta.url),"utf8");
    expect(handler).not.toContain("resolveSteppeDocumentAccess");
    expect(handler).not.toContain("steppePoliticsService.isActiveSteppeCountry");
    expect(handler).not.toContain("Toprak Ağası makamıyla");
  });

  it("belge ve yerleşkelerim normal devlet belgesini doğrudan işler",()=>{
    const handler=readFileSync(new URL("./handler.ts",import.meta.url),"utf8");
    expect(handler).toContain("sendDocumentDashboard(interaction,countryId)");
    expect(handler).toContain("const embeds=renderSettlementsOverview(document)");
    expect(handler).not.toContain("visibleSettlementIds:steppeAccess.settlementIds");
  });
});
