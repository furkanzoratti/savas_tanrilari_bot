import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { syncCountryPrimaryCulture } from "./culture-service.js";

function clientWith(current: string, rows: Array<{ culture_group: string; population: number }>) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SELECT primary_culture_group")) return { rows: [{ primary_culture_group: current }], rowCount: 1 };
    if (sql.includes("GROUP BY culture_group")) return { rows, rowCount: rows.length };
    return { rows: [], rowCount: 1 };
  });
  return { client: { query } as unknown as DbClient, query };
}

describe("ana kültür senkronizasyonu", () => {
  it("özgür nüfusu en yüksek kültürü seçer", async () => {
    const { client, query } = clientWith("HELLENIC", [
      { culture_group: "HELLENIC", population: 40_000 },
      { culture_group: "ANATOLIAN", population: 60_000 }
    ]);
    await expect(syncCountryPrimaryCulture(client, "country")).resolves.toBe("ANATOLIAN");
    expect(query).toHaveBeenCalledWith(
      "UPDATE countries SET primary_culture_group=$1 WHERE id=$2",
      ["ANATOLIAN", "country"]
    );
  });

  it("eşitlikte mevcut ana kültürü korur", async () => {
    const { client, query } = clientWith("HELLENIC", [
      { culture_group: "HELLENIC", population: 50_000 },
      { culture_group: "ANATOLIAN", population: 50_000 }
    ]);
    await expect(syncCountryPrimaryCulture(client, "country")).resolves.toBe("HELLENIC");
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE countries"))).toBe(false);
  });
});
