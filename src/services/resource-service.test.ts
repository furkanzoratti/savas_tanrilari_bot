import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { localResourceState, settlementResourceStates } from "./resource-service.js";

describe("yerel hammadde ticaret tüketimi", () => {
  it("binasız yerleşkenin iki aktif ticaretinde yerel etkiyi kapatır", () => {
    expect(localResourceState(0, 2)).toEqual({
      production: 2,
      activeTradeUsage: 2,
      remaining: 0,
      ownResourceActive: false
    });
  });

  it("Hammadde İşletmesi üretimi kaldığı sürece yerel etkiyi korur", () => {
    expect(localResourceState(1, 2)).toEqual({
      production: 4,
      activeTradeUsage: 2,
      remaining: 2,
      ownResourceActive: true
    });
    expect(localResourceState(3, 8).ownResourceActive).toBe(false);
  });

  it("tükenen yerel kaynağı kaldırırken ticaretle gelen kaynağı etkin tutar", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [
        { id: "a", resource_type: "IRON", raw_material_level: 0, active_trade_usage: 2 },
        { id: "b", resource_type: "WINE", raw_material_level: 1, active_trade_usage: 2 }
      ] })
      .mockResolvedValueOnce({ rows: [
        { settlement_id: "a", resource_type: "TIMBER" },
        { settlement_id: "b", resource_type: "GLASS" }
      ] });
    const states = await settlementResourceStates({ query } as unknown as DbClient, "country");

    expect(states.get("a")).toMatchObject({ ownResourceActive: false, remaining: 0, resources: ["TIMBER"] });
    expect(states.get("b")).toMatchObject({ ownResourceActive: true, remaining: 2, resources: ["WINE", "GLASS"] });
  });
});
