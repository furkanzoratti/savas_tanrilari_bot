import { describe, expect, it } from "vitest";
import type { ArmyPoolView } from "../services/army-service.js";
import { renderArmyPool } from "./army-pool-ui.js";

describe("asker havuzu formu", () => {
  it("yerleşkeleri ve birim bazlı genel toplamı tek formda gösterir", () => {
    const pool: ArmyPoolView = {
      settlements: [
        { settlement_id: "rome", settlement_name: "Roma", units: [{ unit_type: "light_infantry", available: 600 }], total: 600 },
        { settlement_id: "capua", settlement_name: "Capua", units: [], total: 0 }
      ],
      totals: [{ unit_type: "light_infantry", available: 600 }],
      grandTotal: 600
    };

    const embeds = renderArmyPool("Roma Cumhuriyeti", pool).map((embed) => embed.toJSON());

    expect(embeds).toHaveLength(1);
    expect(embeds[0]?.title).toContain("Roma Cumhuriyeti");
    expect(embeds[0]?.description).toContain("🏘️ Roma");
    expect(embeds[0]?.description).toContain("🏘️ Capua");
    expect(embeds[0]?.description).toContain("bulunmuyor");
    expect(embeds[0]?.description).toContain("📊 Genel Toplam");
    expect(embeds[0]?.description).toContain("Hafif Piyade");
  });

  it("karakter sınırı aşılırsa yerleşke bölümlerini sayfalara ayırır", () => {
    const pool: ArmyPoolView = {
      settlements: Array.from({ length: 40 }, (_, index) => ({
        settlement_id: `settlement-${index}`,
        settlement_name: `Uzun Yerleşke Adı ${index + 1}`,
        units: [
          { unit_type: "light_infantry", available: 1_000 + index },
          { unit_type: "heavy_infantry", available: 500 + index }
        ],
        total: 1_500 + (index * 2)
      })),
      totals: [
        { unit_type: "light_infantry", available: 40_780 },
        { unit_type: "heavy_infantry", available: 20_780 }
      ],
      grandTotal: 61_560
    };

    const embeds = renderArmyPool("Büyük Devlet", pool).map((embed) => embed.toJSON());

    expect(embeds.length).toBeGreaterThan(1);
    expect(embeds.every((embed) => (embed.description?.length ?? 0) <= 3_900)).toBe(true);
    expect(embeds[0]?.title).toContain("Sayfa 1/");
    expect(embeds.at(-1)?.description).toContain("📊 Genel Toplam");
  });
});
