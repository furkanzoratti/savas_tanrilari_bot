import{describe,expect,it}from"vitest";
import{
  courtObjectiveCompleted,initialCourtInfluence,resolveCourtRound,
  type CourtPlayerState,type CourtRoundAction
}from"./court-intrigue.js";

function player(id:string,name:string,objective:CourtPlayerState["objective"]="PRESTIGE"):CourtPlayerState{
  return{
    countryId:id,countryName:name,influence:initialCourtInfluence(),prestige:0,intrigue:3,protection:2,
    supportCount:0,successfulIntrigues:0,objective,lastIntel:null
  };
}

describe("Saray Entrikası raund çözümü",()=>{
  it("saray olayının doğrudan nüfuz bonusunu ve tek lider prestijini uygular",()=>{
    const result=resolveCourtRound(
      [player("a","Roma"),player("b","Kartaca"),player("c","Persis"),player("d","Trakya")],
      [{countryId:"a",action:"INFLUENCE",area:"THRONE",targetCountryId:null}],
      "ROYAL_AUDIENCE",[],()=>0.5
    );
    const rome=result.players.find((item)=>item.countryId==="a")!;
    expect(rome.influence.THRONE).toBe(4);
    expect(rome.prestige).toBe(1);
    expect(result.publicLines).toContain("👑 Taht: Roma tek başına önde ve +1 prestij kazandı.");
    expect(result.publicLines.find((line)=>line.startsWith("⚔️"))).toContain("prestij kazandırmadı");
  });

  it("korumayı harcayıp ilk düşmanca hamleyi engeller",()=>{
    const actions:CourtRoundAction[]=[
      {countryId:"b",action:"PROTECT",area:null,targetCountryId:null},
      {countryId:"a",action:"UNDERMINE",area:"GUARD",targetCountryId:"b"}
    ];
    const result=resolveCourtRound([player("a","Roma"),player("b","Kartaca")],actions,"GUARD_INSPECTION",[],()=>0.99);
    const attacker=result.players.find((item)=>item.countryId==="a")!;
    const defender=result.players.find((item)=>item.countryId==="b")!;
    expect(attacker.intrigue).toBe(2);
    expect(defender.protection).toBe(1);
    expect(defender.influence.GUARD).toBe(1);
    expect(result.privateResults.a).toContain("koruması girişimini engelledi");
    expect(result.privateResults.b).toContain("koruman tarafından engellendi");
  });

  it("düşmanca hamlede saray anlaşmasını bozar ve saldıranı cezalandırır",()=>{
    const a=player("a","Roma");a.prestige=4;
    const result=resolveCourtRound(
      [a,player("b","Kartaca")],
      [{countryId:"a",action:"SPY",area:null,targetCountryId:"b"}],
      "MASKED_BALL",[{leftCountryId:"a",rightCountryId:"b"}],()=>0.5
    );
    expect(result.brokenPairs).toEqual([["a","b"]]);
    expect(result.players.find((item)=>item.countryId==="a")?.prestige).toBe(2);
    expect(result.publicLines[0]).toContain("anlaşmasını bozdu");
  });

  it("başarılı casuslukta hedefin gizli hamlesini yalnız saldırana verir",()=>{
    const result=resolveCourtRound(
      [player("a","Roma"),player("b","Kartaca")],
      [
        {countryId:"a",action:"SPY",area:null,targetCountryId:"b"},
        {countryId:"b",action:"INFLUENCE",area:"MERCHANTS",targetCountryId:null}
      ],
      "MASKED_BALL",[],()=>0.5
    );
    expect(result.privateResults.a).toContain("Nüfuz Kur");
    expect(result.privateResults.a).toContain("Tüccarlar");
    expect(result.players.find((item)=>item.countryId==="a")?.successfulIntrigues).toBe(1);
    expect(result.publicLines.some((line)=>line.includes("Roma tarafından"))).toBe(false);
  });

  it("gizli amaçların alan, denge, diplomasi ve gölge koşullarını doğrular",()=>{
    const throne=player("a","Roma","THRONE_DOMINANCE");throne.influence.THRONE=5;
    const balanced=player("b","Kartaca","BALANCED_COURT");balanced.influence={THRONE:3,GUARD:3,CLERGY:3,MERCHANTS:3};
    const diplomat=player("c","Persis","DIPLOMAT");diplomat.supportCount=3;
    const shadow=player("d","Trakya","SHADOW_MASTER");shadow.successfulIntrigues=2;
    const all=[throne,balanced,diplomat,shadow];
    expect(courtObjectiveCompleted(throne,all)).toBe(true);
    expect(courtObjectiveCompleted(balanced,all)).toBe(true);
    expect(courtObjectiveCompleted(diplomat,all)).toBe(true);
    expect(courtObjectiveCompleted(shadow,all)).toBe(true);
  });
});
