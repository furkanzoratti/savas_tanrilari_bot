import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("GM governorship management panel", () => {
  it("registers the navigation page and API routes", () => {
    expect(read("./public/index.html")).toContain('data-route="governorships"');
    expect(read("./public/app.js")).toContain('if (route === "governorships") return await governorshipsPage()');
    const server = read("./server.ts");
    expect(server).toContain('url.pathname === "/api/governorships"');
    expect(server).toContain('url.pathname === "/api/governorships/end"');
  });

  it("shows current effects and supports forced administrative termination", () => {
    const service = read("./governorship-admin-service.ts");
    expect(service).toContain("effectSummary");
    expect(service).toContain("lastEffect");
    expect(service).toContain("Yönetici tarafından sonlandırıldı");
    expect(service).toContain("assignment='NONE'");
    const app = read("./public/app.js");
    expect(app).toContain("data-end-governorship");
    expect(app).toContain("Güncel mekanik etki");
  });
});
