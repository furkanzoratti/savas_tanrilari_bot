import { z } from "zod";

export const AI_COUNTRY_DOCTRINES = {
  BALANCED: { label: "Dengeli", description: "Ekonomi, diplomasi ve askerî güvenliği birlikte gözetir." },
  EXPANSIONIST: { label: "Yayılmacı", description: "Fırsat gördüğünde toprak kazanımını ve baskıyı öne alır." },
  DEFENSIVE: { label: "Savunmacı", description: "Yerleşkeleri, ikmali ve uzun vadeli dayanıklılığı korur." },
  MERCANTILE: { label: "Ticaret Odaklı", description: "Gelir, ticaret ağları ve diplomatik istikrarı öne alır." },
  NAVAL: { label: "Deniz Odaklı", description: "Filo, liman, abluka ve deniz ticaretine öncelik verir." }
} as const;

export type AiCountryDoctrine = keyof typeof AI_COUNTRY_DOCTRINES;

export const AI_ORDER_KINDS = [
  "HOLD_RESERVE", "CONSTRUCT", "RECRUIT", "BUILD_SHIP", "TRANSFER_TREASURY", "HIRE_MERCENARY", "REPAIR_FLEET",
  "MOVE_ARMY", "MOVE_FLEET", "DEFEND", "REINFORCE", "BESIEGE", "BLOCKADE", "RAID", "DISEMBARK",
  "ASSIGN_CHARACTER", "PROPOSE_TRADE", "PROPOSE_ALLIANCE", "PROPOSE_PACT", "PROPOSE_PEACE", "DECLARE_WAR",
  "NO_ACTION"
] as const;

export const aiCountryProfileSchema = z.object({
  enabled: z.boolean(),
  doctrine: z.enum(Object.keys(AI_COUNTRY_DOCTRINES) as [AiCountryDoctrine, ...AiCountryDoctrine[]]),
  aggression: z.coerce.number().int().min(0).max(100),
  riskTolerance: z.coerce.number().int().min(0).max(100),
  reservePercent: z.coerce.number().int().min(0).max(100),
  strategicGoals: z.string().trim().max(2_000),
  customInstructions: z.string().trim().max(4_000)
});

export type AiCountryProfileInput = z.infer<typeof aiCountryProfileSchema>;

export const aiGovernanceTestModeSchema = z.object({
  enabled: z.boolean()
}).strict();

export type AiGovernanceTestModeInput = z.infer<typeof aiGovernanceTestModeSchema>;

export const aiPlanReviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(2_000)
});

export type AiPlanReviewInput = z.infer<typeof aiPlanReviewSchema>;

const aiOrderSchema = z.object({
  category: z.enum(["ECONOMY", "MILITARY", "NAVAL", "DIPLOMACY", "CHARACTER"]),
  kind: z.enum(AI_ORDER_KINDS),
  sourceRef: z.string().nullable(),
  targetRef: z.string().nullable(),
  amount: z.number().int().min(0).nullable(),
  priority: z.number().int().min(1).max(5),
  condition: z.string().max(500).nullable(),
  reason: z.string().min(1).max(800)
});

const battlePolicySchema = z.object({
  battleId: z.string(),
  posture: z.enum(["AGGRESSIVE", "BALANCED", "CAUTIOUS", "WITHDRAW"]),
  retreatRule: z.string().min(1).max(500),
  preferredNavalOrder: z.enum(["BALANCED", "RAM", "DEFENSIVE", "FLANK", "RETREAT", "CONTROLLED_RETREAT"]).nullable(),
  reason: z.string().min(1).max(800)
});

const budgetPlanSchema = z.object({
  startingTreasury: z.number().int().min(0),
  reserveAmount: z.number().int().min(0),
  plannedSpending: z.number().int().min(0),
  estimatedTreasuryAfter: z.number().int(),
  reasoning: z.string().min(1).max(800)
});

const constructionActionSchema = z.object({
  settlementRef: z.string(),
  buildingType: z.string().min(1),
  buildingName: z.string().min(1),
  targetLevel: z.number().int().min(1).max(3),
  estimatedCost: z.number().int().min(0),
  durationTurns: z.number().int().min(1),
  priority: z.number().int().min(1).max(5),
  reason: z.string().min(1).max(800)
});

const recruitmentActionSchema = z.object({
  settlementRef: z.string(),
  unitType: z.string().min(1),
  unitName: z.string().min(1),
  quantity: z.number().int().min(100),
  estimatedCost: z.number().int().min(0),
  addedUpkeep: z.number().int().min(0),
  priority: z.number().int().min(1).max(5),
  reason: z.string().min(1).max(800)
});

const shipbuildingActionSchema = z.object({
  settlementRef: z.string(),
  shipType: z.enum(["kerkouros", "trireme", "quinquereme"]),
  shipName: z.string().min(1),
  quantity: z.number().int().min(1),
  estimatedCost: z.number().int().min(0),
  addedUpkeep: z.number().int().min(0),
  completionTurns: z.number().int().min(1),
  priority: z.number().int().min(1).max(5),
  reason: z.string().min(1).max(800)
});

const movementActionSchema = z.object({
  formationKind: z.enum(["ARMY", "FLEET"]),
  formationRef: z.string(),
  startHex: z.string(),
  destinationHex: z.string(),
  targetSettlementRef: z.string().nullable(),
  route: z.array(z.string()).max(160),
  purpose: z.enum(["DEFEND", "REINFORCE", "ASSEMBLE", "ATTACK", "SIEGE", "BLOCKADE", "RAID", "RETREAT", "PATROL"]),
  priority: z.number().int().min(1).max(5),
  reason: z.string().min(1).max(800)
});

const warPlanSchema = z.object({
  opponentCountryRef: z.string(),
  objective: z.string().min(1).max(800),
  posture: z.enum(["OFFENSIVE", "DEFENSIVE", "LIMITED", "AVOID"]),
  assemblyHex: z.string().nullable(),
  committedArmyRefs: z.array(z.string()).max(20),
  committedFleetRefs: z.array(z.string()).max(20),
  phases: z.array(z.string().min(1).max(500)).min(1).max(8),
  attackCondition: z.string().min(1).max(500),
  abortCondition: z.string().min(1).max(500),
  reason: z.string().min(1).max(800)
});

export const aiCountryTurnPlanSchema = z.object({
  summary: z.string().min(1).max(1_500),
  strategicAssessment: z.array(z.string().min(1).max(600)).max(12),
  budgetPlan: budgetPlanSchema,
  constructionPlan: z.array(constructionActionSchema).max(12),
  recruitmentPlan: z.array(recruitmentActionSchema).max(30),
  shipbuildingPlan: z.array(shipbuildingActionSchema).max(20),
  movementPlan: z.array(movementActionSchema).max(30),
  warPlans: z.array(warPlanSchema).max(12),
  orders: z.array(aiOrderSchema).max(30),
  battlePolicies: z.array(battlePolicySchema).max(20),
  risks: z.array(z.string().min(1).max(600)).max(12),
  nextTurnGoals: z.array(z.string().min(1).max(600)).max(10)
});

export type AiCountryTurnPlan = z.infer<typeof aiCountryTurnPlanSchema>;

export interface AiCountryObservation {
  rulesVersion: 2;
  turn: number;
  phase: string;
  country: {
    id: string;
    name: string;
    treasury: number;
    mobilization: string;
    activeFormable: string | null;
    freePopulation: number;
    militaryUsed: number;
    militaryLimit: number;
    grossIncome: number;
    payableIncome: number;
    totalUpkeep: number;
    netIncome: number;
  };
  settlements: unknown[];
  armies: unknown[];
  fleets: unknown[];
  characters: unknown[];
  diplomacy: unknown;
  publicCountries: Array<{ id: string; name: string }>;
  visibleBattles: unknown[];
  intelligenceReports: unknown[];
  decisionSupport: unknown;
  strategicMap: unknown;
  referenceCatalog: {
    countryIds: string[];
    settlementIds: string[];
    publicSettlementIds: string[];
    armyIds: string[];
    fleetIds: string[];
    characterIds: string[];
    battleIds: string[];
  };
}

const forbiddenObservationKeys = new Set([
  "playerIds", "discord_user_id", "actor_user_id", "secret_payload", "natural_roll",
  "created_by", "updated_by", "admin_notes", "gm_notes"
]);

export function assertCountryScopedObservation(value: unknown, path = "observation"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCountryScopedObservation(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenObservationKeys.has(key)) throw new Error(`AI görünür veri sınırı ihlali: ${path}.${key}`);
    assertCountryScopedObservation(item, `${path}.${key}`);
  }
}

export const aiTurnPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strategicAssessment", "budgetPlan", "constructionPlan", "recruitmentPlan", "shipbuildingPlan", "movementPlan", "warPlans", "orders", "battlePolicies", "risks", "nextTurnGoals"],
  properties: {
    summary: { type: "string" },
    strategicAssessment: { type: "array", items: { type: "string" } },
    budgetPlan: {
      type: "object", additionalProperties: false,
      required: ["startingTreasury", "reserveAmount", "plannedSpending", "estimatedTreasuryAfter", "reasoning"],
      properties: {
        startingTreasury: { type: "integer", minimum: 0 }, reserveAmount: { type: "integer", minimum: 0 },
        plannedSpending: { type: "integer", minimum: 0 }, estimatedTreasuryAfter: { type: "integer" }, reasoning: { type: "string" }
      }
    },
    constructionPlan: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["settlementRef", "buildingType", "buildingName", "targetLevel", "estimatedCost", "durationTurns", "priority", "reason"],
        properties: {
          settlementRef: { type: "string" }, buildingType: { type: "string" }, buildingName: { type: "string" },
          targetLevel: { type: "integer", minimum: 1, maximum: 3 }, estimatedCost: { type: "integer", minimum: 0 },
          durationTurns: { type: "integer", minimum: 1 }, priority: { type: "integer", minimum: 1, maximum: 5 }, reason: { type: "string" }
        }
      }
    },
    recruitmentPlan: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["settlementRef", "unitType", "unitName", "quantity", "estimatedCost", "addedUpkeep", "priority", "reason"],
        properties: {
          settlementRef: { type: "string" }, unitType: { type: "string" }, unitName: { type: "string" },
          quantity: { type: "integer", minimum: 100 }, estimatedCost: { type: "integer", minimum: 0 }, addedUpkeep: { type: "integer", minimum: 0 },
          priority: { type: "integer", minimum: 1, maximum: 5 }, reason: { type: "string" }
        }
      }
    },
    shipbuildingPlan: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["settlementRef", "shipType", "shipName", "quantity", "estimatedCost", "addedUpkeep", "completionTurns", "priority", "reason"],
        properties: {
          settlementRef: { type: "string" }, shipType: { type: "string", enum: ["kerkouros", "trireme", "quinquereme"] }, shipName: { type: "string" },
          quantity: { type: "integer", minimum: 1 }, estimatedCost: { type: "integer", minimum: 0 }, addedUpkeep: { type: "integer", minimum: 0 },
          completionTurns: { type: "integer", minimum: 1 }, priority: { type: "integer", minimum: 1, maximum: 5 }, reason: { type: "string" }
        }
      }
    },
    movementPlan: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["formationKind", "formationRef", "startHex", "destinationHex", "targetSettlementRef", "route", "purpose", "priority", "reason"],
        properties: {
          formationKind: { type: "string", enum: ["ARMY", "FLEET"] }, formationRef: { type: "string" }, startHex: { type: "string" }, destinationHex: { type: "string" },
          targetSettlementRef: { type: ["string", "null"] }, route: { type: "array", items: { type: "string" } },
          purpose: { type: "string", enum: ["DEFEND", "REINFORCE", "ASSEMBLE", "ATTACK", "SIEGE", "BLOCKADE", "RAID", "RETREAT", "PATROL"] },
          priority: { type: "integer", minimum: 1, maximum: 5 }, reason: { type: "string" }
        }
      }
    },
    warPlans: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["opponentCountryRef", "objective", "posture", "assemblyHex", "committedArmyRefs", "committedFleetRefs", "phases", "attackCondition", "abortCondition", "reason"],
        properties: {
          opponentCountryRef: { type: "string" }, objective: { type: "string" }, posture: { type: "string", enum: ["OFFENSIVE", "DEFENSIVE", "LIMITED", "AVOID"] },
          assemblyHex: { type: ["string", "null"] }, committedArmyRefs: { type: "array", items: { type: "string" } }, committedFleetRefs: { type: "array", items: { type: "string" } },
          phases: { type: "array", items: { type: "string" }, minItems: 1 }, attackCondition: { type: "string" }, abortCondition: { type: "string" }, reason: { type: "string" }
        }
      }
    },
    orders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "kind", "sourceRef", "targetRef", "amount", "priority", "condition", "reason"],
        properties: {
          category: { type: "string", enum: ["ECONOMY", "MILITARY", "NAVAL", "DIPLOMACY", "CHARACTER"] },
          kind: { type: "string", enum: [...AI_ORDER_KINDS] },
          sourceRef: { type: ["string", "null"] },
          targetRef: { type: ["string", "null"] },
          amount: { type: ["integer", "null"], minimum: 0 },
          priority: { type: "integer", minimum: 1, maximum: 5 },
          condition: { type: ["string", "null"] },
          reason: { type: "string" }
        }
      }
    },
    battlePolicies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["battleId", "posture", "retreatRule", "preferredNavalOrder", "reason"],
        properties: {
          battleId: { type: "string" },
          posture: { type: "string", enum: ["AGGRESSIVE", "BALANCED", "CAUTIOUS", "WITHDRAW"] },
          retreatRule: { type: "string" },
          preferredNavalOrder: { type: ["string", "null"], enum: ["BALANCED", "RAM", "DEFENSIVE", "FLANK", "RETREAT", "CONTROLLED_RETREAT", null] },
          reason: { type: "string" }
        }
      }
    },
    risks: { type: "array", items: { type: "string" } },
    nextTurnGoals: { type: "array", items: { type: "string" } }
  }
} as const;

export function validateAiPlanReferences(plan: AiCountryTurnPlan, observation: AiCountryObservation): string[] {
  const known = new Set([
    ...observation.referenceCatalog.countryIds,
    ...observation.referenceCatalog.settlementIds,
    ...observation.referenceCatalog.publicSettlementIds,
    ...observation.referenceCatalog.armyIds,
    ...observation.referenceCatalog.fleetIds,
    ...observation.referenceCatalog.characterIds,
    ...observation.referenceCatalog.battleIds
  ]);
  const errors: string[] = [];
  plan.orders.forEach((order, index) => {
    if (order.sourceRef && !known.has(order.sourceRef)) errors.push(`Emir ${index + 1}: bilinmeyen kaynak kaydı ${order.sourceRef}.`);
    if (order.targetRef && !known.has(order.targetRef) && !/^[A-Z]{1,3}\d{1,3}$/u.test(order.targetRef)) {
      errors.push(`Emir ${index + 1}: bilinmeyen hedef kaydı ${order.targetRef}.`);
    }
  });
  const settlementIds = new Set(observation.referenceCatalog.settlementIds);
  const publicSettlementIds = new Set(observation.referenceCatalog.publicSettlementIds);
  const armyIds = new Set(observation.referenceCatalog.armyIds);
  const fleetIds = new Set(observation.referenceCatalog.fleetIds);
  const countryIds = new Set(observation.referenceCatalog.countryIds);
  const hexPattern = /^[A-Z]{1,3}-?\d{1,3}$/u;
  plan.constructionPlan.forEach((action, index) => {
    if (!settlementIds.has(action.settlementRef)) errors.push(`İnşaat ${index + 1}: bilinmeyen yerleşke ${action.settlementRef}.`);
  });
  plan.recruitmentPlan.forEach((action, index) => {
    if (!settlementIds.has(action.settlementRef)) errors.push(`Asker alımı ${index + 1}: bilinmeyen yerleşke ${action.settlementRef}.`);
    if (action.quantity % 100 !== 0) errors.push(`Asker alımı ${index + 1}: miktar 100'ün katı olmalıdır.`);
  });
  plan.shipbuildingPlan.forEach((action, index) => {
    if (!settlementIds.has(action.settlementRef)) errors.push(`Gemi üretimi ${index + 1}: bilinmeyen yerleşke ${action.settlementRef}.`);
  });
  plan.movementPlan.forEach((action, index) => {
    const formationIds = action.formationKind === "ARMY" ? armyIds : fleetIds;
    if (!formationIds.has(action.formationRef)) errors.push(`Hareket ${index + 1}: bilinmeyen birlik ${action.formationRef}.`);
    if (!hexPattern.test(action.startHex) || !hexPattern.test(action.destinationHex)) errors.push(`Hareket ${index + 1}: geçersiz Hex koordinatı.`);
    if (action.targetSettlementRef && !publicSettlementIds.has(action.targetSettlementRef)) errors.push(`Hareket ${index + 1}: bilinmeyen hedef yerleşke ${action.targetSettlementRef}.`);
  });
  plan.warPlans.forEach((war, index) => {
    if (!countryIds.has(war.opponentCountryRef)) errors.push(`Savaş planı ${index + 1}: bilinmeyen devlet ${war.opponentCountryRef}.`);
    if (war.committedArmyRefs.some((id) => !armyIds.has(id))) errors.push(`Savaş planı ${index + 1}: bilinmeyen ordu içeriyor.`);
    if (war.committedFleetRefs.some((id) => !fleetIds.has(id))) errors.push(`Savaş planı ${index + 1}: bilinmeyen filo içeriyor.`);
    if (war.assemblyHex && !hexPattern.test(war.assemblyHex)) errors.push(`Savaş planı ${index + 1}: geçersiz toplanma Hex'i.`);
  });
  const battleIds = new Set(observation.referenceCatalog.battleIds);
  plan.battlePolicies.forEach((policy, index) => {
    if (!battleIds.has(policy.battleId)) errors.push(`Savaş politikası ${index + 1}: görünmeyen savaş ${policy.battleId}.`);
  });
  return errors;
}
