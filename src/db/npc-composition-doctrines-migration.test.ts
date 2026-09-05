import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("kırk beşinci migration", () => {
  const migration = migrations.find((item) => item.version === 45);

  it("eski NPC doktrinlerini üç kompozisyon odaklı alım modeline taşır", () => {
    expect(migration?.name).toBe("composition_aware_npc_purchase_modes");
    expect(migration?.sql).toContain("FULL_BUILDING_ARMY");
    expect(migration?.sql).toContain("ARMY_ONLY");
    expect(migration?.sql).toContain("DEVELOPMENT");
    expect(migration?.sql).toContain("ALTER COLUMN doctrine SET DEFAULT 'FULL_BUILDING_ARMY'");
  });
});
