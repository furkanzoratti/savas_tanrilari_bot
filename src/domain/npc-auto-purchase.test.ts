import { describe, expect, it } from "vitest";
import { npcBuildingLimit, npcDevelopmentOnly, npcPrioritizesShips, npcRecruitsUnits } from "./npc-auto-purchase.js";

describe("NPC otomatik alım modelleri", () => {
  it("Full Bina + Asker iki bina ve asker alımına izin verir", () => {
    expect(npcBuildingLimit("FULL_BUILDING_ARMY")).toBe(2);
    expect(npcRecruitsUnits("FULL_BUILDING_ARMY")).toBe(true);
    expect(npcDevelopmentOnly("FULL_BUILDING_ARMY")).toBe(false);
  });

  it("Sadece Asker bina almaz", () => {
    expect(npcBuildingLimit("ARMY_ONLY")).toBe(0);
    expect(npcRecruitsUnits("ARMY_ONLY")).toBe(true);
  });

  it("Gelişim asker almaz ve yalnız geliştirme modundadır", () => {
    expect(npcRecruitsUnits("DEVELOPMENT")).toBe(false);
    expect(npcDevelopmentOnly("DEVELOPMENT")).toBe(true);
  });

  it("Gemi Odaklı önce deniz üretimini dener ve kara askeri yedeğini açık tutar", () => {
    expect(npcPrioritizesShips("NAVAL_FOCUS")).toBe(true);
    expect(npcRecruitsUnits("NAVAL_FOCUS")).toBe(true);
    expect(npcBuildingLimit("NAVAL_FOCUS")).toBe(0);
  });
});
