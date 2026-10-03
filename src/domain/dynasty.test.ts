import {describe,expect,it} from "vitest";
import {
  birthAgeModifier,birthAttemptSucceeded,birthComplication,dynastyDeathFailureMaximum,
  dynastyDeathSaveFailed,dynastyMemberCanBeBirthParent,dynastyMemberCanMarry,newbornGender,
  orderedDynastyCoupleIds
} from "./dynasty.js";

describe("dynasty rules",()=>{
  it("uses the agreed age bands for automatic death saves",()=>{
    expect([60,61,65,70,75,80].map(dynastyDeathFailureMaximum)).toEqual([0,1,2,4,7,10]);
    expect(dynastyDeathSaveFailed(70,4)).toBe(true);
    expect(dynastyDeathSaveFailed(70,5)).toBe(false);
  });

  it("requires a living member aged 16 or older without a spouse for marriage",()=>{
    expect(dynastyMemberCanMarry(16,"ALIVE",null)).toBe(true);
    expect(dynastyMemberCanMarry(15,"ALIVE",null)).toBe(false);
    expect(dynastyMemberCanMarry(null,"ALIVE",null)).toBe(false);
    expect(dynastyMemberCanMarry(30,"DEAD",null)).toBe(false);
    expect(dynastyMemberCanMarry(30,"ALIVE","spouse")).toBe(false);
  });

  it("lets the house leader roll only for the ruler or a living married direct child",()=>{
    const base={monarchId:"ruler",status:"ALIVE" as const,spouseId:"spouse",motherId:null,fatherId:null};
    expect(dynastyMemberCanBeBirthParent({...base,memberId:"ruler"})).toBe(true);
    expect(dynastyMemberCanBeBirthParent({...base,memberId:"child",fatherId:"ruler"})).toBe(true);
    expect(dynastyMemberCanBeBirthParent({...base,memberId:"grandchild",fatherId:"child"})).toBe(false);
    expect(dynastyMemberCanBeBirthParent({...base,memberId:"child",fatherId:"ruler",spouseId:null})).toBe(false);
    expect(dynastyMemberCanBeBirthParent({...base,memberId:"child",fatherId:"ruler",status:"DEAD"})).toBe(false);
  });

  it("stores a married couple under the same key regardless of selected parent",()=>{
    expect(orderedDynastyCoupleIds("b-member","a-member")).toEqual(["a-member","b-member"]);
    expect(orderedDynastyCoupleIds("a-member","b-member")).toEqual(["a-member","b-member"]);
  });

  it("applies fertility modifiers and the 11 point success threshold",()=>{
    expect([17,18,30,35,40,45].map(birthAgeModifier)).toEqual([null,3,1,-2,-5,null]);
    expect(birthAttemptSucceeded(29,8)).toBe(true);
    expect(birthAttemptSucceeded(40,15)).toBe(false);
    expect(birthAttemptSucceeded(40,16)).toBe(true);
  });

  it("resolves newborn gender and maternal complications",()=>{
    expect(newbornGender(1)).toBe("MALE");
    expect(newbornGender(2)).toBe("FEMALE");
    expect([1,2,4,5,20].map(birthComplication)).toEqual(["DEATH","ILLNESS","ILLNESS","HEALTHY","HEALTHY"]);
  });
});
