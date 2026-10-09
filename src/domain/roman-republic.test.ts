import {describe,expect,it} from "vitest";
import {
  ROMAN_BUSINESSES,romanBusinessChoices,romanElectionBallotWeight,romanGovernorTreasuryShare
  ,ROMAN_OFFICES,ROMAN_SENATE_PROPOSALS,romanNpcDecisionScore,romanNpcVote
  ,redistributeRomanSenateSeats
} from "./roman-republic.js";

describe("Roma Cumhuriyeti işletme dengesi",()=>{
  it("her işletmeyi pozitif maliyet, gelir, nüfuz ve sınırla tanımlar",()=>{
    for(const business of Object.values(ROMAN_BUSINESSES)){
      expect(business.purchaseCost).toBeGreaterThan(0);
      expect(business.turnIncome).toBeGreaterThan(0);
      expect(business.turnIncome).toBeLessThan(business.purchaseCost);
      expect(business.influenceOnPurchase).toBeGreaterThan(0);
      expect(business.familyLimit).toBeGreaterThan(0);
    }
  });

  it("Discord kataloğunda bütün işletmeleri tekil sunar",()=>{
    const choices=romanBusinessChoices();
    expect(choices).toHaveLength(Object.keys(ROMAN_BUSINESSES).length);
    expect(new Set(choices.map((choice)=>choice.value)).size).toBe(choices.length);
  });

  it("Senato oyunu koltuk ve en fazla 10 nüfuz desteğiyle ağırlıklandırır",()=>{
    expect(romanElectionBallotWeight(18,6)).toBe(24);
    expect(romanElectionBallotWeight(0,0)).toBe(1);
    expect(romanElectionBallotWeight(12,99)).toBe(22);
  });

  it("valilik payını yalnız pozitif net gelirin yüzde beşi olarak hesaplar",()=>{
    expect(romanGovernorTreasuryShare(12_345)).toBe(617);
    expect(romanGovernorTreasuryShare(0)).toBe(0);
    expect(romanGovernorTreasuryShare(-5_000)).toBe(0);
  });

  it("NPC Senato kararında ilişki, hizip, itibar ve skandalı birlikte değerlendirir",()=>{
    const ally=romanNpcDecisionScore({seed:"same-seed",bloc:"POPULARES",category:"POPULAR",relationScore:60,trust:80,rivalry:0,
      proposerReputation:80,proposerScandal:0,selfTarget:false});
    const rival=romanNpcDecisionScore({seed:"same-seed",bloc:"OPTIMATES",category:"POPULAR",relationScore:-60,trust:20,rivalry:70,
      proposerReputation:20,proposerScandal:80,selfTarget:false});
    expect(ally).toBeGreaterThan(rival);
    expect(romanNpcVote(ally)).toBe("YES");
    expect(romanNpcVote(rival)).toBe("NO");
  });

  it("Senato yasaları ve Cursus Honorum makamları dengeli süre ve maliyet taşır",()=>{
    expect(Object.keys(ROMAN_SENATE_PROPOSALS)).toHaveLength(5);
    expect(ROMAN_SENATE_PROPOSALS.EMERGENCY_POWERS.threshold).toBe(67);
    expect(ROMAN_OFFICES.CENSOR.prerequisite).toBe("PRAETOR");
    expect(ROMAN_OFFICES.PRAETOR.prerequisite).toBe("QUAESTOR");
  });

  it("dönem performansını 100 koltuğa, 3–35 aile sınırını koruyarak dağıtır",()=>{
    const families=[
      {id:"winner",name:"Kazanan",currentSeats:18,performanceScore:4,reputation:80,scandal:0},
      {id:"steady",name:"Dengeli",currentSeats:12,performanceScore:0,reputation:50,scandal:0},
      {id:"loser",name:"Kaybeden",currentSeats:70,performanceScore:-4,reputation:20,scandal:80}
    ];
    const result=redistributeRomanSenateSeats(families,100,3,80);
    expect(result.reduce((sum,family)=>sum+family.newSeats,0)).toBe(100);
    expect(result.find((family)=>family.id==="winner")!.seatDelta).toBeGreaterThan(0);
    expect(result.find((family)=>family.id==="loser")!.seatDelta).toBeLessThan(0);
  });

  it("koltuk tabanına düşen aileden daha fazla koltuk almaz",()=>{
    const families=[
      {id:"a",name:"A",currentSeats:3,performanceScore:-10,reputation:0,scandal:100},
      {id:"b",name:"B",currentSeats:97,performanceScore:10,reputation:100,scandal:0}
    ];
    const result=redistributeRomanSenateSeats(families,100,3,97);
    expect(result.find((family)=>family.id==="a")!.newSeats).toBe(3);
    expect(result.find((family)=>family.id==="b")!.newSeats).toBe(97);
  });
});
