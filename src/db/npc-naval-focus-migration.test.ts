import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("kırk altıncı migration", () => {
  const migration = migrations.find((item) => item.version === 46);
  it("Gemi Odaklı NPC alım modelini veritabanı kısıtlarına ekler", () => {
    expect(migration?.name).toBe("npc_naval_focus_doctrine");
    expect(migration?.sql).toContain("NAVAL_FOCUS");
  });
});
