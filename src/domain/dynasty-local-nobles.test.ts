import {describe,expect,it} from "vitest";
import {localNobleMarriageCandidates} from "./dynasty-local-nobles.js";

const base={dynastyId:"dynasty",memberId:"member",memberAge:30,currentTurn:48,usedNames:[] as string[]};

describe("yerel soylu evlilik adayları",()=>{
  it("erkek üye için aynı kültürden kadın adayları yaşlarıyla üretir",()=>{
    const candidates=localNobleMarriageCandidates({...base,memberGender:"MALE",cultureGroup:"PUNIC"});
    expect(candidates).toHaveLength(6);
    expect(candidates.every((candidate)=>candidate.gender==="FEMALE"&&candidate.title==="Soylu Hanım")).toBe(true);
    expect(candidates.every((candidate)=>candidate.cultureLabel==="Punik"&&candidate.age>=16)).toBe(true);
    expect(candidates.map((candidate)=>candidate.name)).toEqual(expect.arrayContaining(["Sophonisba","Elissa"]));
  });

  it("kadın üye için erkek aday üretir ve kullanılan adı tekrarlamaz",()=>{
    const candidates=localNobleMarriageCandidates({...base,memberGender:"FEMALE",cultureGroup:"ITALIC",usedNames:["Lucius"]});
    expect(candidates.every((candidate)=>candidate.gender==="MALE"&&candidate.title==="Soylu Bey")).toBe(true);
    expect(new Set(candidates.map((candidate)=>candidate.name)).size).toBe(candidates.length);
    expect(candidates).not.toContainEqual(expect.objectContaining({name:"Lucius"}));
  });

  it("aynı turda aynı üye için kararlı anahtarlar üretir",()=>{
    const first=localNobleMarriageCandidates({...base,memberGender:"MALE",cultureGroup:"GAUT_SUIONIC"});
    const second=localNobleMarriageCandidates({...base,memberGender:"MALE",cultureGroup:"GAUT_SUIONIC"});
    expect(second).toEqual(first);
  });
});
