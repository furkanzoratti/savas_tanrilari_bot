import { describe, expect, it } from "vitest";
import { npcBuildingLimit, npcUnitOrder, resolvedNpcDoctrine } from "./npc-auto-purchase.js";

describe("NPC otomatik alım doktrinleri", () => {
  it("dengeli doktrinde bir bina, savunmacı ve saldırganda sıfır bina planlar", () => {
    expect(npcBuildingLimit("BALANCED")).toBe(1);
    expect(npcBuildingLimit("DEFENSIVE")).toBe(0);
    expect(npcBuildingLimit("OFFENSIVE")).toBe(0);
  });

  it("hafif ordu bir bina, süvari doktrini yalnız asker kullanır", () => {
    expect(npcBuildingLimit("LIGHT_ARMY")).toBe(1);
    expect(npcBuildingLimit("CAVALRY")).toBe(0);
    expect(npcUnitOrder("CAVALRY", "country-a", 3).slice(0, 4)).toEqual([
      "light_cavalry", "heavy_cavalry", "light_cavalry", "heavy_cavalry"
    ]);
  });

  it("tarihsel profil aynı ülke ve tur için kararlı sonuç verir", () => {
    const first = resolvedNpcDoctrine("HISTORICAL", "country-a", 12);
    const second = resolvedNpcDoctrine("HISTORICAL", "country-a", 12);
    expect(second).toBe(first);
    expect(first).not.toBe("HISTORICAL");
  });
});
