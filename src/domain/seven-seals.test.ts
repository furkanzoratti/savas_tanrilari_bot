import{describe,expect,it}from"vitest";
import{initialSevenSealsState,resolveSealRound,sevenSealsScore}from"./seven-seals.js";

describe("Yedi Mühür",()=>{
  it("başarılı mühür girişimini kaydeder",()=>{
    const result=resolveSealRound([initialSevenSealsState("a","Roma")],[{countryId:"a",action:"OPEN",seal:"SUN",targetCountryId:null}],()=>0.5);
    expect(result.players[0]?.opened).toEqual(["SUN"]);
    expect(result.publicLines[0]).toContain("Güneş Mührü");
  });
  it("başarısız girişimde yozlaşma kazandırır ve odağı tüketir",()=>{
    const player=initialSevenSealsState("a","Roma");player.focus=4;
    const result=resolveSealRound([player],[{countryId:"a",action:"OPEN",seal:"GATE",targetCountryId:null}],()=>0.1);
    expect(result.players[0]).toMatchObject({opened:[],focus:0,corruption:1});
  });
  it("laneti hedefin zorluğuna uygular ve saldıranın hakkını harcar",()=>{
    const result=resolveSealRound(
      [initialSevenSealsState("a","Roma"),initialSevenSealsState("b","Kartaca")],
      [{countryId:"a",action:"CURSE",seal:null,targetCountryId:"b"},{countryId:"b",action:"OPEN",seal:"SUN",targetCountryId:null}],
      ()=>0.5
    );
    expect(result.players.find((item)=>item.countryId==="a")?.curses).toBe(1);
    expect(result.players.find((item)=>item.countryId==="b")?.opened).toEqual([]);
    expect(result.privateResults.b).toContain("lanet zorluğu +4");
  });
  it("mühür puanlarını, set bonusunu ve yozlaşmayı hesaplar",()=>{
    const player=initialSevenSealsState("a","Roma");player.opened=["SUN","MOON","SWORD","CHALICE","CROWN"];player.corruption=2;player.bonusPoints=1;
    expect(sevenSealsScore(player)).toBe(13);
  });
});
