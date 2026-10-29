import { describe, expect, it } from "vitest";
import type { FleetPoolView } from "../services/fleet-service.js";
import { renderFleetPool } from "./fleet-pool-ui.js";

describe("gemi havuzu görünümü", () => {
  it("limanları ve genel toplamı gemi türü bazında gösterir", () => {
    const pool: FleetPoolView = {
      settlements: [{
        settlement_id: "liman-1",
        settlement_name: "Rodos",
        ships: [{ ship_type: "trireme", available: 5 }],
        total: 5
      }],
      totals: [{ ship_type: "trireme", available: 5 }],
      grandTotal: 5
    };

    const embeds = renderFleetPool("Akdeniz Ligi", pool).map((embed) => embed.toJSON());
    const text = embeds.map((embed) => embed.description ?? "").join("\n");
    expect(embeds[0]?.title).toContain("Gemi Havuzu");
    expect(text).toContain("Rodos");
    expect(text).toContain("Trireme");
    expect(text).toContain("**Genel havuz:** 5 gemi");
  });

  it("uzun liman listesini Discord sınırını aşmadan sayfalara böler", () => {
    const settlements = Array.from({ length: 90 }, (_, index) => ({
      settlement_id: `liman-${index}`,
      settlement_name: `Uzun Liman Adı ${index + 1}`,
      ships: [
        { ship_type: "trireme" as const, available: 5 },
        { ship_type: "quinquereme" as const, available: 3 }
      ],
      total: 8
    }));
    const pool: FleetPoolView = {
      settlements,
      totals: [
        { ship_type: "trireme", available: 450 },
        { ship_type: "quinquereme", available: 270 }
      ],
      grandTotal: 720
    };

    const embeds = renderFleetPool("Büyük Donanma", pool).map((embed) => embed.toJSON());
    expect(embeds.length).toBeGreaterThan(1);
    expect(embeds.every((embed) => (embed.description?.length ?? 0) <= 3_900)).toBe(true);
    const text = embeds.map((embed) => embed.description ?? "").join("\n");
    expect(text).toContain("Uzun Liman Adı 1");
    expect(text).toContain("Uzun Liman Adı 90");
  });
});
