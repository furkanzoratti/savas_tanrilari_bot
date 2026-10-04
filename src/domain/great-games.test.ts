import { describe, expect, it } from "vitest";
import {
  ACTIVE_GREAT_GAME_TYPES, AUCTION_BID_INCREMENT, AUCTION_OPENING_BID, AUCTION_REWARDS, DIPLOMACY_SCENARIOS, GREAT_GAMES_RACE_ROUNDS,
  GREAT_GAMES_TURN,
  allocatePool, auctionAvailableBid, auctionNextMinimum, caravanMultiplier, isValidAuctionBidAmount,
  gladiatorOdds, parseCaravanRoute, parseChariotTactic, parseKingsDecision, pickNonRepeatingValue,
  raceTrackPosition, resolveCaravanStage, resolveChariotRound,
  resolveDiplomacyGoalVote, resolveDiplomacyVote, resolveGladiatorFight, resolveKingsRound
} from "./great-games.js";

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("30. Tur Büyük Oyunları", () => {
  it("yeni sezonu yalnız seçilen dört etkin oyunla açar", () => {
    expect(GREAT_GAMES_TURN).toBe(30);
    expect(ACTIVE_GREAT_GAME_TYPES).toEqual(["AUCTION", "CHARIOT", "KINGS_BET", "GLADIATOR"]);
  });

  it("Capua oranlarını güce göre üretir ve dövüşü d20 + güç bonusuyla çözer", () => {
    expect(gladiatorOdds(80, 40)).toEqual({ a: 1.35, b: 2.7 });
    const result = resolveGladiatorFight(80, 40, sequence([0.4, 0.3]));
    expect(result.winner).toBe("A");
    expect(result.remainingHpA).toBe(35);
    expect(result.remainingHpB).toBe(0);
    expect(result.exchanges).toHaveLength(17);
    expect(result.exchanges[0]).toMatchObject({ attacker: "A", hit: true, damage: 4 });
    expect(result.exchanges[1]).toMatchObject({ attacker: "B", hit: false, damage: 0 });
  });
  it("müzayedede 1.000 Altından başlayan sınırsız 500'lük teklifleri doğrular", () => {
    expect(AUCTION_OPENING_BID).toBe(1_000);
    expect(AUCTION_BID_INCREMENT).toBe(500);
    expect(isValidAuctionBidAmount(1_000)).toBe(true);
    expect(isValidAuctionBidAmount(10_000)).toBe(true);
    expect(isValidAuctionBidAmount(1_250)).toBe(false);
    expect(isValidAuctionBidAmount(500)).toBe(false);
    expect(auctionNextMinimum(0)).toBe(1_000);
    expect(auctionNextMinimum(10_000)).toBe(10_500);
    expect(auctionAvailableBid(15_000, 0)).toBe(15_000);
    expect(auctionAvailableBid(15_000, 6_500)).toBe(8_500);
    expect(auctionAvailableBid(5_000, 7_000)).toBe(0);
  });

  it("müzayede kataloğunu sekiz güçlü ve doğrudan uygulanabilir etkiyle sınırlar", () => {
    expect(Object.keys(AUCTION_REWARDS)).toHaveLength(8);
    expect(new Set(Object.values(AUCTION_REWARDS)).size).toBe(8);
    expect(AUCTION_REWARDS.IMPERIAL_REVENUE).toContain("kalıcı +2.000 Altın");
    expect(AUCTION_REWARDS.GRAND_TRADE_CHARTER).toContain("kalıcı +2 ticaret hakkı");
    expect(AUCTION_REWARDS.ROYAL_FLEET_ORDER).toContain("4 gemiyi");
    expect(AUCTION_REWARDS.GRAND_SIEGE_TRAIN).toContain("4 kuşatma aletini");
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

  it("Diplomasi Masasında yalnız diğer devletlerin hedeflerine oy verilmesini sağlar", () => {
    const goals = [
      { key: "a:p", ownerCountryId: "a", tier: "PRIMARY" as const, text: "A ana" },
      { key: "a:s", ownerCountryId: "a", tier: "SECONDARY" as const, text: "A ikincil" },
      { key: "b:p", ownerCountryId: "b", tier: "PRIMARY" as const, text: "B ana" },
      { key: "b:s", ownerCountryId: "b", tier: "SECONDARY" as const, text: "B ikincil" },
      { key: "c:p", ownerCountryId: "c", tier: "PRIMARY" as const, text: "C ana" },
      { key: "c:s", ownerCountryId: "c", tier: "SECONDARY" as const, text: "C ikincil" }
    ];
    expect(resolveDiplomacyGoalVote(
      ["a", "b", "c"], goals,
      { a: "b:p", b: "a:p", c: "a:p" },
      { a: "c:s", b: "c:s", c: "b:s" }
    )).toEqual({
      primaryGoalKey: "a:p", secondaryGoalKey: "c:s",
      primaryWinnerId: "a", secondaryWinnerId: "c", influenceRolls: {}
    });
    expect(() => resolveDiplomacyGoalVote(
      ["a", "b", "c"], goals,
      { a: "a:p", b: "a:p", c: "b:p" },
      { a: "b:s", b: "c:s", c: "a:s" }
    )).toThrow("kendi diplomasi hedefine");
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
