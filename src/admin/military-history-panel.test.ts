import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("askeri işlem geçmişi paneli",()=>{
  it("navigasyon ve API rotasını kaydeder",()=>{
    expect(read("./public/index.html")).toContain('data-route="military-history"');
    expect(read("./server.ts")).toContain('url.pathname==="/api/military-history"');
    expect(read("./public/app.js")).toContain('if (route === "military-history") return await militaryHistoryPage()');
  });

  it("ülke ve kara-deniz filtreleriyle üretim ve komut kayıtlarını gösterir",()=>{
    const service=read("./service.ts");
    expect(service).toContain("async militaryHistory");
    expect(service).toContain("log.action LIKE 'army.%'");
    expect(service).toContain("log.action LIKE 'fleet.%'");
    expect(service).toContain("UNIT_PURCHASE");
    expect(service).toContain("SHIP_PURCHASE");
    expect(service).toContain("turn_log.action='TURN_ADVANCE'");
    expect(service).not.toContain("COALESCE(log.game_turn");
    expect(service).toContain("detail_settlement.name");
    const app=read("./public/app.js");
    expect(app).toContain("military-history-country");
    expect(app).toContain("military-history-category");
    expect(app).toContain("military-history-search");
    expect(app).toContain("Köken yerleşkesi");
    expect(app).toContain("Aktarılan asker");
    expect(app).toContain("militaryUnitLabel");
  });
});
