import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");

describe("GM paneli soylu trait yönetimi",()=>{
  it("sol menüde bağımsız ve gezilebilir bir bölüm sunar",()=>{
    expect(read("./public/index.html")).toContain('data-route="noble-traits"');
    const app=read("./public/app.js");
    expect(app).toContain('if (route === "noble-traits") return await nobleTraitsPage()');
    expect(app).toContain('setActiveRoute("noble-traits")');
  });

  it("listeleme, seçme, rastgele atama ve kaldırma kontrollerini birlikte sunar",()=>{
    const app=read("./public/app.js");
    expect(app).toContain('api("/api/noble-traits")');
    expect(app).toContain("data-set-noble-trait");
    expect(app).toContain("data-reroll-noble-trait");
    expect(app).toContain("data-remove-noble-trait");
    expect(app).toContain('{ action: "SET", traitKey }');
    expect(app).not.toContain("Yalnızca hükümdarken çalışır");
    expect(app).not.toContain("Etki çalışmıyor");
  });

  it("hanedan detayında traitleri durumlarına göre görsel kartlarla ayırır",()=>{
    const app=read("./public/app.js");
    const css=read("./public/app.css");
    expect(app).toContain("nobleTraitVisual(trait, traitActions)");
    expect(css).toContain(".noble-trait-positive");
    expect(css).toContain(".noble-trait-mixed");
    expect(css).toContain(".noble-trait-negative");
    expect(app).toContain('class="noble-traits-table"');
    expect(css).toContain(".noble-trait-toolbar");
  });

  it("okuma ve yönetim API rotalarını yetki katmanına bağlar",()=>{
    const server=read("./server.ts");
    const service=read("./service.ts");
    expect(server).toContain('url.pathname === "/api/noble-traits"');
    expect(server).toContain("updateDynastyMemberTrait");
    expect(service).toContain("async nobleTraits()");
    expect(service).toContain('action:z.enum(["SET","REROLL","REMOVE"])');
    expect(service).toContain("active_monarch.spouse_id=member.id");
  });
});

