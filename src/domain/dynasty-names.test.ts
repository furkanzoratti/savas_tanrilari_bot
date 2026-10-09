import {describe,expect,it} from "vitest";
import {availableCulturalDynastyName,culturalDynastyNameCandidates} from "./dynasty-names.js";

describe("kültürel NPC hanedan adları",()=>{
  it("kültür ve cinsiyete göre aday havuzu verir",()=>{
    expect(culturalDynastyNameCandidates("PUNIC","MALE")).toContain("Hanno");
    expect(culturalDynastyNameCandidates("ITALIC","FEMALE")).toContain("Julia");
  });

  it("hanedanda kullanılan adı tekrar etmez",()=>{
    expect(availableCulturalDynastyName("PUNIC","MALE",["Hanno"],()=>0)).toBe("Mago");
  });

  it("havuz dolduğunda numaralı ve benzersiz bir ad üretir",()=>{
    const pool=culturalDynastyNameCandidates("ITALIC","MALE");
    expect(availableCulturalDynastyName("ITALIC","MALE",[...pool,"Lucius 2"],()=>0)).toBe("Lucius 3");
  });
});
