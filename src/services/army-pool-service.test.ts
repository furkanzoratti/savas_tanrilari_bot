import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());

vi.mock("../db/pool.js", () => ({
  pool: { query, connect: vi.fn() },
  withTransaction: vi.fn()
}));

import { armyService } from "./army-service.js";

describe("asker havuzu", () => {
  beforeEach(() => query.mockReset());

  it("ordu tahsislerini düşürür, milisi dışarıda bırakır ve yerleşke/genel toplamları üretir", async () => {
    query.mockResolvedValue({
      rows: [
        { settlement_id: "rome", settlement_name: "Roma", unit_type: "light_infantry", available: 600 },
        { settlement_id: "rome", settlement_name: "Roma", unit_type: "militia", available: 300 },
        { settlement_id: "neapolis", settlement_name: "Neapolis", unit_type: "steppe_horse_archer", available: 200 },
        { settlement_id: "capua", settlement_name: "Capua", unit_type: null, available: null }
      ]
    });

    const result = await armyService.unallocatedPool("country-1");

    expect(query).toHaveBeenCalledWith(expect.stringContaining("GREATEST(0,stock.quantity-COALESCE(allocated.quantity,0))"), ["country-1"]);
    expect(query.mock.calls[0]?.[0]).toContain("FROM army_units");
    expect(result.grandTotal).toBe(800);
    expect(result.totals).toEqual(expect.arrayContaining([
      { unit_type: "light_infantry", available: 600 },
      { unit_type: "steppe_horse_archer", available: 200 }
    ]));
    expect(result.settlements.find((settlement) => settlement.settlement_name === "Roma")?.total).toBe(600);
    expect(result.settlements.find((settlement) => settlement.settlement_name === "Capua")?.units).toEqual([]);
  });
});
