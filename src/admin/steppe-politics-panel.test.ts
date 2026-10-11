import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("bozkır siyaseti yönetim paneli",()=>{
  it("Hanlar Hanlığını, Han devletlerini ve normal vassalları ayrı gösterir",()=>{
    const html=read("./public/index.html");
    const app=read("./public/app.js");
    expect(html).toContain('data-route="steppe-politics"');
    expect(app).toContain('api("/api/steppe-politics")');
    expect(app).toContain("Bağlı normal devletler");
    expect(app).toContain("Toprak Ağası kademesi kullanılmaz");
    expect(app).toContain("Yalnız üç konfederasyonda aktiftir");
    expect(app).not.toContain("devletsiz Toprak Ağaları");
  });
});
