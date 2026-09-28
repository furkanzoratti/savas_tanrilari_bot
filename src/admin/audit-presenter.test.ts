import { describe, expect, it } from "vitest";
import { auditActionLabel, auditDetailsSummary, collectAuditUuids } from "./audit-presenter.js";

describe("GM panel audit presenter", () => {
  it("eylem kodlarını anlaşılır Türkçe başlıklara çevirir", () => {
    expect(auditActionLabel("admin.panel.character.assignment.cancel")).toBe("Karakter görevi iptal edildi");
    expect(auditActionLabel("battle.army.add")).toBe("Savaşa ordu eklendi");
  });

  it("iç içe ayrıntılardaki kimlikleri adlarla özetler", () => {
    const countryId = "27e33c63-32b7-4adc-9917-bd75d2a949ba";
    const settlementId = "aa61a9d6-f85a-4e79-b7f0-a244a82276e1";
    const details = { countryId, targetSettlementId: settlementId, quantity: 1200 };
    expect([...collectAuditUuids(details)]).toEqual([countryId, settlementId]);
    expect(auditDetailsSummary(details, new Map([
      [countryId, "Pontus"],
      [settlementId, "Sinop (Pontus)"]
    ]))).toBe("Devlet: Pontus • Hedef yerleşke: Sinop (Pontus) • Yeni mevcut: 1.200");
  });

  it("güncelleme kayıtlarında yalnız değişen alanları gösterir ve UUID sızdırmaz", () => {
    const unresolvedId = "3fa55bd2-561b-4693-bac4-da7bb35e3665";
    const summary = auditDetailsSummary({
      previous: { id: unresolvedId, name: "Eski ad", treasury: 1000, country_id: unresolvedId },
      updated: { id: unresolvedId, name: "Yeni ad", treasury: 1500, country_id: unresolvedId }
    }, new Map());
    expect(summary).toBe("Ad: Eski ad → Yeni ad • Hazine: 1.000 → 1.500");
    expect(summary).not.toContain(unresolvedId);
  });
});
