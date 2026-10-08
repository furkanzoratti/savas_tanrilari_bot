import {describe,expect,it} from "vitest";
import {
  birthAgeModifier,birthAttemptSucceeded,birthComplication,dynastyDeathFailureMaximum,
  dynastyDeathSaveFailed,dynastyMemberCanBeBirthParent,dynastyMemberCanMarry,newbornGender,
  orderedDynastyCoupleIds,automaticDynastyRelations,type DynastyKinshipMember
} from "./dynasty.js";

const relative=(id:string,gender:"MALE"|"FEMALE",overrides:Partial<DynastyKinshipMember>={}):DynastyKinshipMember=>({
  id,gender,relation:"Hanedan akrabası",is_monarch:false,spouse_id:null,mother_id:null,father_id:null,status:"ALIVE",...overrides
});

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

  it("hükümdara göre yakın ve geniş aile bağlarını otomatik tanır",()=>{
    const members=[
      relative("ruler","MALE",{is_monarch:true,spouse_id:"wife",mother_id:"mother",father_id:"father"}),
      relative("wife","FEMALE",{spouse_id:"ruler"}),
      relative("son","MALE",{mother_id:"wife",father_id:"ruler",spouse_id:"daughter-in-law"}),
      relative("daughter-in-law","FEMALE",{spouse_id:"son"}),
      relative("daughter","FEMALE",{mother_id:"wife",father_id:"ruler"}),
      relative("grandchild","FEMALE",{father_id:"son"}),
      relative("brother","MALE",{mother_id:"mother",father_id:"father"}),
      relative("sister","FEMALE",{mother_id:"mother",father_id:"father"}),
      relative("niece","FEMALE",{father_id:"brother"}),
      relative("father","MALE",{mother_id:"paternal-grandmother",father_id:"paternal-grandfather"}),
      relative("paternal-uncle","MALE",{mother_id:"paternal-grandmother",father_id:"paternal-grandfather"}),
      relative("paternal-aunt","FEMALE",{mother_id:"paternal-grandmother",father_id:"paternal-grandfather"}),
      relative("cousin","MALE",{father_id:"paternal-uncle"}),
      relative("mother","FEMALE",{mother_id:"maternal-grandmother",father_id:"maternal-grandfather"}),
      relative("maternal-uncle","MALE",{mother_id:"maternal-grandmother",father_id:"maternal-grandfather"}),
      relative("maternal-aunt","FEMALE",{mother_id:"maternal-grandmother",father_id:"maternal-grandfather"}),
      relative("paternal-grandmother","FEMALE"),relative("paternal-grandfather","MALE"),
      relative("maternal-grandmother","FEMALE"),relative("maternal-grandfather","MALE")
    ];
    const relations=Object.fromEntries(automaticDynastyRelations(members).map((member)=>[member.id,member.relation]));
    expect(relations).toMatchObject({
      ruler:"Hükümdar",wife:"Hükümdarın eşi",son:"Hükümdarın oğlu",daughter:"Hükümdarın kızı",
      "daughter-in-law":"Hükümdarın gelini",grandchild:"Hükümdarın torunu",
      brother:"Hükümdarın erkek kardeşi",sister:"Hükümdarın kız kardeşi",niece:"Hükümdarın yeğeni",
      "paternal-uncle":"Hükümdarın amcası","paternal-aunt":"Hükümdarın halası",
      "maternal-uncle":"Hükümdarın dayısı","maternal-aunt":"Hükümdarın teyzesi",cousin:"Hükümdarın kuzeni",
      "paternal-grandmother":"Hükümdarın babaannesi","maternal-grandmother":"Hükümdarın anneannesi"
    });
  });

  it("taht değişince ilişkileri yeni hükümdara göre yeniden yorumlar ve bilinmeyen bağı açıkça belirtir",()=>{
    const first=relative("first","MALE",{is_monarch:false,mother_id:"mother",father_id:"father"});
    const second=relative("second","FEMALE",{is_monarch:true,mother_id:"mother",father_id:"father"});
    const unknown=relative("unknown","MALE");
    const relations=Object.fromEntries(automaticDynastyRelations([first,second,unknown]).map((member)=>[member.id,member.relation]));
    expect(relations.first).toBe("Hükümdarın erkek kardeşi");
    expect(relations.second).toBe("Hükümdar");
    expect(relations.unknown).toBe("Soy bağı belirlenemedi");
  });

  it("uzayan hanedan dallarında büyük torun ve ikinci derece kuzeni hesaplar",()=>{
    const members=[
      relative("ruler","MALE",{is_monarch:true,father_id:"ruler-parent"}),
      relative("ruler-parent","MALE",{father_id:"ruler-grandparent"}),
      relative("ruler-grandparent","MALE",{father_id:"shared-ancestor"}),
      relative("shared-ancestor","MALE"),
      relative("cousin-grandparent","FEMALE",{father_id:"shared-ancestor"}),
      relative("cousin-parent","FEMALE",{mother_id:"cousin-grandparent"}),
      relative("second-cousin","FEMALE",{mother_id:"cousin-parent"}),
      relative("child","MALE",{father_id:"ruler"}),
      relative("grandchild","MALE",{father_id:"child"}),
      relative("great-grandchild","FEMALE",{father_id:"grandchild"})
    ];
    const relations=Object.fromEntries(automaticDynastyRelations(members).map((member)=>[member.id,member.relation]));
    expect(relations["great-grandchild"]).toBe("Hükümdarın büyük torunu");
    expect(relations["second-cousin"]).toBe("Hükümdarın 2. dereceden kuzeni");
  });
});
