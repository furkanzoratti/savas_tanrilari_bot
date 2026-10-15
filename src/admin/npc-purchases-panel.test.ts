import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("NPC alım yönetim paneli", () => {
  it("menü, dört alım modu ve hızlı bina işlem rotalarını sunar", () => {
    const html = read("./public/index.html");
    const server = read("./server.ts");
    expect(html).toContain('data-route="npc-purchases"');
    expect(server).toContain('url.pathname === "/api/npc-purchases"');
    expect(server).toContain('url.pathname === "/api/npc-purchases/preview"');
    expect(server).toContain('url.pathname === "/api/admin/npc-purchases/execute"');
    expect(server).toContain("const npcBuildingDashboardMatch");
    expect(server).toContain("const npcBuildingPurchaseMatch");
    expect(server).toContain("const npcTreasuryTransferMatch");
    expect(server).toContain("npcPanelPurchaseService.preview");
    expect(server).not.toContain('/api/admin/npc-purchases/config');
    expect(server).not.toContain("npcPurchaseCountryMatch");
  });

  it("otomatik alım türlerini ve yerleşke bazlı hızlı bina yönetimini gösterir", () => {
    const app = read("./public/app.js");
    expect(app).toContain("async function npcPurchasesPage()");
    expect(app).toContain("openNpcPurchasePreview");
    expect(app).toContain("plan.shipActions");
    expect(app).toContain("plan.unitActions");
    expect(app).toContain("openNpcBuildingManager");
    expect(app).toContain("data-npc-buy-building");
    expect(app).toContain("openNpcTreasuryTransfer");
    expect(app).toContain("data-npc-open-transfer");
    expect(app).toContain('let npcPurchaseMode = "GENERAL"');
  });

  it("toplu önizlemeyi kontrollü eşzamanlı belge yüklemesiyle hızlandırır", () => {
    const service = read("../services/npc-panel-purchase-service.ts");
    expect(service).toContain("return mapConcurrent(ids, 6");
    expect(service).toContain("planPlayerPurchases");
    expect(service).toContain("PLAYER_AUTO_PURCHASE_MODES");
  });
});
