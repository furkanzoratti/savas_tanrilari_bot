import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("GM paneli lacivert, krem ve kahverengi arayüzü", () => {
  it("YZ Devletleri menüsünü ve istemci rotasını kaldırır", () => {
    const html = read("./public/index.html");
    const app = read("./public/app.js");
    expect(html).not.toContain('data-route="ai-governance"');
    expect(html).not.toContain("YZ Devletleri");
    expect(app).not.toContain('if (route === "ai-governance")');
  });

  it("mat krem, lacivert ve kahverengi tasarım değişkenlerini kullanır", () => {
    const css = read("./public/app.css");
    expect(css).toContain("--navy: #17243d");
    expect(css).toContain("--cream: #f4eee4");
    expect(css).toContain("--brown: #805238");
    expect(css).toContain("background: linear-gradient(180deg,var(--navy)");
  });

  it("yön bulmayı ve okunabilirliği güçlendiren arayüz öğelerini sunar", () => {
    const html = read("./public/index.html");
    const app = read("./public/app.js");
    const css = read("./public/app.css");

    expect(html).toContain('class="nav-section"');
    expect(html).toContain('id="active-page-title"');
    expect(app).toContain("const routeTitles");
    expect(app).toContain('class="loading-shell"');
    expect(css).toContain(".overview-hero");
    expect(css).toContain("position: sticky");
    expect(css).toContain("button:focus-visible");
  });
});
