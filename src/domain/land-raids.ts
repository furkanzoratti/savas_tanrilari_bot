export type LandRaidType = "REGIONAL" | "CITY";
export type LandRaidTier = "CRITICAL_FAILURE" | "LOW" | "MEDIUM" | "HIGH" | "TOP";

export interface LandRaidOutcome {
  tier: LandRaidTier;
  lootPercent: number;
  populationLossPercent: number;
  incomePenaltyPercent: number;
  armyExposed: boolean;
}

export function landRaidSizeModifier(armyStrength: number, targetPopulation: number, type: LandRaidType): number {
  if (targetPopulation <= 0) return type === "REGIONAL" ? 2 : 10;
  const ratio = armyStrength / targetPopulation;
  const regional = ratio < 0.02 ? -4 : ratio < 0.05 ? -2 : ratio < 0.10 ? 0 : ratio < 0.20 ? 1 : 2;
  return type === "REGIONAL" ? regional : regional * 5;
}

export function landRaidResult(type: LandRaidType, roll: number, modifier: number): LandRaidOutcome & { total: number } {
  const sides = type === "REGIONAL" ? 20 : 100;
  const total = roll === 1 ? 1 : Math.max(1, Math.min(sides, roll + modifier));
  if (type === "REGIONAL") {
    if (roll === 1) return { total, tier:"CRITICAL_FAILURE",lootPercent:0,populationLossPercent:0,incomePenaltyPercent:0,armyExposed:true };
    if (total <= 7) return { total,tier:"LOW",lootPercent:5,populationLossPercent:0.5,incomePenaltyPercent:5,armyExposed:false };
    if (total <= 14) return { total,tier:"MEDIUM",lootPercent:10,populationLossPercent:1,incomePenaltyPercent:10,armyExposed:false };
    if (total <= 19) return { total,tier:"HIGH",lootPercent:15,populationLossPercent:2,incomePenaltyPercent:15,armyExposed:false };
    return { total,tier:"TOP",lootPercent:20,populationLossPercent:3,incomePenaltyPercent:20,armyExposed:false };
  }
  if (roll === 1) return { total,tier:"CRITICAL_FAILURE",lootPercent:0,populationLossPercent:0.5,incomePenaltyPercent:5,armyExposed:false };
  if (total <= 20) return { total,tier:"LOW",lootPercent:10,populationLossPercent:1,incomePenaltyPercent:10,armyExposed:false };
  if (total <= 80) return { total,tier:"MEDIUM",lootPercent:20,populationLossPercent:2,incomePenaltyPercent:15,armyExposed:false };
  if (total <= 95) return { total,tier:"HIGH",lootPercent:35,populationLossPercent:3,incomePenaltyPercent:20,armyExposed:false };
  return { total,tier:"TOP",lootPercent:50,populationLossPercent:5,incomePenaltyPercent:25,armyExposed:false };
}

export function landRaidRewards(input:{type:LandRaidType;armyStrength:number;targetPopulation:number;targetIncome:number;outcome:LandRaidOutcome}) {
  const lootCap = Math.floor(input.armyStrength * (input.type === "REGIONAL" ? 0.25 : 0.50));
  const loot = Math.max(0,Math.min(Math.floor(input.targetIncome*input.outcome.lootPercent/100),lootCap));
  const populationLoss = Math.max(0,Math.min(
    Math.floor(input.targetPopulation*input.outcome.populationLossPercent/100),
    Math.floor(input.armyStrength*0.50),input.targetPopulation
  ));
  const slaves = Math.max(0,Math.floor(Math.min(populationLoss*0.20,input.armyStrength*0.20)));
  return {loot,populationLoss,slaves,lootCap};
}
