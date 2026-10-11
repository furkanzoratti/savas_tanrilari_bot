import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("bozkır belge erişimi",()=>{
  it("makam eşleşmesi olmayan bozkır oyuncusuna tam belgeye düşmez",()=>{
    const handler=readFileSync(new URL("./handler.ts",import.meta.url),"utf8");
    expect(handler).toContain("resolveSteppeDocumentAccess(interaction,countryId)");
    expect(handler).toContain("steppePoliticsService.isActiveSteppeCountry");
    expect(handler).toContain("yalnızca oyuncuya atanmış Han veya Toprak Ağası makamıyla");
  });

  it("hem belge hem yerleşkelerim görünümünde aynı zorunlu kapsamı kullanır",()=>{
    const handler=readFileSync(new URL("./handler.ts",import.meta.url),"utf8");
    expect(handler.match(/resolveSteppeDocumentAccess\(interaction,country\.id\)/g)?.length).toBe(1);
    expect(handler).toContain("visibleSettlementIds:steppeAccess.settlementIds");
  });

  it("yönetici kendi makamıyla bakarken kapsamı korur, açık ülke seçiminde tam belge açar",()=>{
    const handler=readFileSync(new URL("./handler.ts",import.meta.url),"utf8");
    expect(handler).toContain('const explicitGameMasterCountry=isGameMaster(interaction)&&Boolean(interaction.options.getString("ulke"))');
    expect(handler).toContain("if(explicitGameMasterCountry)return null");
    expect(handler).toContain("if(requested&&isGameMaster(interaction))return resolveCountry(interaction,requested)");
    expect(handler).not.toContain("if(!interaction.guildId||isGameMaster(interaction))return null");
  });
});
