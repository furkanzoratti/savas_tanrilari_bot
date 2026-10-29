import{describe,expect,it}from"vitest";
import{constructionScore,initialConstructionState,resolveConstructionRound}from"./great-construction.js";

describe("Büyük İnşa Yarışı",()=>{
  it("düzenli inşayı ve açık gökyüzü bonusunu uygular",()=>{
    const player=initialConstructionState("a","Roma");
    const result=resolveConstructionRound([player],[{countryId:"a",stage:"FOUNDATION",method:"STEADY"}],"CLEAR_SKIES",()=>0.5);
    expect(result.players[0]).toMatchObject({foundation:4,material:2,inspiration:2,quality:0});
    expect(result.publicLines[0]).toContain("+4");
  });
  it("hızlandırılmış inşada malzeme harcar ve başarı zarını işler",()=>{
    const result=resolveConstructionRound([initialConstructionState("a","Roma")],[{countryId:"a",stage:"FOUNDATION",method:"RUSH"}],"ABUNDANT_STONE",()=>0.5);
    expect(result.players[0]).toMatchObject({foundation:6,material:1});
    expect(result.privateResults.a).toContain("d20: 11");
  });
  it("usta işçiliğinde ilham, ilerleme ve kaliteyi birlikte uygular",()=>{
    const result=resolveConstructionRound([initialConstructionState("a","Roma")],[{countryId:"a",stage:"FOUNDATION",method:"MASTERWORK"}],"MASTER_GUILD",()=>0.5);
    expect(result.players[0]).toMatchObject({foundation:4,inspiration:1,quality:2});
  });
  it("tamamlanan aşamalar ile kaliteyi final puanına katar",()=>{
    const player={...initialConstructionState("a","Roma"),foundation:8,structure:7,splendor:5,quality:3};
    expect(constructionScore(player)).toBe(41);
  });
});
