import { describe, expect, it } from "vitest";
import { turnAnnouncement } from "./turn-announcements.js";

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
});
