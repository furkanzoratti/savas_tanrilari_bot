import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./public/app.js", import.meta.url), "utf8");

describe("yönetim paneli kaydırma konumu", () => {
  it("işlem sonrası veri yenilemelerini mevcut kaydırma konumunu koruyarak yapar", () => {
    expect(app).toContain("async function refreshKeepingScroll(loader)");
    expect(app).toContain("const scrollTop = window.scrollY");
    expect(app).toContain("window.scrollTo(0, Math.min(scrollTop, maximumScroll))");
    expect(app).toContain("await refreshKeepingScroll(settlementsPage)");
    expect(app).toContain("await refreshKeepingScroll(romanPoliticsPage)");
    expect(app).toContain("await refreshKeepingScroll(steppePoliticsPage)");
    expect(app).toContain("await refreshKeepingScroll(battlesPage)");
  });

  it("manuel yenileme düğmelerinde de aynı korumayı kullanır", () => {
    expect(app).toContain('addEventListener("click",()=>refreshKeepingScroll(rebellionsPage))');
    expect(app).toContain('addEventListener("click", () => refreshKeepingScroll(auditPage))');
  });
});
