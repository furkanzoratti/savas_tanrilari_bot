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

  it("aile işletmelerini ve senatör bazlı oy dökümünü yönetir",()=>{
    const service=read("./service.ts");
    const server=read("./server.ts");
    const app=read("./public/app.js");
    expect(service).toContain("roman_family_businesses business");
    expect(service).toContain("purchaseRomanFamilyBusiness");
    expect(service).toContain("'senatorName'");
    expect(service).toContain("'npcScore'");
    expect(server).toContain("/businesses$");
    expect(app).toContain("data-buy-roman-business");
    expect(app).toContain("NPC oyu kapanışta");
    expect(app).toContain("romanElectionVoterRows");
    expect(app).toContain("romanProposalVoterRows");
  });

  it("NPC ailelerin tahmini konsül oylarını gösterir ve yönetici tercihini kaydeder",()=>{
    const service=read("./service.ts");
    const server=read("./server.ts");
    const app=read("./public/app.js");
    expect(service).toContain("romanNpcDecisionScore");
    expect(service).toContain("setRomanNpcElectionPreference");
    expect(server).toContain("npc-preferences");
    expect(app).toContain("Otomatik tahmin");
    expect(app).toContain("data-roman-npc-preference");
  });
});
