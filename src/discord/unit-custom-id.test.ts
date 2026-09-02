import { describe, expect, it } from "vitest";
import { decodeUnitTypeFromCustomId, encodeUnitTypeForCustomId } from "./unit-custom-id.js";

describe("asker alım modalı kimlikleri", () => {
  it("uzun Kartaca Savaş Fili anahtarını Discord sınırının altında tutar", () => {
    const encoded = encodeUnitTypeForCustomId("carthaginian_war_elephant");
    const customId = `um|${"c".repeat(36)}|${"s".repeat(36)}|${encoded}`;
    expect(encoded).toBe("cwe");
    expect(customId.length).toBeLessThanOrEqual(100);
    expect(decodeUnitTypeFromCustomId(encoded)).toBe("carthaginian_war_elephant");
  });

  it("eski kısa birim anahtarlarıyla açılmış formları da çözmeye devam eder", () => {
    expect(decodeUnitTypeFromCustomId("heavy_infantry")).toBe("heavy_infantry");
    expect(decodeUnitTypeFromCustomId("bilinmeyen_birim")).toBeNull();
  });
});
