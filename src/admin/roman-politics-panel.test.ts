import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");

describe("Operasyon Masası Roma Siyaseti sayfası",()=>{
  it("menüyü, istemci rotasını ve güvenli API rotasını birlikte sunar",()=>{
    expect(read("./public/index.html")).toContain('data-route="roman-politics"');
    expect(read("./public/app.js")).toContain('api("/api/roman-politics")');
    expect(read("./server.ts")).toContain('url.pathname === "/api/roman-politics"');
  });

  it("seçim oylarını doğru ballot tablosundan okur",()=>{
    const service=read("./service.ts");
    expect(service).toContain("roman_election_ballots vote");
    expect(service).not.toContain("roman_election_votes vote");
  });
});
