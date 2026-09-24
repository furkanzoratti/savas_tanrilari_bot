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

  it("groups ships with the same health percentage and separates different health values",() => {
    const fleet:FleetView = {
      id:"fleet",guild_id:"guild",country_id:"country",country_name:"Roma",name:"Akdeniz Filosu",
      commander_character_id:null,commander_name:null,commander_skill_bonus:0,created_turn:10,
      ships:[{settlement_id:"a",settlement_name:"Roma",ship_type:"trireme",quantity:10}],
      composition:{trireme:10},totalShips:10,crew:1_000,transportCapacity:5_000,
      transportMultiplier:1,active_battle_id:null,
      damagedShips:[
        {settlement_id:"a",settlement_name:"Roma",ship_type:"trireme",quantity:2,current_hp:68,max_hp:75,disabled:0},
        {settlement_id:"b",settlement_name:"Neapolis",ship_type:"trireme",quantity:1,current_hp:68,max_hp:75,disabled:0},
        {settlement_id:"a",settlement_name:"Roma",ship_type:"trireme",quantity:1,current_hp:47,max_hp:75,disabled:0},
        {settlement_id:"a",settlement_name:"Roma",ship_type:"trireme",quantity:2,current_hp:45,max_hp:75,disabled:0}
      ]
    };
    const embed=renderFleetEmbed(fleet).toJSON();
    const ships=embed.fields?.find((field)=>field.name.includes("Can Durumu"))?.value??"";
    expect(ships).toContain("**4** Trireme — **%100**");
    expect(ships).toContain("**3** Trireme — **%90**");
    expect(ships).toContain("**1** Trireme — **%62**");
    expect(ships).toContain("**2** Trireme — **%60**");
    expect(embed.fields?.some((field)=>field.name.includes("Hasarlı Gemiler"))).toBe(false);
  });
});
