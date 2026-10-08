import { describe, expect, it } from "vitest";
import { turnAnnouncement, turnAnnouncementCards, turnAnnouncementTextLength } from "./turn-announcements.js";

describe("ayrıntılı tur ilerletme kartı", () => {
  it("tamamlanan işleri yerleşke ve tür bazında madde madde gösterir", () => {
    const embed = turnAnnouncement({
      kind: "ADVANCE", turn: 12, acquisition: true,
      completedBuildings: 1, recruitmentArrivals: 2_000, completedShips: 2, garrisonUpgrades: 1,
      completedBuildingDetails: [{ settlementName: "Roma", buildingName: "Curia", level: 2 }],
      recruitmentArrivalDetails: [{ settlementName: "Capua", unitName: "Mızraklı Piyade", quantity: 2_000 }],
      completedShipDetails: [{ settlementName: "Neapolis", shipName: "Trireme", quantity: 2 }],
      garrisonUpgradeDetails: ["Roma"]
    }).toJSON();

    const fields = embed.fields ?? [];
    expect(fields.find((field) => field.name === "🏗️ Tamamlanan Binalar")?.value).toContain("Roma");
    expect(fields.find((field) => field.name === "⚔️ Orduya Katılan Birlikler")?.value).toContain("2.000 Mızraklı Piyade");
    expect(fields.find((field) => field.name === "🚢 Tamamlanan Gemiler")?.value).toContain("Neapolis");
  });

  it("yoğun tur özetini iki ayrı ve Discord sınırına uygun karta böler", () => {
    const rows = Array.from({ length: 40 }, (_, index) => index + 1);
    const cards = turnAnnouncementCards({
      kind: "ADVANCE",
      turn: 33,
      acquisition: true,
      completedBuildings: 40,
      recruitmentArrivals: 40_000,
      completedBuildingDetails: rows.map((index) => ({
        settlementName: `Yerleşke ${index}`,
        buildingName: "Curia",
        level: 3
      })),
      recruitmentArrivalDetails: rows.map((index) => ({
        settlementName: `Yerleşke ${index}`,
        unitName: "Ağır Piyade",
        quantity: 1_000
      })),
      garrisonUpgradeDetails: rows.map((index) => `Yerleşke ${index}`),
      garrisonReplenishmentCompletedDetails: rows.map((index) => ({
        settlementName: `Yerleşke ${index}`,
        personnel: 500
      })),
      garrisonReplenishmentStartedDetails: rows.map((index) => ({
        settlementName: `Yerleşke ${index}`,
        personnel: 500,
        cost: 850,
        completionTurn: 35,
        reason: "ROUTINE"
      })),
      christianSpreadDetails: rows.map((index) => ({
        targetCountryName: `Ülke ${index}`,
        targetSettlementName: `Yerleşke ${index}`,
        beforePercent: 10,
        afterPercent: 12,
        beforeCatholicPercent: 5,
        afterCatholicPercent: 7,
        conversionPercent: 2,
        completed: false
      })),
      incomePenaltyDetails: rows.map((index) => ({
        settlementName: `Yerleşke ${index}`,
        percent: 20,
        deductedAmount: 2_000,
        remainingAcquisitionTurns: 1,
        reason: "Savaş yorgunluğu"
      })),
      mercenaryUpkeepDetails: rows.map((index) => ({
        countryName: `Ülke ${index}`,
        companyName: "Hellas Gedik Birliği",
        amount: 1_900
      })),
      stability: {
        enabled: true,
        warExhaustion: rows.map((index) => ({
          countryName: `Ülke ${index}`,
          before: 10,
          after: 12,
          activeWars: 1,
          newBattleLosses: 1_000,
          raidsSuffered: 0,
          settlementsLost: 0
        })),
        settlements: rows.map((index) => ({
          countryName: `Ülke ${index}`,
          settlementName: `Yerleşke ${index}`,
          prosperityBefore: 50,
          prosperityAfter: 45,
          rebellionBefore: 20,
          rebellionAfter: 30,
          unrestRisk: 35,
          roll: 20,
          factionType: null,
          factionName: null,
          outbreak: false,
          rebelPersonnel: 0,
          rebelMilitaryPower: 0
        }))
      }
    });

    expect(cards).toHaveLength(2);
    expect(cards[0]?.toJSON().title).toContain("1/2");
    expect(cards[1]?.toJSON().title).toContain("2/2");
    expect(cards[0]?.toJSON().image?.url).toBeTruthy();
    expect(cards[1]?.toJSON().image).toBeUndefined();
    expect(cards.every((card) => turnAnnouncementTextLength(card) <= 5_800)).toBe(true);
    const fieldNames = cards.flatMap((card) => card.toJSON().fields?.map((field) => field.name) ?? []);
    expect(fieldNames).toEqual(expect.arrayContaining([
      "🏗️ Tamamlanan Binalar",
      "⚔️ Savaş Yorgunluğu",
      "🌿 Refah ve İsyan Gerilimi",
      "💰 Paralı Asker Bakımları"
    ]));
  });
});
