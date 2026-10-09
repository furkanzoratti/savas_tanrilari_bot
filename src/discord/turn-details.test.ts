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

  it("yoğun tur özetini gerektiği kadar Discord kartına kayıpsız böler", () => {
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

    expect(cards.length).toBeGreaterThan(2);
    expect(cards[0]?.toJSON().title).toContain(`1/${cards.length}`);
    expect(cards.at(-1)?.toJSON().title).toContain(`${cards.length}/${cards.length}`);
    expect(cards[0]?.toJSON().image?.url).toBeTruthy();
    expect(cards.slice(1).every((card)=>card.toJSON().image===undefined)).toBe(true);
    expect(cards.every((card) => turnAnnouncementTextLength(card) <= 5_800)).toBe(true);
    expect(cards.every((card)=>(card.toJSON().fields?.length??0)<=25)).toBe(true);
    expect(cards.flatMap((card)=>card.toJSON().fields??[]).every((field)=>field.value.length<=1_024)).toBe(true);
    const fieldNames = cards.flatMap((card) => card.toJSON().fields?.map((field) => field.name) ?? []);
    expect(fieldNames).toEqual(expect.arrayContaining([
      "🏗️ Tamamlanan Binalar",
      "⚔️ Savaş Yorgunluğu",
      "🌿 Refah ve İsyan Gerilimi",
      "💰 Paralı Asker Bakımları"
    ]));
    const completeText=cards.flatMap((card)=>card.toJSON().fields?.map((field)=>field.value)??[]).join("\n");
    expect(completeText).toContain("Yerleşke 40");
    expect(completeText).not.toContain("Liste kısaltıldı");
  });

  it("tek bir uzun bölümün bütün satırlarını devam alanlarına taşır",()=>{
    const buildings=Array.from({length:180},(_,index)=>({
      settlementName:`Kesintisiz Yerleşke ${index+1}`,buildingName:`Yapı ${index+1}`,level:3
    }));
    const cards=turnAnnouncementCards({kind:"ADVANCE",turn:44,completedBuildings:buildings.length,completedBuildingDetails:buildings});
    const fields=cards.flatMap((card)=>card.toJSON().fields??[]);
    const report=fields.map((field)=>field.value).join("\n");
    expect(report).toContain("Kesintisiz Yerleşke 1");
    expect(report).toContain("Kesintisiz Yerleşke 180");
    expect(report.match(/Kesintisiz Yerleşke/g)).toHaveLength(180);
    expect(fields.filter((field)=>field.name.startsWith("🏗️ Tamamlanan Binalar")).length).toBeGreaterThan(1);
    expect(report).not.toContain("Liste kısaltıldı");
  });

  it("ekonomi, hareket ve karakter otomasyonu sonuçlarını aynı rapor zincirine alır",()=>{
    const cards=turnAnnouncementCards({
      kind:"ADVANCE",turn:45,acquisition:true,
      countryEconomyDetails:[{countryName:"Roma",buildingIncome:4_000,taxIncome:3_000,landTradeIncome:2_000,
        seaTradeIncome:1_000,upkeep:2_500,net:7_500,populationGain:420,settlementCount:4}],
      movement:{enabled:true,stage:"ADVANCE",turn:45,processed:8,advanced:6,completed:2,blocked:1,ongoing:5,
        ownershipUpdates:1,alreadyProcessed:false,reconChecks:2,encounters:1,
        muster:{processed:2,advanced:1,joined:1,blocked:0,waiting:0},disembarkations:{processed:1,completed:1,blocked:0}},
      characterAutomation:{espionageResolved:2,espionagePublished:2,characterEvents:3,characterPublished:3,
        dynastyProcessed:12,dynastyEvents:4,dynastyDeathChecks:2,dynastyDeathLogsPublished:2,
        dynastyNpcBirths:1,dynastyNpcMarriages:1,warnings:["Örnek uyarı"]}
    });
    const report=cards.flatMap((card)=>card.toJSON().fields??[]).map((field)=>`${field.name}\n${field.value}`).join("\n");
    expect(report).toContain("💰 Ülke Ekonomi Dökümü");
    expect(report).toContain("Net +7.500 Altın");
    expect(report).toContain("🗺️ Hareket Çözümlemesi");
    expect(report).toContain("🧭 Karakter ve Hanedan Otomasyonu");
    expect(report).toContain("Örnek uyarı");
  });
});
