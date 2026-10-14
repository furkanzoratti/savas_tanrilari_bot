import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.ADMIN_PANEL_BASE_URL = "https://panel.example.test";
  process.env.ADMIN_DISCORD_USER_IDS = "123";
  process.env.ADMIN_GUILD_ID = "456";
  process.env.ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  return { query: vi.fn(), active: 0, maximum: 0 };
});

vi.mock("./db.js", () => ({
  adminPool: { query: mocks.query },
  withAdminTransaction: vi.fn()
}));

import { adminPanelService } from "./service.js";

function queryResult(sql: string) {
  if (sql.trimStart().startsWith("SELECT current_turn,turn_phase FROM guilds")) return { rows: [{ current_turn: 37, turn_phase: "OPEN" }] };
  return { rows: [] };
}

describe("ağır panel menülerinin yükleme kurtarması", () => {
  it("mekanik sorgularını sınırlı eşzamanlı çalıştırır ve tek alt bölüm hatasında sayfayı döndürür", async () => {
    mocks.active = 0;
    mocks.maximum = 0;
    mocks.query.mockImplementation(async (sql: string) => {
      mocks.active += 1;
      mocks.maximum = Math.max(mocks.maximum, mocks.active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      mocks.active -= 1;
      if (sql.includes("country_port_access")) throw Object.assign(new Error("missing relation"), { code: "42P01" });
      return queryResult(sql);
    });

    const result = await adminPanelService.mechanicsControl("DIPLOMACY");

    expect(mocks.maximum).toBeLessThanOrEqual(3);
    expect(result.guild).toEqual({ current_turn: 37, turn_phase: "OPEN" });
    expect(result.portAccess).toEqual([]);
    expect(result.warnings).toContain("Liman erişimleri şu anda yüklenemedi (42P01).");
  });

  it("rapor sorgularından biri hata verse bile boş iskelette kalmak yerine kısmi rapor döndürür", async () => {
    mocks.query.mockReset();
    mocks.active = 0;
    mocks.maximum = 0;
    mocks.query.mockImplementation(async (sql: string) => {
      mocks.active += 1;
      mocks.maximum = Math.max(mocks.maximum, mocks.active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      mocks.active -= 1;
      if (sql.includes("FROM audit_logs")) throw Object.assign(new Error("timeout"), { code: "57014" });
      return queryResult(sql);
    });

    const result = await adminPanelService.reporting();

    expect(mocks.maximum).toBeLessThanOrEqual(3);
    expect(result.guild.current_turn).toBe(37);
    expect(result.activity).toEqual([]);
    expect(result.warnings).toContain("Yönetim etkinliği şu anda yüklenemedi (57014).");
  });
});
