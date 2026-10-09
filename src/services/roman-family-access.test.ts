import {describe,expect,it,vi} from "vitest";
import {romanFamilyAccess,romanFamilyMembership} from "./roman-family-access.js";

describe("Roma ailesi ortak erişim çözümü",()=>{
  it("normal devlet üyeliğine bakmadan Roma ailesini çözer",async()=>{
    const query=vi.fn().mockResolvedValue({rows:[{
      republic_id:"republic",country_id:"roma",country_name:"Roma",family_id:"nero",family_name:"Nero ailesi",is_leader:true
    }]});
    const result=await romanFamilyAccess({query} as never,"guild","nero-user");
    expect(result).toEqual({
      republicId:"republic",countryId:"roma",countryName:"Roma",familyId:"nero",familyName:"Nero ailesi",isLeader:true
    });
    expect(query.mock.calls[0]?.[0]).toContain("roman_family_players");
    expect(query.mock.calls[0]?.[0]).toContain("family.leader_user_id=$2");
  });

  it("eski leader_user_id kaydını üyelik satırı olmasa da lider sayar",async()=>{
    const query=vi.fn().mockResolvedValue({rows:[{family_id:"nero",is_leader:true}]});
    await expect(romanFamilyMembership({query} as never,"republic","nero-user"))
      .resolves.toEqual({familyId:"nero",isLeader:true});
    expect(query.mock.calls[0]?.[0]).toContain("COALESCE(player.is_leader,FALSE) OR family.leader_user_id=$2");
  });
});
