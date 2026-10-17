import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const service=readFileSync(new URL("./roman-republic-service.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../discord/roman-republic-ui.ts",import.meta.url),"utf8");

describe("Roma konsül adaylığı aile çözümleme",()=>{
  it("yöneticinin seçtiği yaşayan üyenin gerçek ailesini kullanır",()=>{
    expect(service).toContain("const familyId=input.gameMaster?selectedMember.family_id:memberFamilyId");
    expect(service).toContain("member.id::text=$2");
    expect(ui).toContain('value:action==="aday-ol"?member.id:member.name');
  });

  it("aynı adayın yinelenen isteğini ikinci kez ücretlendirmez",()=>{
    expect(service).toContain("alreadyNominated:true");
    expect(service).toContain("influenceSpent:0");
    expect(ui).toContain("yeniden nüfuz harcanmadı");
  });
});
