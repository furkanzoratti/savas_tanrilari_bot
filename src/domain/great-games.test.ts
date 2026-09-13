import { describe, expect, it } from "vitest";
import {
  AUCTION_BID_INCREMENT, AUCTION_OPENING_BID, DIPLOMACY_SCENARIOS, GREAT_GAMES_RACE_ROUNDS,
  allocatePool, auctionNextMinimum, caravanMultiplier, isValidAuctionBidAmount,
  parseCaravanRoute, parseChariotTactic, parseKingsDecision, pickNonRepeatingValue,
  raceTrackPosition, resolveCaravanStage, resolveChariotRound,
  resolveDiplomacyVote, resolveKingsRound
} from "./great-games.js";

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("15. Tur Büyük Oyunları", () => {
  it("müzayedede 500 Altından başlayan sınırsız 250'lik teklifleri doğrular", () => {
    expect(AUCTION_OPENING_BID).toBe(500);
    expect(AUCTION_BID_INCREMENT).toBe(250);
    expect(isValidAuctionBidAmount(500)).toBe(true);
    expect(isValidAuctionBidAmount(10_000)).toBe(true);
    expect(isValidAuctionBidAmount(625)).toBe(false);
    expect(isValidAuctionBidAmount(250)).toBe(false);
    expect(auctionNextMinimum(0)).toBe(500);
    expect(auctionNextMinimum(10_000)).toBe(10_250);
  });

  it("Savaş Arabaları taktiklerini kaza, sıkıştırma ve temkin bonusuyla çözer", () => {
    const result = resolveChariotRound([
      { countryId: "a", tactic: "AGGRESSIVE" },
      { countryId: "b", tactic: "CAUTIOUS" },
      { countryId: "c", tactic: "SQUEEZE", targetCountryId: "b" }
    ], sequence([0.10, 0.45, 0.70, 0.50]));
    expect(result).toEqual([
      { countryId: "a", tactic: "AGGRESSIVE", naturalRoll: 3, penaltyRoll: 0, crashed: true, score: 0 },
      { countryId: "b", tactic: "CAUTIOUS", naturalRoll: 10, penaltyRoll: 3, crashed: false, score: 10 },
      { countryId: "c", tactic: "SQUEEZE", naturalRoll: 15, penaltyRoll: 0, crashed: false, score: 16 }
    ]);
  });

  it("Kralların Bahsinde tahmin, blöf ve ihaneti birlikte puanlar", () => {
    expect(resolveKingsRound(
      { decision: "BETRAY", prediction: "COOPERATE" },
      { decision: "COOPERATE", prediction: "COOPERATE" }
    )).toEqual({ left: 5, right: 0 });
  });

  it("Kervan aşamasında uzmanı ve Finansör tekrarını uygular", () => {
    const result = resolveCaravanStage({
      route: "DANGEROUS", roles: ["MERCHANT", "FINANCIER"], financierUsed: false, useFinancier: true
    }, sequence([0, 0.1, 0.1, 0.9, 0.9]));
    expect(result.challenge).toBe("TRADE");
    expect(result.bonus).toBe(3);
    expect(result.rerollDice).toEqual([10, 10]);
    expect(result.success).toBe(true);
    expect(result.scoreDelta).toBe(3);
    expect(result.financierUsed).toBe(true);
  });

  it("Kervan katsayılarını ve sıfır toplamlı havuz dağıtımını korur", () => {
    expect([2, 4, 6, 8, 10, 12].map(caravanMultiplier)).toEqual([0.6, 0.9, 1.15, 1.35, 1.55, 1.8]);
    expect(allocatePool(12_000, [8_100, 5_400])).toEqual([7_200, 4_800]);
    expect(allocatePool(10, [1, 1, 1]).reduce((sum, value) => sum + value, 0)).toBe(10);
  });

  it("Diplomasi kriz havuzunu genişletir ve yakın geçmişteki krizi tekrarlamaz", () => {
    expect(DIPLOMACY_SCENARIOS).toHaveLength(8);
    expect(new Set(DIPLOMACY_SCENARIOS.map((scenario) => scenario.key)).size).toBe(8);
    expect(pickNonRepeatingValue(["A", "B", "C", "D"], ["A", "B"], ["C"], () => 0)).toBe("D");
    expect(pickNonRepeatingValue(["A", "B"], ["A", "B"], [], () => 0)).toBe("A");
    expect(pickNonRepeatingValue(["A", "B"], ["A"], ["B"], () => 0)).toBe("B");
  });

  it("Diplomasi Masasında yalnız bir ana ve en fazla bir ikincil kazanan çıkarır", () => {
    expect(resolveDiplomacyVote(
      ["a", "b", "c"],
      { a: "a", b: "a", c: "c" },
      { a: "b", b: "b", c: "c" }
    )).toEqual({ primaryWinnerId: "a", secondaryWinnerId: "b", influenceRolls: {} });
  });

  it("üçlü ana hedef eşitliğini 1d20 nüfuz zarıyla bozar", () => {
    const result = resolveDiplomacyVote(
      ["a", "b", "c"],
      { a: "a", b: "b", c: "c" },
      { a: null, b: null, c: null },
      sequence([0.2, 0.8, 0.4])
    );
    expect(result.primaryWinnerId).toBe("b");
    expect(result.influenceRolls).toEqual({ a: 5, b: 17, c: 9 });
    expect(result.secondaryWinnerId).toBeNull();
  });

  it("yarışları altı aşama ve 50 kademeli pistle çalıştırır", () => {
    expect(GREAT_GAMES_RACE_ROUNDS).toBe(6);
    expect(raceTrackPosition(0, 100)).toBe(0);
    expect(raceTrackPosition(2, 100)).toBe(1);
    expect(raceTrackPosition(100, 100)).toBe(50);
    expect(raceTrackPosition(140, 100)).toBe(50);
  });

  it("araba taktikleriyle kervan rotalarını Türkçe ve eski İngilizce değerlerle okuyabilir", () => {
    expect(parseChariotTactic("Saldırgan")).toBe("AGGRESSIVE");
    expect(parseChariotTactic("Rakibi Sıkıştır")).toBe("SQUEEZE");
    expect(parseChariotTactic("balanced")).toBe("BALANCED");
    expect(parseCaravanRoute("Güvenli")).toBe("SAFE");
    expect(parseCaravanRoute("Tehlikeli Yol")).toBe("DANGEROUS");
    expect(parseCaravanRoute("balanced")).toBe("BALANCED");
    expect(parseCaravanRoute("bilinmeyen")).toBeNull();
  });

  it("Kralların Bahsi kararlarını Türkçe ve eski İngilizce değerlerle okuyabilir", () => {
    expect(parseKingsDecision("İşbirliği")).toBe("COOPERATE");
    expect(parseKingsDecision("iş birliği")).toBe("COOPERATE");
    expect(parseKingsDecision("İhanet")).toBe("BETRAY");
    expect(parseKingsDecision("betrayal")).toBe("BETRAY");
    expect(parseKingsDecision("bilinmeyen")).toBeNull();
  });
});
