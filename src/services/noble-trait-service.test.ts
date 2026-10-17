import {describe,expect,it,vi} from "vitest";

vi.hoisted(()=>{process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";});
import {activeMonarchTraitModifiers,activeRulingCoupleTraits} from "./noble-trait-service.js";

describe("hükümdar çifti trait etkileri",()=>{
  it("yalnız yaşayan hükümdar ile yaşayan eşinin traitlerini etkinleştirir",async()=>{
    let sql="";
    const client={query:async(statement:string)=>{
      sql=statement;
      return{rows:[{monarch_trait_key:"ADIL",spouse_trait_key:"HIRSLI"}],rowCount:1};
    }};
    const traits=await activeRulingCoupleTraits(client as never,"country");
    expect(traits.map((trait)=>trait.key)).toEqual(["ADIL","HIRSLI"]);
    expect(sql).toContain("monarch.is_monarch=TRUE");
    expect(sql).toContain("spouse.id=monarch.spouse_id AND spouse.status='ALIVE'");
  });

  it("hükümdar ve eş etkilerini ülke bonuslarında toplar",async()=>{
    const client={query:async()=>({
      rows:[{monarch_trait_key:"ADIL",spouse_trait_key:"HIRSLI"}],rowCount:1
    })};
    const modifiers=await activeMonarchTraitModifiers(client as never,"country");
    expect(modifiers.populationGrowthPercent).toBeCloseTo(.04);
    expect(modifiers.incomePercent).toBeCloseTo(.08);
    expect(modifiers.rebellionResistance).toBe(2);
  });

  it("eş yoksa yalnız mevcut hükümdarın traitini uygular",async()=>{
    const client={query:async()=>({
      rows:[{monarch_trait_key:"BILGE",spouse_trait_key:null}],rowCount:1
    })};
    const modifiers=await activeMonarchTraitModifiers(client as never,"country");
    expect(modifiers.characterCapacity).toBe(5);
    expect(modifiers.taskRollBonus).toEqual({DIPLOMAT:1,MISSIONARY:1});
  });
});
