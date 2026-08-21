import { BUILDINGS, MOBILIZATION_RULES, SHIPS, UNITS } from "./catalog.js";
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
    const definition = BUILDINGS[building.buildingType];
    const effect = definition?.levels[building.level];
    if (!effect) continue;
    flatBonus += effect.flatIncome ?? 0;
    percentBonus += effect.incomePercent ?? 0;
    buildingUpkeep += effect.upkeep ?? 0;
  }

  const grossIncome = Math.max(0, Math.floor((input.baseIncome + flatBonus) * (1 + percentBonus)));
  const payableIncome = Math.floor(grossIncome * ruinIncomeMultiplier(input.ruinStage));
  return { grossIncome, payableIncome, buildingUpkeep, percentBonus, flatBonus };
}

const statusMultiplier: Record<UnitStatus, number> = {
  GARRISON: 0.5,
  FIELD_FRIENDLY: 1,
  FIELD_HOSTILE: 1.25
};

const shipStatusMultiplier: Record<ShipStatus, number> = {
  RESERVE: 0.5,
  ACTIVE: 1,
  HOSTILE: 1.25
};

export function calculateUnitUpkeep(
  unitType: keyof typeof UNITS,
  quantity: number,
  status: UnitStatus,
  mobilization: Mobilization
): number {
  const unit = UNITS[unitType];
  const multiplier = statusMultiplier[status] + MOBILIZATION_RULES[mobilization].upkeepExtra;
  return Math.ceil((quantity / 1_000) * unit.upkeep * multiplier);
}

export function calculateShipUpkeep(
  shipType: keyof typeof SHIPS,
  quantity: number,
  status: ShipStatus,
  mobilization: Mobilization
): number {
  const ship = SHIPS[shipType];
  const multiplier = shipStatusMultiplier[status] + MOBILIZATION_RULES[mobilization].upkeepExtra;
  return Math.ceil(quantity * ship.upkeep * multiplier);
}

export function buildingSlotLimit(population: number): number {
  return 2 + Math.floor(Math.max(0, population - 20_000) / 10_000);
}

export function calculatePopulationGain(input: {
  basePopulationGrowth: number;
  buildings: ActiveBuilding[];
  ruinStage: RuinStage;
  mobilization: Mobilization;
}): number {
  let healerGrowth = 0;
  let growthPercent = 0;
  let lupanarLevel = 0;

  for (const building of input.buildings) {
    const effect = BUILDINGS[building.buildingType]?.levels[building.level];
    if (!effect) continue;
    if (building.buildingType === "healer") healerGrowth = effect.populationFlat ?? 0;
    if (building.buildingType === "aqueduct") growthPercent += effect.populationPercent ?? 0;
    if (building.buildingType === "lupanar") lupanarLevel = building.level;
  }

  let rawGrowth = input.basePopulationGrowth + healerGrowth;
  if (lupanarLevel === 1) rawGrowth = healerGrowth > 0 ? rawGrowth * 0.5 : 0;
  if (lupanarLevel === 2) rawGrowth *= 0.3;
  if (lupanarLevel === 3) rawGrowth = healerGrowth;

  rawGrowth *= 1 + growthPercent;
  rawGrowth *= ruinIncomeMultiplier(input.ruinStage);
  rawGrowth *= MOBILIZATION_RULES[input.mobilization].populationMultiplier;
  return Math.max(0, Math.floor(rawGrowth));
}