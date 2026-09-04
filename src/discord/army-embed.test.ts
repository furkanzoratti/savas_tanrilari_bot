import { describe, expect, it } from "vitest";
import { assessArmyComposition } from "../domain/battle.js";
import type { ArmyView } from "../services/army-service.js";
import { renderArmyEmbed } from "./army-embed.js";

describe("ordu belgesi", () => {
  it("birlikleri, kompozisyonu ve kaynak yerleşkeleri birlikte gösterir", () => {
    const composition = { light_infantry: 1_000, spear: 500 };
    const army: ArmyView = {
      id: "army-1", guild_id: "guild-1", country_id: "country-1", country_name: "Roma", name: "I. Ordu",
      commander_character_id: "commander-1", commander_name: "Marcus", commander_skill_bonus: 1,
      created_turn: 3, active_battle_id: null, composition, total: 1_500,
      composition_active: true, composition_activation_turn: null,
      assessment: assessArmyComposition(composition),
      units: [
        { settlement_id: "rome", settlement_name: "Roma", unit_type: "light_infantry", quantity: 1_000 },
        { settlement_id: "neapolis", settlement_name: "Neapolis", unit_type: "spear", quantity: 500 }
      ]
    };
    const embed = renderArmyEmbed(army).toJSON();
    expect(embed.title).toContain("I. Ordu");
    expect(embed.description).toContain("Marcus");
    expect(embed.fields?.find((field) => field.name.includes("Kompozisyon"))?.value).toContain("Baskın birim oranı");
    expect(embed.fields?.find((field) => field.name.includes("Kaynak"))?.value).toContain("Roma");
    expect(embed.fields?.find((field) => field.name.includes("Kaynak"))?.value).toContain("Neapolis");
  });
});
