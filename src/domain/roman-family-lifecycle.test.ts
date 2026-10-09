import {describe,expect,it} from "vitest";
import {availableRomanFamilyChildName,planRomanNpcMarriages,romanFamilyUsesAutomaticPregnancy} from "./roman-family-lifecycle.js";

describe("Roma ailesi çocuk adları",()=>{
  it("erkek çocuğa ailenin nomen ve cognomenini verir",()=>{
    expect(availableRomanFamilyChildName("Magnus ailesi","MALE",new Set(),()=>0)).toBe("Gaius Cornelius Magnus");
  });

  it("aynı adı yeniden kullanmaz",()=>{
    const used=new Set(["claudia prima nero"]);
    expect(availableRomanFamilyChildName("Nero ailesi","FEMALE",used,()=>0)).toBe("Claudia Secunda Nero");
  });

  it("otomatik gebeliği yalnızca oyuncusuz ailelerde çalıştırır",()=>{
    expect(romanFamilyUsesAutomaticPregnancy(0)).toBe(true);
    expect(romanFamilyUsesAutomaticPregnancy(1)).toBe(false);
    expect(romanFamilyUsesAutomaticPregnancy(3)).toBe(false);
  });

  it("oyuncusuz aile adaylarını farklı ailelerden ve aile başına en fazla bir evlilik olacak şekilde eşleştirir",()=>{
    const matches=planRomanNpcMarriages([
      {id:"m1",familyId:"f1",gender:"MALE",age:24,position:"CHILD",birthFamilyId:"f1",motherId:null,fatherId:null},
      {id:"m2",familyId:"f1",gender:"MALE",age:28,position:"OTHER",birthFamilyId:"f1",motherId:null,fatherId:null},
      {id:"w1",familyId:"f2",gender:"FEMALE",age:23,position:"CHILD",birthFamilyId:"f2",motherId:null,fatherId:null},
      {id:"w2",familyId:"f3",gender:"FEMALE",age:27,position:"CHILD",birthFamilyId:"f3",motherId:null,fatherId:null}
    ],()=>0);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({manFamilyId:"f1",womanFamilyId:"f2"});
  });

  it("yakın akrabayı, kadın aile yöneticisini ve aşırı yaş farkını eşleştirmez",()=>{
    const matches=planRomanNpcMarriages([
      {id:"m1",familyId:"f1",gender:"MALE",age:20,position:"CHILD",birthFamilyId:"birth-a",motherId:"p1",fatherId:"p2"},
      {id:"w-related",familyId:"f2",gender:"FEMALE",age:20,position:"CHILD",birthFamilyId:"birth-a",motherId:null,fatherId:null},
      {id:"w-head",familyId:"f3",gender:"FEMALE",age:20,position:"HEAD",birthFamilyId:"f3",motherId:null,fatherId:null},
      {id:"w-old",familyId:"f4",gender:"FEMALE",age:50,position:"OTHER",birthFamilyId:"f4",motherId:null,fatherId:null}
    ],()=>0);
    expect(matches).toEqual([]);
  });
});
