import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("GM operasyon merkezi", () => {
  it("oyun sağlığı ekranını salt okunur bir GET uç noktasıyla sunar", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const html = read("./public/index.html");

    expect(server).toContain('url.pathname === "/api/game-health"');
    expect(server).toContain("adminPanelService.gameHealth()");
    expect(service).toContain("async gameHealth()");
    expect(service).toContain("Yerleşkesiz aktif devlet");
    expect(service).toContain("Yok edilmiş devlete bağlı kuvvet");
    expect(service).toContain("Birden fazla mareşal");
    expect(html).toContain('data-route="health"');
  });

  it("komut paleti, gerçek kayıt yönlendirmesi ve kişisel çalışma alanı sağlar", () => {
    const app = read("./public/app.js");
    const css = read("./public/app.css");

    expect(app).toContain("const paletteCommands");
    expect(app).toContain("event.ctrlKey || event.metaKey");
    expect(app).toContain("openWorkspaceRecord");
    expect(app).toContain('writeStoredList("favorites"');
    expect(app).toContain('writeStoredList("recent"');
    expect(app).toContain('SETTLEMENT: "settlements"');
    expect(app).toContain('CHARACTER: "characters"');
    expect(css).toContain(".workspace-shortcuts");
    expect(css).toContain(".health-issue");
    expect(css).toContain("tr.record-focus");
  });

  it("devlet ve yerleşkeleri ilişkisel kontrol merkezleri olarak sunar", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const app = read("./public/app.js");

    expect(server).toContain("adminPanelService.settlement(settlementDetailMatch[1]!)");
    expect(service).toContain("async settlement(settlementId: string)");
    expect(service).toContain("alliances: allianceRows.rows");
    expect(service).toContain("vassalages: vassalRows.rows");
    expect(service).toContain("transactions: transactionRows.rows");
    expect(service).toContain("armyAllocations: armyAllocations.rows");
    expect(app).toContain("function countryRelationsPanel");
    expect(app).toContain("async function settlementDetail");
    expect(app).toContain("Ekonomi ve olay geçmişi");
  });

  it("riskli GM müdahalelerini rehberli önizleme ve onay akışlarıyla yürütür", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const app = read("./public/app.js");
    const html = read("./public/index.html");

    expect(html).toContain('data-route="gm-operations"');
    expect(server).toContain('url.pathname === "/api/operations/treasury/preview"');
    expect(server).toContain('url.pathname === "/api/operations/treasury/apply"');
    expect(server).toContain('url.pathname === "/api/operations/settlement-transfer/preview"');
    expect(server).toContain('url.pathname === "/api/operations/settlement-transfer/apply"');
    expect(server).toContain('url.pathname === "/api/operations/diplomacy/end"');
    expect(service).toContain('kind: "GUIDED_TREASURY"');
    expect(service).toContain('kind: "GUIDED_SETTLEMENT_TRANSFER"');
    expect(service).toContain("claimAdminOperation");
    expect(service).toContain("Hazine önizlemeden sonra değişti");
    expect(service).toContain("Yerleşkenin sahibi önizlemeden sonra değişti");
    expect(app).toContain("async function guidedOperationsPage");
    expect(app).toContain("function openGuidedTreasury");
    expect(app).toContain("function openGuidedSettlementTransfer");
    expect(app).toContain("function openGuidedCharacterCancel");
    expect(app).toContain("function openGuidedDiplomacyEnd");
  });

  it("toplu değişiklikleri önizleme, tutarlılık ve tek işlem korumasıyla uygular", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const app = read("./public/app.js");
    const html = read("./public/index.html");

    expect(html).toContain('data-route="bulk-operations"');
    expect(server).toContain('url.pathname === "/api/operations/bulk/preview"');
    expect(server).toContain('url.pathname === "/api/operations/bulk/apply"');
    expect(service).toContain('kind: z.literal("COUNTRY_MOBILIZATION")');
    expect(service).toContain('kind: z.literal("SETTLEMENT_TAX")');
    expect(service).toContain('kind: z.literal("CHARACTER_ASSIGNMENT_CANCEL")');
    expect(service).toContain("Seçilen kayıtlardan en az biri önizlemeden sonra değişti");
    expect(service).toContain('"admin.panel.bulk.apply"');
    expect(app).toContain("async function bulkOperationsPage");
    expect(app).toContain("function openBulkOperation");
    expect(app).toContain("Ya hep ya hiç uygulama");
  });

  it("oyun sağlığı bulgularında yalnız deterministik onarımları otomatik uygular", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const app = read("./public/app.js");

    expect(server).toContain('url.pathname === "/api/game-health/repair"');
    expect(service).toContain('z.literal("ONAR")');
    expect(service).toContain('"DISMISS_INACTIVE_CHARACTER"');
    expect(service).toContain('"RECONCILE_MARSHALS"');
    expect(service).toContain('"COMPLETE_OVERDUE_REPAIR"');
    expect(service).toContain('"REMOVE_FOREIGN_COMMANDER"');
    expect(service).toContain('"END_INVALID_VASSALAGE"');
    expect(service).toContain('repairAction: null');
    expect(service).toContain('"admin.panel.health.repair"');
    expect(app).toContain('data-health-repair');
    expect(app).toContain("Güvenli otomatik düzeltme");
  });

  it("diplomasi, ticaret, ekonomi ve üretimi mekanik odaklı ekranlarda toplar", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const app = read("./public/app.js");
    const html = read("./public/index.html");

    expect(html).toContain('data-route="diplomacy-control"');
    expect(html).toContain('data-route="economy-control"');
    expect(server).toContain('url.pathname === "/api/mechanics-control"');
    expect(service).toContain("async mechanicsControl(scope:");
    expect(service).toContain("FROM diplomatic_pacts pact");
    expect(service).toContain("FROM country_port_access access");
    expect(service).toContain("FROM naval_orders naval");
    expect(app).toContain("async function diplomacyControlPage");
    expect(app).toContain("async function economyControlPage");
    expect(app).toContain("Hazineyi düzelt");
    expect(app).toContain("İlişkiyi sonlandır");
    expect(app).toContain("Karar bekleyen teklifler");
    expect(app).toContain("Devlet hazineleri");
    expect(app).toContain("Son 3 tur");
    expect(service).toContain("countryTurnHistory");
    expect(service).toContain("settlementTurnHistory");
    expect(service).toContain("diplomacyCountries");
  });

  it("kişisel GM çalışma alanı ve adlandırılmış filtre görünümleri sağlar", () => {
    const app = read("./public/app.js");
    const html = read("./public/index.html");
    const css = read("./public/app.css");

    expect(html).toContain('data-route="workspace"');
    expect(app).toContain("async function workspacePage");
    expect(app).toContain('writeStoredList("saved-views"');
    expect(app).toContain("function openSaveView");
    expect(app).toContain("function applySavedView");
    expect(app).toContain("data-save-data-view");
    expect(app).toContain("data-save-audit-view");
    expect(app).toContain("data-delete-saved-view");
    expect(css).toContain(".workspace-dashboard");
    expect(css).toContain(".saved-view-card");
  });

  it("devlet karşılaştırması, mali eğilim ve dışa aktarım raporları sunar", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const app = read("./public/app.js");
    const html = read("./public/index.html");
    const css = read("./public/app.css");

    expect(html).toContain('data-route="reports"');
    expect(server).toContain('url.pathname === "/api/reports"');
    expect(service).toContain("async reporting()");
    expect(service).toContain("financialHistory");
    expect(service).toContain("transactionKinds");
    expect(app).toContain("async function reportsPage");
    expect(app).toContain("function renderCountryComparison");
    expect(app).toContain("function downloadReportCsv");
    expect(app).toContain("Son turların mali akışı");
    expect(css).toContain(".country-comparison");
    expect(css).toContain(".turn-flow");
  });

  it("mekanik ve rapor menülerini kısmi sorgu hatalarında kullanılabilir tutar", () => {
    const service = read("./service.ts");
    const app = read("./public/app.js");
    const html = read("./public/index.html");
    const css = read("./public/app.css");

    expect(service).toContain("settleAdminSections");
    expect(service).toContain("], 3)");
    expect(service).toContain("warnings");
    expect(app).toContain("function loadWarningsMarkup");
    expect(app).toContain("Bazı alt bölümler yüklenemedi");
    expect(app).toContain("16_000");
    expect(app).toContain("data-retry-page");
    expect(app).toContain("/api/mechanics-control?scope=DIPLOMACY");
    expect(app).toContain("/api/mechanics-control?scope=ECONOMY");
    expect(app).toContain("state.navigationController?.abort()");
    expect(app).toContain('return await diplomacyControlPage(controller.signal)');
    expect(app).toContain('return await economyControlPage(controller.signal)');
    expect(app).toContain('return await reportsPage(controller.signal)');
    expect(app).toContain("if (options.signal) return execute()");
    expect(app).toContain("if (controller.signal.aborted || navigationId !== state.navigationId) return");
    expect(service).toContain("WITH settlement_stats AS");
    expect(service).toContain("JOIN countries scoped_country");
    expect(service).toContain('scope !== "DIPLOMACY"');
    expect(css).toContain(".load-warning");
    expect(app).toContain("const rowsOrEmpty =");
    expect(html).toContain("npc-purchases-v21");
  });

  it("son güvenlik ve performans katmanını istek izleme ve canlı durumla tamamlar", () => {
    const server = read("./server.ts");
    const service = read("./service.ts");
    const database = read("./db.ts");
    const app = read("./public/app.js");
    const html = read("./public/index.html");
    const css = read("./public/app.css");

    expect(server).toContain("MUTATION_LIMIT");
    expect(server).toContain('response.setHeader("x-request-id"');
    expect(server).toContain('response.setHeader("server-timing"');
    expect(server).toContain('response.setHeader("x-ratelimit-limit"');
    expect(server).toContain('url.pathname === "/api/system-status"');
    expect(server).toContain("databaseError");
    expect(service).toContain("async systemStatus()");
    expect(service).toContain("databaseLatencyMs");
    expect(database).toContain("statement_timeout: 7_000");
    expect(database).toContain("idle_in_transaction_session_timeout");
    expect(app).toContain("const inflightGets = new Map()");
    expect(app).toContain("new AbortController()");
    expect(app).toContain('Promise.all([api("/api/game-health"), api("/api/system-status")])');
    expect(app).toContain("Panel çalışma durumu");
    expect(css).toContain(".system-status-grid");
    expect(html).toContain("npc-purchases-v21");
  });
});
