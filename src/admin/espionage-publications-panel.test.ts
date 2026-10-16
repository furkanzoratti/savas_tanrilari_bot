import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("GM casusluk yayınları paneli", () => {
  it("menü, API ve görsel yönetimiyle eksiksiz bağlanır", () => {
    const html = read("./public/index.html");
    const app = read("./public/app.js");
    const css = read("./public/app.css");
    const server = read("./server.ts");
    const service = read("./espionage-publication-service.ts");

    expect(html).toContain('data-route="espionage-publications"');
    expect(html).toContain("espionage-publications-v27");
    expect(app).toContain("async function espionagePublicationsPage");
    expect(app).toContain("Yerleşke–kanal eşleştirmeleri");
    expect(app).toContain("Hazır olay metinleri");
    expect(app).toContain("openPublicationTemplateEditor");
    expect(css).toContain(".publication-template-grid");
    expect(css).toContain(".publication-settlement-row");
    expect(server).toContain('url.pathname === "/api/espionage-publications"');
    expect(server).toContain("serveEspionageEventAsset");
    expect(service).toContain("setSettlementChannel");
    expect(service).toContain("updateTemplate");
    expect(service).toContain("resetTemplate");
    expect(service).toContain("ESPIONAGE_PUBLICATION_CHANNEL_SET");
  });
});
