import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

describe("filolarım kontrol merkezi",()=>{
  it("filo bilgi yerine bağımsız filolarım komutunu kaydeder",()=>{
    const dashboard=commandBuilders.find((command)=>command.name==="filolarim");
    expect(dashboard).toBeDefined();
    expect(dashboard?.options?.map((option)=>option.name)).toEqual(["ulke"]);
    expect(commandBuilders.find((command)=>command.name==="filo")?.options?.some((option)=>option.name==="bilgi")).toBe(false);
  });

  it("özet ve filo gezintisini gösterirken uzun havuz dökümünü ayrı komuta bırakır",()=>{
    const source=readFileSync(new URL("./fleet-control-ui.ts",import.meta.url),"utf8");
    expect(source).toContain("Filo Komuta Merkezi");
    expect(source).not.toContain("function poolDetail");
    expect(source).toContain("allocateEntirePool");
    expect(source).toContain("availableSettlementShips");
    expect(source).toContain("Gemi Seçerek Aktar");
  });

  it("filolarım komutunu filo yöneticisine ve yönetici ülke seçimine bağlar",()=>{
    const fleetUi=readFileSync(new URL("./fleet-ui.ts",import.meta.url),"utf8");
    const handler=readFileSync(new URL("./handler.ts",import.meta.url),"utf8");
    expect(fleetUi).toContain('interaction.commandName==="filolarim"');
    expect(fleetUi).toContain("sendFleetDashboard(interaction,country.id)");
    expect(handler).toContain('interaction.commandName === "filo" || interaction.commandName === "filolarim"');
    expect(handler).toContain('["ordularim","filolarim"].includes(interaction.commandName)');
  });
});
