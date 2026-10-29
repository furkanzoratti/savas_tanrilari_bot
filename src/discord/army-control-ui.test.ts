import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("ordu komuta merkezi",()=>{
  it("ordu bilgi komutunu kontrol merkezine yönlendirir",()=>{
    const source=readFileSync(new URL("./army-ui.ts",import.meta.url),"utf8");
    expect(source).toContain("sendArmyDashboard(interaction,country.id)");
    expect(source).toContain('interaction.commandName==="ordularim"');
  });

  it("havuzun tamamını ve seçili birimi aktarma kontrollerini sunar",()=>{
    const source=readFileSync(new URL("./army-control-ui.ts",import.meta.url),"utf8");
    expect(source).not.toContain("function poolDetail");
    expect(source).toContain("Tüm Havuzu Aktar");
    expect(source).toContain("Birim Seçerek Aktar");
    expect(source).toContain("allocateEntirePool");
    expect(source).toContain("armyService.addUnits");
  });
});
