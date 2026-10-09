import {describe,expect,it} from "vitest";
import {DEFAULT_ROMAN_FAMILIES,DEFAULT_ROMAN_NPC_MEMBERS} from "./roman-family-seed.js";

describe("Roma başlangıç siyasi aileleri",()=>{
  it("12 aileyi toplam 100 Senato koltuğuyla kurar",()=>{
    expect(DEFAULT_ROMAN_FAMILIES).toHaveLength(12);
    expect(DEFAULT_ROMAN_FAMILIES.reduce((sum,family)=>sum+family.seats,0)).toBe(100);
    expect(DEFAULT_ROMAN_FAMILIES.find((family)=>family.name==="Scipio ailesi")?.seats).toBe(18);
    expect(DEFAULT_ROMAN_FAMILIES.find((family)=>family.name==="Magnus ailesi")?.seats).toBe(18);
  });

  it("sekiz NPC ailesinin her birine altışar üye verir",()=>{
    const counts=new Map<string,number>();
    for(const member of DEFAULT_ROMAN_NPC_MEMBERS)counts.set(member.familyName,(counts.get(member.familyName)??0)+1);
    expect(counts.size).toBe(8);
    expect([...counts.values()]).toEqual(Array(8).fill(6));
  });
});
