import { describe,expect,it } from "vitest";
import type { CountryDocument } from "../services/game-service.js";
import { SETTLEMENTS_OVERVIEW_BANNER_URL } from "./assets.js";
import { renderSettlementsOverview } from "./settlements-overview.js";

function documentWithSettlements(count:number):CountryDocument {
  return {
    guild:{current_turn:30,turn_phase:"OPEN"},
    country:{name:"Roma",treasury:25_000,primary_culture_group:"ITALIC"},
    settlements:Array.from({length:count},(_,index)=>({
      name:`Yerleşke ${index+1}`,
      local_treasury:1_000+index,
      payableIncome:500,
      totalSettlementUpkeep:125,
      militaryUsed:250,
      militaryLimit:1_000,
      culture_group:index===0?"HELLENIC":"ITALIC",
      religionDistribution:[{
        religionKey:"HELLENIC_PANTHEON",religionLabel:"Helen Panteonu",
        secondaryKey:"OLYMPIAN",secondaryLabel:"Olimpos Geleneği",
        primaryPercent:80,secondaryPercent:20
      }],
      prosperity:72,
      rebellion_progress:18,
      rebellionRisk:7.5,
      rebellion_active:false,
      isBesieged:false,
      is_conquered:false,
      ruin_stage:0
    })),
    totalPayableIncome:5_000,totalUpkeep:1_250,netIncome:3_750,
    militaryUsed:2_500,militaryLimit:10_000,manpowerPenaltyActive:false
  } as unknown as CountryDocument;
}

describe("renderSettlementsOverview",()=>{
  it("yerleşkeleri altışarlı sayfalayıp görseli yalnız ilk sayfaya bağlar",()=>{
    const embeds=renderSettlementsOverview(documentWithSettlements(9));
    expect(embeds).toHaveLength(2);
    expect(embeds[0]!.toJSON().image?.url).toBe(SETTLEMENTS_OVERVIEW_BANNER_URL);
    expect(embeds[0]!.toJSON().fields).toHaveLength(6);
    expect(embeds[1]!.toJSON().image).toBeUndefined();
    expect(embeds[1]!.toJSON().fields).toHaveLength(3);
  });

  it("ekonomi, askerî kapasite, kültür, din, refah ve isyan bilgisini gösterir",()=>{
    const field=renderSettlementsOverview(documentWithSettlements(1))[0]!.toJSON().fields?.[0];
    expect(field?.value).toContain("Hazine");
    expect(field?.value).toContain("Yerel Askerî Kapasite");
    expect(field?.value).not.toContain("Devlet:");
    expect(field?.value).toContain("Yabancı");
    expect(field?.value).toContain("Helen Panteonu");
    expect(field?.value).toContain("Refah");
    expect(field?.value).toContain("Tur Riski");
    const lines=field?.value.split("\n")??[];
    expect(lines.find((line)=>line.includes("Kültür"))).not.toContain("Din");
    expect(lines.find((line)=>line.includes("Din ve Mezhep"))).not.toContain("Kültür");
  });
});
