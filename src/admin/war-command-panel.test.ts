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

  it("groups the complete battle archive into collapsible game turns",()=>{
    const app=read("./public/app.js"),styles=read("./public/app.css"),service=read("./service.ts");
    const archiveQuery=service.slice(service.indexOf("async battles()"),service.indexOf("async battleHistory("));
    expect(app).toContain('<details class="battle-turn-group"');
    expect(app).toContain('AMBUSH: "Pusu"');
    expect(app).toContain("Tur ${number(battle.startedTurn)}'da başladı");
    expect(styles).toContain(".battle-turn-group[open]");
    expect(service).toContain("COALESCE(battle.ended_turn,battle.started_turn) AS game_turn");
    expect(service).not.toContain("LIMIT 250`");
    expect(archiveQuery).toContain("JOIN battle_sides side_a");
    expect(archiveQuery).toContain("JOIN battle_sides side_b");
    expect(archiveQuery).not.toContain("LEFT JOIN battle_sides side_a");
    expect(archiveQuery).not.toContain("LEFT JOIN battle_sides side_b");
  });
});
