import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=readFileSync(new URL("./dynasty-service.ts",import.meta.url),"utf8");

describe("NPC hanedan evliliği güvenliği",()=>{
  it("bekleyen normal veya Roma evlilik teklifindeki üyeyi aday havuzuna almaz",()=>{
    expect(source).toContain("member.id IN (proposal.proposer_member_id,proposal.target_member_id)");
    expect(source).toContain("proposal.dynasty_member_id=member.id");
  });

  it("üyeleri kilitledikten sonra bekleyen teklif durumunu yeniden kontrol eder",()=>{
    expect(source).toContain("proposal.proposer_member_id=ANY($1::uuid[])");
    expect(source).toContain("proposal.target_member_id=ANY($1::uuid[])");
    expect(source).toContain("if(pending.rowCount)continue;");
  });
});
