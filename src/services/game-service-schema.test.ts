import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("game service karakter şeması", () => {
  it("aktif mareşal sorgusunda gerçek karakter durumu sütununu kullanır", () => {
    const source = readFileSync(new URL("./game-service.ts", import.meta.url), "utf8");
    expect(source).toContain("character.character_status='ACTIVE'");
    expect(source).not.toContain("character.status='ACTIVE'");
  });

  it("son yerleşke kaybında sahadaki ordu ve filo kayıtlarını topluca silmez",()=>{
    const source=readFileSync(new URL("./game-service.ts",import.meta.url),"utf8");
    expect(source).not.toContain('if (remainingSourceSettlements === 0) {\n        await client.query("DELETE FROM army_units');
    expect(source).toContain("if (remainingSourceSettlements > 0)");
    expect(source).toContain("startLastStand(client");
    expect(source).toContain("recoverLastStand(client");
  });

  it("barışla tam ilhak edilen devleti Son Direniş başlatmadan kapatabilir",()=>{
    const source=readFileSync(new URL("./game-service.ts",import.meta.url),"utf8");
    expect(source).toContain("eliminateOnLastSettlement?: boolean");
    expect(source).toContain("eliminateCountryByPeaceAnnexation(client,lastSettlementInput)");
    expect(source).toContain(":await startLastStand(client,lastSettlementInput)");
  });

  it("yükseltmedeki limanı dokuzuncu bina slotu için etkin sayar",()=>{
    const source=readFileSync(new URL("./game-service.ts",import.meta.url),"utf8");
    const portSlotQueries=source.match(/building_type='port' AND status IN \('ACTIVE','BUILDING'\) AND level>0/g)??[];
    expect(portSlotQueries.length).toBeGreaterThanOrEqual(2);
  });

  it("alım ödemelerini yerel hazineden atomik ve bakiyeyi doğrulayarak tahsil eder",()=>{
    const source=readFileSync(new URL("./game-service.ts",import.meta.url),"utf8");
    expect(source).toContain("WHERE id=$2 AND local_treasury>=$1");
    expect(source).toContain("Yerel hazine yetersiz. Gerekli:");
    expect(source.match(/await debitSettlementTreasury\(client,\s*settlement\.id,\s*cost\)/g)).toHaveLength(5);
    expect(source).not.toContain('if (settlement.local_treasury < cost) throw new GameError("Yerel hazinede yeterli altın yok.")');
  });

  it("yerleşkeye bağlı Gözcü Birliği alımını koordinatlı hareketten bağımsız tutar",()=>{
    const source=readFileSync(new URL("./game-service.ts",import.meta.url),"utf8");
    expect(source).toContain("async purchaseObserver");
    expect(source).toContain("unit_type='observer'");
    expect(source).toContain("OBSERVER_PURCHASE");
    expect(source).not.toContain("Gözcü Birliği ve koordinatlı hareket sistemi kullanımdan kaldırıldı.");
  });
});
