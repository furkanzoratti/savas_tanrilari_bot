import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("50. Tur gladyatör kurası migration", () => {
  it("kalıcı kura, ülke sırası ve ücretsiz sahiplik altyapısını kurar", () => {
    const migration=migrations.find((item)=>item.version===231);
    expect(migration?.name).toBe("turn_50_gladiator_draw");
    expect(migration?.sql).toContain("CHECK (purchase_price>=0)");
    expect(migration?.sql).toContain("acquisition_method TEXT NOT NULL DEFAULT 'AUCTION'");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_draws");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_draw_countries");
    expect(migration?.sql).toContain("great_games_gladiator_ownerships_draw_order_uq");
  });
});
