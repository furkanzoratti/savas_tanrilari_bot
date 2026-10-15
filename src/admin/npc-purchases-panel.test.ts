import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("NPC alım yönetim paneli", () => {
  it("menü, veri ve yönetici işlem rotalarını sunar", () => {
    const html = read("./public/index.html");
    const server = read("./server.ts");
    expect(html).toContain('data-route="npc-purchases"');
    expect(server).toContain('url.pathname === "/api/npc-purchases"');
    expect(server).toContain('url.pathname === "/api/npc-purchases/preview"');
    expect(server).toContain('url.pathname === "/api/admin/npc-purchases/config"');
    expect(server).toContain('url.pathname === "/api/admin/npc-purchases/execute"');
    expect(server).toContain("const npcPurchaseCountryMatch");
    expect(server).toContain("npcAutoPurchaseService.setCountryOverride");
  });

  it("aynı otomatik alım planını bina, gemi ve asker ayrıntılarıyla önizler", () => {
    const app = read("./public/app.js");
    expect(app).toContain("async function npcPurchasesPage()");
    expect(app).toContain("openNpcPurchasePreview");
    expect(app).toContain("plan.buildingActions");
    expect(app).toContain("plan.shipActions");
    expect(app).toContain("plan.unitActions");
    expect(app).toContain('action.targetLevel === 1 ? "Yeni bina" : "Seviye yükseltme"');
  });
});
