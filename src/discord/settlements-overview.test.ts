import { describe,expect,it } from "vitest";
import type { CountryDocument } from "../services/game-service.js";
import { SETTLEMENTS_OVERVIEW_BANNER_URL } from "./assets.js";
import { renderSettlementsOverview } from "./settlements-overview.js";

function documentWithSettlements(count:number):CountryDocument {
  return {
    guild:{current_turn:30,turn_phase:"OPEN"},
    country:{name:"Roma",treasury:25_000,primary_culture_group:"ITALIC"},
    settlements:Array.from({length:count},(_,index)=>({
      id:`settlement-${index+1}`,
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
    expect(embeds[0]!.toJSON().description?.match(/^### 🏛️/gm)).toHaveLength(6);
    expect(embeds[1]!.toJSON().image).toBeUndefined();
    expect(embeds[1]!.toJSON().description?.match(/^### 🏛️/gm)).toHaveLength(3);
  });

  it("ekonomi, askerî kapasite, kültür, din, refah ve isyan bilgisini gösterir",()=>{
    const description=renderSettlementsOverview(documentWithSettlements(1))[0]!.toJSON().description??"";
    expect(description).toContain("### 🏛️ Yerleşke 1");
    expect(description).toContain("Hazine");
    expect(description).toContain("Yerel Askerî Kapasite");
    expect(description).not.toContain("Devlet:");
    expect(description).toContain("Yabancı");
    expect(description).toContain("Helen Panteonu");
    expect(description).toContain("Refah");
    expect(description).toContain("Tur Riski");
    const lines=description.split("\n");
    expect(lines.find((line)=>line.includes("Kültür"))).not.toContain("Din");
    expect(lines.find((line)=>line.includes("Din ve Mezhep"))).not.toContain("Kültür");
  });

  it("Han belgesinde devlet toplamlarını koruyup yalnız doğrudan Han topraklarını ayrıntılandırır",()=>{
    const embeds=renderSettlementsOverview(documentWithSettlements(6),{
      visibleSettlementIds:["settlement-1","settlement-2"],roleLabel:"Han Belgesi"
    });
    const description=embeds[0]!.toJSON().description??"";
    expect(embeds[0]!.toJSON().title).toContain("Han Belgesi");
    expect(description).toContain("Devlet Yerleşkeleri:** 6");
    expect(description).toContain("Ayrıntılı Erişim:** 2");
    expect(description).toContain("Dönem Geliri:** 5.000 Altın");
    expect(description).toContain("Yerleşke 1");
    expect(description).toContain("Yerleşke 2");
    expect(description).not.toContain("Yerleşke 3");
    expect(description).toContain("4 yerleşke");
  });
});
