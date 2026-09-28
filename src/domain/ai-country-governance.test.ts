import { describe, expect, it } from "vitest";
import { aiCountryTurnPlanSchema, aiGovernanceTestModeSchema, aiPlanReviewSchema, aiTurnPlanJsonSchema, validateAiPlanReferences, type AiCountryObservation } from "./ai-country-governance.js";

const observation: AiCountryObservation = {
  rulesVersion: 2, turn: 26, phase: "OPEN",
  country: { id: "country-1", name: "Atina", treasury: 1000, mobilization: "PEACE", activeFormable: null, freePopulation: 10_000, militaryUsed: 2_000, militaryLimit: 5_000, grossIncome: 500, payableIncome: 450, totalUpkeep: 100, netIncome: 350 },
  settlements: [], armies: [], fleets: [], characters: [], diplomacy: {}, publicCountries: [], visibleBattles: [], intelligenceReports: [],
  decisionSupport: {}, strategicMap: {},
  referenceCatalog: { countryIds: ["country-1", "country-2"], settlementIds: ["settlement-1"], publicSettlementIds: ["settlement-1", "settlement-2"], armyIds: ["army-1"], fleetIds: [], characterIds: ["character-1"], battleIds: ["battle-1"] }
};

const validPlan = {
  summary: "Savunmayı koru.", strategicAssessment: [], risks: [], nextTurnGoals: [],
  budgetPlan: { startingTreasury: 1000, reserveAmount: 250, plannedSpending: 0, estimatedTreasuryAfter: 1000, reasoning: "Rezerv korunuyor." },
  constructionPlan: [], recruitmentPlan: [], shipbuildingPlan: [], movementPlan: [], warPlans: [],
  orders: [{ category: "MILITARY", kind: "DEFEND", sourceRef: "army-1", targetRef: "settlement-1", amount: null, priority: 4, condition: null, reason: "Başkent savunması" }],
  battlePolicies: [{ battleId: "battle-1", posture: "CAUTIOUS", retreatRule: "Ağır kayıpta çekil.", preferredNavalOrder: null, reason: "Kuvveti koru" }]
};

describe("AI devlet planı", () => {
  it("katı ve sınırlı karar şemasını kabul eder", () => {
    expect(aiCountryTurnPlanSchema.parse(validPlan).orders[0]?.kind).toBe("DEFEND");
    expect(aiTurnPlanJsonSchema.additionalProperties).toBe(false);
  });

  it("ülkenin göremediği kimlikleri reddeder", () => {
    const plan = aiCountryTurnPlanSchema.parse({ ...validPlan, orders: [{ ...validPlan.orders[0], targetRef: "secret-army" }] });
    expect(validateAiPlanReferences(plan, observation)).toEqual(["Emir 1: bilinmeyen hedef kaydı secret-army."]);
  });

  it("görünür karakteri görevlendirme önerisinde kullanabilir", () => {
    const plan = aiCountryTurnPlanSchema.parse({ ...validPlan, orders: [{ ...validPlan.orders[0], category: "CHARACTER", kind: "ASSIGN_CHARACTER", sourceRef: "character-1" }] });
    expect(validateAiPlanReferences(plan, observation)).toEqual([]);
  });

  it("insan incelemesini yalnız uygun veya ret kararıyla sınırlar", () => {
    expect(aiPlanReviewSchema.parse({ decision: "APPROVE", note: "Manuel uygulanabilir." }).decision).toBe("APPROVE");
    expect(() => aiPlanReviewSchema.parse({ decision: "EXECUTE", note: "" })).toThrow();
  });

  it("test modu ayarını yalnız aç veya kapat değeriyle kabul eder", () => {
    expect(aiGovernanceTestModeSchema.parse({ enabled: true })).toEqual({ enabled: true });
    expect(() => aiGovernanceTestModeSchema.parse({ enabled: true, automaticExecution: true })).toThrow();
  });
});
