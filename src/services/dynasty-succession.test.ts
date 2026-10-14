import {describe,expect,it} from "vitest";
import {fallbackDynastyCandidateSql,lineageAwareDynastyCandidateSql} from "./dynasty-succession.js";

describe("hanedan veraset sırası",()=>{
  it("önce hükümdarın erkek çocuklarını, sonra erkek kardeşlerini sıralar",()=>{
    const sonRule="candidate.gender='MALE' AND (candidate.father_id=ruler.id OR candidate.mother_id=ruler.id)";
    expect(lineageAwareDynastyCandidateSql).toContain(`WHEN ${sonRule} THEN 0`);
    expect(lineageAwareDynastyCandidateSql).toContain("candidate.father_id=ruler.father_id");
    expect(lineageAwareDynastyCandidateSql).toContain("candidate.mother_id=ruler.mother_id");
    expect(lineageAwareDynastyCandidateSql).toContain(") THEN 1");
    expect(lineageAwareDynastyCandidateSql).toContain("candidate.age END DESC NULLS LAST");
  });

  it("soy bağı bilinmeyen eski kayıtlarda mevcut sıra bilgisini güvenli yedek olarak kullanır",()=>{
    expect(fallbackDynastyCandidateSql).toContain("is_heir=TRUE OR succession_rank IS NOT NULL");
    expect(fallbackDynastyCandidateSql).toContain("CASE WHEN gender='MALE' THEN 0 ELSE 1 END");
  });
});
