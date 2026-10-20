import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {fallbackDynastyCandidateSql,lineageAwareDynastyCandidateSql,recomputeLineageAwareSuccessionRanksSql} from "./dynasty-succession.js";

const dynastyServiceSource=readFileSync(new URL("./dynasty-service.ts",import.meta.url),"utf8");
const adminServiceSource=readFileSync(new URL("../admin/service.ts",import.meta.url),"utf8");
const romanMarriageSource=readFileSync(new URL("./roman-dynasty-marriage-service.ts",import.meta.url),"utf8");

describe("hanedan veraset sırası",()=>{
  it("önce hükümdarın erkek çocuklarını, sonra erkek kardeşlerini sıralar",()=>{
    const sonRule="candidate.gender='MALE' AND (candidate.father_id=ruler.id OR candidate.mother_id=ruler.id)";
    expect(lineageAwareDynastyCandidateSql).toContain(`WHEN ${sonRule} THEN 0`);
    expect(lineageAwareDynastyCandidateSql).toContain("candidate.father_id=ruler.father_id");
    expect(lineageAwareDynastyCandidateSql).toContain("candidate.mother_id=ruler.mother_id");
    expect(lineageAwareDynastyCandidateSql).toContain(") THEN 1");
    expect(lineageAwareDynastyCandidateSql).toContain("candidate.age END DESC NULLS LAST");
    expect(recomputeLineageAwareSuccessionRanksSql).toContain("ROW_NUMBER() OVER (ORDER BY");
    expect(recomputeLineageAwareSuccessionRanksSql).toContain(`WHEN ${sonRule} THEN 0`);
    expect(recomputeLineageAwareSuccessionRanksSql).toContain(") THEN 1");
  });

  it("soy bağı bilinmeyen eski kayıtlarda mevcut sıra bilgisini güvenli yedek olarak kullanır",()=>{
    expect(fallbackDynastyCandidateSql).toContain("is_heir=TRUE OR succession_rank IS NOT NULL");
    expect(fallbackDynastyCandidateSql).toContain("CASE WHEN gender='MALE' THEN 0 ELSE 1 END");
  });

  it("yeni erkek çocuk doğduğunda mevcut varisi benzersiz indeksle çakışmadan değiştirir",()=>{
    for(const source of [dynastyServiceSource,adminServiceSource]){
      expect(source).toContain('"dynasty-succession:"');
      expect(source).toContain("SET is_heir=FALSE,updated_at=NOW() WHERE dynasty_id=$1 AND is_heir=TRUE");
      expect(source).toContain("SET is_heir=TRUE,updated_at=NOW() WHERE dynasty_id=$1 AND id=$2 AND status='ALIVE'");
      expect(source).not.toContain("SET is_heir=(id=$2)");
    }
  });

  it("Roma ailesiyle evlilikten hanedana doğan çocuktan sonra da veraseti yeniden hesaplar",()=>{
    expect(romanMarriageSource).toContain("await reconcileSuccession(client,session.dynasty_id,session.game_turn,session.dynasty_country_name,[])");
    expect(romanMarriageSource).toContain('await killDynastyMemberFromEspionage(client,mother.id,turn,"Doğum komplikasyonu")');
  });
});
