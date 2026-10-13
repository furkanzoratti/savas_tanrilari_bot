import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("GM operasyon merkezi", () => {
  it("oyun sağlığı ekranını salt okunur bir GET uç noktasıyla sunar", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const html = read("./public/index.html");

    expect(server).toContain('url.pathname === "/api/game-health"');
    expect(server).toContain("adminPanelService.gameHealth()");
    expect(service).toContain("async gameHealth()");
    expect(service).toContain("Yerleşkesiz aktif devlet");
    expect(service).toContain("Yok edilmiş devlete bağlı kuvvet");
    expect(service).toContain("Birden fazla mareşal");
    expect(html).toContain('data-route="health"');
  });

  it("komut paleti, gerçek kayıt yönlendirmesi ve kişisel çalışma alanı sağlar", () => {
    const app = read("./public/app.js");
    const css = read("./public/app.css");

    expect(app).toContain("const paletteCommands");
    expect(app).toContain("event.ctrlKey || event.metaKey");
    expect(app).toContain("openWorkspaceRecord");
    expect(app).toContain('writeStoredList("favorites"');
    expect(app).toContain('writeStoredList("recent"');
    expect(app).toContain('SETTLEMENT: "settlements"');
    expect(app).toContain('CHARACTER: "characters"');
    expect(css).toContain(".workspace-shortcuts");
    expect(css).toContain(".health-issue");
    expect(css).toContain("tr.record-focus");
  });

  it("devlet ve yerleşkeleri ilişkisel kontrol merkezleri olarak sunar", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const app = read("./public/app.js");

    expect(server).toContain("adminPanelService.settlement(settlementDetailMatch[1]!)");
    expect(service).toContain("async settlement(settlementId: string)");
    expect(service).toContain("alliances: allianceRows.rows");
    expect(service).toContain("vassalages: vassalRows.rows");
    expect(service).toContain("transactions: transactionRows.rows");
    expect(service).toContain("armyAllocations: armyAllocations.rows");
    expect(app).toContain("function countryRelationsPanel");
    expect(app).toContain("async function settlementDetail");
    expect(app).toContain("Ekonomi ve olay geçmişi");
  });
});
