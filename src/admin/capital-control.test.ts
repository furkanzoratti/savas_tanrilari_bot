import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("GM paneli başkent yönetimi", () => {
  it("devlet listesi ve detayında başkenti gerçek adıyla gösterir", () => {
    const service = read("./service.ts");
    const app = read("./public/app.js");
    expect(service).toContain("capital.name AS capital_name");
    expect(service).toContain("is_capital: row.id === country.capital_settlement_id");
    expect(app).toContain("♜ Başkent");
    expect(app).toContain("Gelir ve nüfus artışı +%1");
  });

  it("yalnızca devlete ait yerleşkeyi transaction içinde yeni başkent yapar", () => {
    const service = read("./service.ts");
    expect(service).toContain("async updateCountryCapital(");
    expect(service).toContain("settlement.id=$1 AND settlement.country_id=$2");
    expect(service).toContain("UPDATE countries SET capital_settlement_id=$1 WHERE id=$2");
    expect(service).toContain("FOR UPDATE OF country");
    expect(service).toContain('"admin.panel.country.capital.update"');
  });

  it("yönetici formunda bonus aktarımını açıklar ve korumalı API rotasını kullanır", () => {
    const server = read("./server.ts");
    const app = read("./public/app.js");
    expect(server).toContain("adminPanelService.updateCountryCapital(");
    expect(server).toContain("requireMutation(request, response)");
    expect(app).toContain("function openCapitalEditor(");
    expect(app).toContain("Başkent bonusları anında taşınır.");
    expect(app).toContain("/capital`" );
    expect(app).toContain("Yönetici işlem gerekçesi");
  });

  it("başkent değişimini Rehberli İşlemler ekranında bağımsız yönetici hamlesi olarak sunar", () => {
    const service = read("./service.ts");
    const app = read("./public/app.js");
    expect(service).toContain("country.capital_settlement_id");
    expect(service).toContain("capital.name AS capital_name");
    expect(app).toContain("function openGuidedCapitalChange(data)");
    expect(app).toContain("data-guided-capital");
    expect(app).toContain("Eski bonus otomatik kaldırılır");
  });
});
