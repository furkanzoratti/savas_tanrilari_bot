import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("Capua serbest gladyatör teklifi migration", () => {
  it("25 Altınlık adım kısıtını kaldırır ve yalnızca açılış tabanını korur", () => {
    const migration = migrations.find((item) => item.version === 120);
    expect(migration?.name).toBe("capua_gladiator_free_bid_amounts");
    expect(migration?.sql).toContain("DROP CONSTRAINT IF EXISTS great_games_gladiator_auction_bids_amount_check");
    expect(migration?.sql).toContain("CHECK (amount>=50)");
    expect(migration?.sql).not.toContain("MOD(amount-50,25)");
  });
});
