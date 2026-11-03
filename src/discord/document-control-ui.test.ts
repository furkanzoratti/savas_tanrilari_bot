import { describe, expect, it } from "vitest";
import { compactUuid, expandUuid } from "./document-component-id.js";
import { matchesDocumentView, orderDocumentViewFields } from "./document-view.js";

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
    expect(orderDocumentViewFields([
      { name: "⛩️ Din ve Mezhep" },
      { name: "🏦 Yerel Hazine" },
      { name: "👥 Nüfus" },
      { name: "🌿 Refah ve İstikrar" },
      { name: "🏺 Kültür" }
    ], "general").map((field) => field.name)).toEqual([
      "🏺 Kültür",
      "👥 Nüfus",
      "🌿 Refah ve İstikrar",
      "⛩️ Din ve Mezhep",
      "🏦 Yerel Hazine"
    ]);
  });

  it("askerî görünümde inanç yerine kapasite alanlarını gösterir", () => {
    expect(matchesDocumentView("⛩️ Din ve Mezhep", "military")).toBe(false);
    expect(matchesDocumentView("🎖️ Ordu Limiti", "military")).toBe(true);
    expect(matchesDocumentView("🏋️ Eğitim Kapasitesi", "military")).toBe(true);
    expect(matchesDocumentView("⏳ Eğitimdeki Birlikler", "military")).toBe(true);
    expect(matchesDocumentView("⚓ İnşadaki Gemiler", "military")).toBe(true);
    expect(matchesDocumentView("🛠️ Üretimdeki Kuşatma Aletleri", "military")).toBe(true);
    expect(matchesDocumentView("🛡️ Hazırlanan Garnizon", "military")).toBe(true);
    expect(matchesDocumentView("⚓ Rıhtım Kapasitesi", "military")).toBe(true);
  });
});
