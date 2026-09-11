import { BUILDINGS, MOBILIZATION_RULES, SHIPS, UNITS } from "./catalog.js";
import { armyUpkeepMultiplier, type ResourceType } from "./resources.js";
import type { Mobilization, RuinStage, ShipStatus, UnitStatus } from "./types.js";

export interface ActiveBuilding {
  buildingType: string;
  level: number;
}

export function ruinIncomeMultiplier(stage: RuinStage): number {
  if (stage === 1) return 0;
  if (stage === 2) return 0.5;
  return 1;
}

export function nextRuinStage(stage: RuinStage): RuinStage {
  if (stage === 1) return 2;
  return 0;
}

export function calculateSettlementEconomy(input: {
  baseIncome: number;
  manualFlatIncome: number;
  manualIncomePercent: number;
  buildings: ActiveBuilding[];
  ruinStage: RuinStage;
}): { grossIncome: number; payableIncome: number; buildingUpkeep: number; percentBonus: number; flatBonus: number } {
  let flatBonus = input.manualFlatIncome;
  let percentBonus = input.manualIncomePercent;
  let buildingUpkeep = 0;

  for (const building of input.buildings) {
    if (building.buildingType === "lupanar") continue;
    const definition = BUILDINGS[building.buildingType];
    const effect = definition?.levels[building.level];
    if (!effect) continue;
    flatBonus += effect.flatIncome ?? 0;
    percentBonus += effect.incomePercent ?? 0;
    buildingUpkeep += effect.upkeep ?? 0;
  }

  percentBonus = Math.min(0.75, Math.max(0, percentBonus));
  const grossIncome = Math.max(0, Math.floor((input.baseIncome + flatBonus) * (1 + percentBonus)));
  const payableIncome = Math.floor(grossIncome * ruinIncomeMultiplier(input.ruinStage));
  return { grossIncome, payableIncome, buildingUpkeep, percentBonus, flatBonus };
}

export function calculateUnitUpkeep(
  unitType: keyof typeof UNITS,
  quantity: number,
  status: UnitStatus,
  mobilization: Mobilization,
  resources: readonly ResourceType[] = [],
  overLimitPenalty = false
): number {
  void status; // Konum bazlı bakım çarpanları şimdilik pasiftir.
  const unit = UNITS[unitType];
  const multiplier = (1 + MOBILIZATION_RULES[mobilization].upkeepExtra) * (overLimitPenalty ? 1.25 : 1);
  const detachments = unitType === "observer" ? (quantity > 0 ? 1 : 0) : quantity / 1_000;
  return Math.ceil(detachments * unit.upkeep * multiplier * armyUpkeepMultiplier(resources));
}

export function calculateShipUpkeep(
  shipType: keyof typeof SHIPS,
  quantity: number,
  status: ShipStatus,
  mobilization: Mobilization,
  overLimitPenalty = false
): number {
  void status; // Konum bazlı bakım çarpanları şimdilik pasiftir.
  const ship = SHIPS[shipType];
  const multiplier = (1 + MOBILIZATION_RULES[mobilization].upkeepExtra) * (overLimitPenalty ? 1.25 : 1);
  return Math.ceil(quantity * ship.upkeep * multiplier);
}

export function buildingSlotLimit(population: number, hasActivePort = false): number {
  const standardLimit = Math.min(8, 5 + Math.floor(Math.max(0, population) / 10_000));
  return hasActivePort && population >= 150_000 ? 9 : standardLimit;
}

export function naturalPopulationGrowthRate(population: number): number {
  if (population >= 250_000) return 0.05;
  if (population >= 200_000) return 0.04;
  if (population >= 150_000) return 0.03;
  if (population >= 100_000) return 0.02;
  if (population >= 50_000) return 0.01;
  return 0;
}

export function calculatePopulationGain(input: {
  population: number;
  buildings: ActiveBuilding[];
  ruinStage: RuinStage;
  mobilization: Mobilization;
  resources?: readonly ResourceType[];
  marshalPartial?: boolean;
}): number {
  let healerGrowth = 0;
  let growthPercent = 0;

  for (const building of input.buildings) {
    if (building.buildingType === "lupanar") continue;
    const effect = BUILDINGS[building.buildingType]?.levels[building.level];
    if (!effect) continue;
    if (building.buildingType === "healer") {
      const baseHealerGrowth = effect.populationRate !== undefined
        ? Math.max(0, input.population) * effect.populationRate
        : effect.populationFlat ?? 0;
      healerGrowth = baseHealerGrowth * (input.resources?.includes("OLIVE") ? 1.2 : 1);
    }
    growthPercent += effect.populationPercent ?? 0;
  }

  let rawGrowth = Math.max(0, input.population) * naturalPopulationGrowthRate(input.population) + healerGrowth;
  rawGrowth *= 1 + growthPercent;
  if (input.resources?.includes("GRAIN")) rawGrowth *= 1.10;
  if (input.resources?.includes("SPICES")) rawGrowth *= 1.05;
  rawGrowth *= ruinIncomeMultiplier(input.ruinStage);
  rawGrowth *= input.marshalPartial && input.mobilization === "PARTIAL"
    ? 1
    : MOBILIZATION_RULES[input.mobilization].populationMultiplier;
  return Math.max(0, Math.floor(rawGrowth));
}
