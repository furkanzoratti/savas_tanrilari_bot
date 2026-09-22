import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { deductPopulationForCasualties } from "./population-loss.js";

describe("savaş kaybının nüfusa uygulanması", () => {
  it("gerçek kayıp kadar nüfus düşer", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ population: 10_000 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const applied = await deductPopulationForCasualties({ query } as unknown as DbClient, "city", 750);
    expect(applied).toBe(750);
    expect(query).toHaveBeenLastCalledWith(
      "UPDATE settlements SET population=population-$1 WHERE id=$2",
      [750, "city"]
    );
  });

  it("nüfustan fazlasını düşmez ve açık miktarını raporlamaya bırakır", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ population: 300 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await deductPopulationForCasualties({ query } as unknown as DbClient, "city", 500)).toBe(300);
    expect(query).toHaveBeenLastCalledWith(
      "UPDATE settlements SET population=population-$1 WHERE id=$2",
      [300, "city"]
    );
  });

  it("sıfır kayıpta veritabanına dokunmaz", async () => {
    const query = vi.fn();
    expect(await deductPopulationForCasualties({ query } as unknown as DbClient, "city", 0)).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
