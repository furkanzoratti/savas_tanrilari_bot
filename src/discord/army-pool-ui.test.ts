import { describe, expect, it } from "vitest";
import type { ArmyPoolView } from "../services/army-service.js";
import { renderArmyPool } from "./army-pool-ui.js";

describe("asker havuzu formu", () => {
  it("yerleşkeleri ve en sonda birim bazlı genel toplamı gösterir", () => {
    const pool: ArmyPoolView = {
      settlements: [
        { settlement_id: "rome", settlement_name: "Roma", units: [{ unit_type: "light_infantry", available: 600 }], total: 600 },
        { settlement_id: "capua", settlement_name: "Capua", units: [], total: 0 }
      ],
      totals: [{ unit_type: "light_infantry", available: 600 }],
      grandTotal: 600
    };

    const embeds = renderArmyPool("Roma Cumhuriyeti", pool).map((embed) => embed.toJSON());

    expect(embeds[0]?.title).toContain("Roma Cumhuriyeti");
    expect(embeds.find((embed) => embed.title?.includes("Roma"))?.description).toContain("600");
    expect(embeds.find((embed) => embed.title?.includes("Capua"))?.description).toContain("bulunmuyor");
    expect(embeds.at(-1)?.title).toContain("Genel Toplam");
    expect(embeds.at(-1)?.description).toContain("Hafif Piyade");
  });
});
