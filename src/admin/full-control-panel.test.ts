import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("GM paneli tam yetki veri katmanı", () => {
  it("panel menüsünü, istemci rotasını ve güvenli API rotalarını birlikte sunar", () => {
    expect(read("./public/index.html")).toContain('data-route="data-control"');
    expect(read("./public/app.js")).toContain('if (route === "data-control") return dataControlPage()');
    const server = read("./server.ts");
    expect(server).toContain('url.pathname === "/api/admin-data/catalog"');
    expect(server).toContain('url.pathname === "/api/admin-data/rows"');
    expect(server).toContain('url.pathname === "/api/admin-data/options"');
    expect(server).toContain('url.pathname === "/api/admin-data/mutate"');
    expect(server).toContain("requireMutation(request, response)");
  });

  it("güvenlik tablolarını gizler, audit geçmişini değiştirmez ve her mutasyonu denetler", () => {
    const service = read("./data-control-service.ts");
    expect(service).toContain('"schema_migrations", "admin_panel_login_tokens", "admin_panel_operations"');
    expect(service).toContain('const IMMUTABLE_TABLES = new Set(["audit_logs"])');
    expect(service).toContain('"ADMIN_DATA_INSERT"');
    expect(service).toContain('"ADMIN_DATA_UPDATE"');
    expect(service).toContain('"ADMIN_DATA_DELETE"');
    expect(service).toContain("Kayıt bulunamadı veya bu sunucuya ait değil.");
  });

  it("silme işlemini açık onaya ve bütün değişiklikleri gerekçeye bağlar", () => {
    const service = read("./data-control-service.ts");
    expect(service).toContain('confirmation !== "SIL"');
    expect(service).toContain("reason: z.string().trim().min(3).max(500)");
    expect(read("./public/app.js")).toContain('window.prompt("Kalıcı silmeyi onaylamak için SIL yazın.")');
  });

  it("yabancı anahtarları oyun içi adlara çevirir ve arayüzde teknik kimlikler yerine seçim sunar", () => {
    const service = read("./data-control-service.ts");
    const app = read("./public/app.js");
    expect(service).toContain("referenceLabels(meta, table, result.rows)");
    expect(service).toContain("async options(tableName: string, columnName: string");
    expect(app).toContain("column.reference");
    expect(app).toContain("dataRecordCard(table, row, index)");
    expect(app).toContain("Teknik alanlar");
  });

  it("özel tanımı bulunmayan tabloları ve alanları da Türkçe sözlükle kart görünümüne taşır", () => {
    const service = read("./data-control-service.ts");
    const app = read("./public/app.js");
    expect(service).toContain('alliances: "İttifakları"');
    expect(service).toContain('settlements: "Yerleşkeler"');
    expect(app).toContain("dataFieldWords");
    expect(app).toContain('class="data-record-grid"');
  });
});
