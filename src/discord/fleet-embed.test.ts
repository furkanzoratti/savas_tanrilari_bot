import { describe,expect,it } from "vitest";
import { renderFleetEmbed } from "./fleet-embed.js";
import type { FleetView } from "../services/fleet-service.js";

describe("fleet embed",() => {
  it("shows ships, sources, crew and transport capacity without composition",() => {
    const fleet:FleetView = {
      id:"fleet",guild_id:"guild",country_id:"country",country_name:"Kartaca",name:"Batı Filosu",
      commander_character_id:null,commander_name:null,commander_skill_bonus:0,created_turn:10,
      ships:[
        { settlement_id:"a",settlement_name:"Kartaca",ship_type:"trireme",quantity:2 },
        { settlement_id:"b",settlement_name:"Ibossim",ship_type:"kerkouros",quantity:3 }
      ],
      composition:{ trireme:2,kerkouros:3 },totalShips:5,crew:350,transportCapacity:1600,
      transportMultiplier:1,active_battle_id:null
    };
    const embed = renderFleetEmbed(fleet).toJSON();
    expect(embed.title).toContain("Batı Filosu");
    expect(embed.fields?.find((field) => field.name.includes("Taşıma"))?.value).toContain("1.600");
    expect(embed.fields?.find((field) => field.name.includes("Mürettebat"))?.value).toContain("350");
    expect(embed.fields?.some((field) => field.name.includes("Kompozisyon"))).toBe(false);
  });
});
