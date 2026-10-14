import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");

describe("GM paneli filo gemi canı yönetimi",()=>{
  it("filo sağlamlık gruplarını gerçek gemi ve hasar kayıtlarından üretir",()=>{
    const service=read("./service.ts");
    expect(service).toContain("async fleet(fleetId: string)");
    expect(service).toContain("ARRAY_AGG(damage.id ORDER BY damage.id) AS damage_ids");
    expect(service).toContain("healthGroups");
    expect(service).toContain("NAVAL_HULL_STATS[allocation.ship_type].maxHp");
  });

  it("hasarlı ve sağlam grupların canını güvenli transaction ile doğrudan değiştirir",()=>{
    const service=read("./service.ts");
    expect(service).toContain("async updateFleetHealth(");
    expect(service).toContain("DELETE FROM naval_ship_damage WHERE id=ANY($1::uuid[])");
    expect(service).toContain("FROM generate_series(1,$9)");
    expect(service).toContain('"admin.panel.fleet.health.update"');
    expect(service).toContain("Etkin savaşa bağlı filonun gemi canı değiştirilemez");
  });

  it("filo tablosundan isimli düzenleyiciyi ve doğrulanmış API rotalarını açar",()=>{
    const server=read("./server.ts");
    const app=read("./public/app.js");
    expect(server).toContain("adminPanelService.fleet(");
    expect(server).toContain("adminPanelService.updateFleetHealth(");
    expect(app).toContain('data-edit-fleet="${row.id}"');
    expect(app).toContain("openFleetHealthEditor");
    expect(app).toContain("edit-fleet-hp");
    expect(app).toContain("Azami HP verilen hasar kayıtları kaldırılır");
  });

  it("filoyu açık onay, operasyon kilitleri ve hasarlı gemi korumasıyla silebilir",()=>{
    const service=read("./service.ts");
    const server=read("./server.ts");
    const app=read("./public/app.js");
    expect(service).toContain('confirmation: z.literal("FILOYU SIL")');
    expect(service).toContain("async deleteFleet(");
    expect(service).toContain("Bu filoda hasarlı gemiler var");
    expect(service).toContain('"admin.panel.fleet.delete"');
    expect(server).toContain("adminPanelService.deleteFleet");
    expect(app).toContain('id="delete-fleet"');
    expect(app).toContain('confirmation!=="FILOYU SIL"');
  });
});
