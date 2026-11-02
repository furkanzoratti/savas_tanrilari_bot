import { describe, expect, it } from "vitest";
import { compactUuid, expandUuid } from "./document-component-id.js";
import { matchesDocumentView } from "./document-view.js";

describe("yerleşke belge görünümleri", () => {
  it("Discord bileşenlerinde UUID kimliklerini güvenle kısaltır", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const compact = compactUuid(uuid);
    expect(compact.length).toBeLessThan(uuid.length);
    expect(expandUuid(compact)).toBe(uuid);
  });

  it("genel bakışı din ve nüfus özetine indirger", () => {
    expect(matchesDocumentView("⛩️ Din ve Mezhep", "general")).toBe(true);
    expect(matchesDocumentView("👥 Nüfus", "general")).toBe(true);
    expect(matchesDocumentView("🎖️ Ordu Limiti", "general")).toBe(false);
    expect(matchesDocumentView("🏋️ Eğitim Kapasitesi", "general")).toBe(false);
  });

  it("askerî görünümde inanç yerine kapasite alanlarını gösterir", () => {
    expect(matchesDocumentView("⛩️ Din ve Mezhep", "military")).toBe(false);
    expect(matchesDocumentView("🎖️ Ordu Limiti", "military")).toBe(true);
    expect(matchesDocumentView("🏋️ Eğitim Kapasitesi", "military")).toBe(true);
    expect(matchesDocumentView("⚓ Rıhtım Kapasitesi", "military")).toBe(true);
  });
});
