import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("GM war and battle command panels",()=>{
  it("separates official wars from tactical battles",()=>{
    const html=read("./public/index.html"),app=read("./public/app.js");
    expect(html).toContain('data-route="state-wars"');
    expect(html).toContain('data-route="battles"><span>🔥</span> Muharebeler');
    expect(app).toContain('if (route === "state-wars") return await stateWarsPage()');
    expect(app).toContain("Tur dökümü");
    expect(app).toContain("Katılımcıları yönet");
  });

  it("exposes battle dice history and official war intervention routes",()=>{
    const server=read("./server.ts"),service=read("./service.ts"),warService=read("./state-war-admin-service.ts");
    expect(server).toContain("/api/state-wars");
    expect(server).toContain("/history");
    expect(server).toContain("/participants");
    expect(server).toContain("/leader");
    expect(service).toContain("battleHistory");
    expect(service).toContain("battle_rolls");
    expect(service).toContain("battle_rounds");
    expect(warService).toContain("addWarParticipant");
    expect(warService).toContain("removeWarParticipant");
    expect(warService).toContain("changeWarLeader");
  });
});
