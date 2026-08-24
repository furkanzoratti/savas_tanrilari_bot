import { BUILDINGS } from "./catalog.js";
import { ruinIncomeMultiplier, type ActiveBuilding } from "./economy.js";
import type { ResourceType } from "./resources.js";

export type IncomeCategory = "building" | "tax" | "landTrade" | "seaTrade";

export interface IncomeBreakdown {
  building: number;
  tax: number;
  landTrade: number;
  seaTrade: number;
}

const zeroBreakdown = (): IncomeBreakdown => ({ building: 0, tax: 0, landTrade: 0, seaTrade: 0 });

export function addIncomeBreakdowns(left: IncomeBreakdown, right: IncomeBreakdown): IncomeBreakdown {
  return {
    building: left.building + right.building,
    tax: left.tax + right.tax,
    landTrade: left.landTrade + right.landTrade,
    seaTrade: left.seaTrade + right.seaTrade
  };
}

export function incomeTotal(value: IncomeBreakdown): number {
  return value.building + value.tax + value.landTrade + value.seaTrade;
}

export function scaleIncome(value: IncomeBreakdown, multiplier: number): IncomeBreakdown {
  return {
    building: Math.floor(value.building * multiplier),
    tax: Math.floor(value.tax * multiplier),
    landTrade: Math.floor(value.landTrade * multiplier),
    seaTrade: Math.floor(value.seaTrade * multiplier)
  };
}

export function populationTaxIncome(population: number): number {
  return Math.max(0, Math.floor(population * 0.03));
}

export function calculateCategorizedIncome(input: {
  settlementIncome: number;
  taxIncome: number;
  landTradeIncome: number;
  seaTradeIncome: number;
  agreementLandIncome?: number;
  agreementSeaIncome?: number;
  manualFlatIncome: number;
  manualIncomePercent: number;
  buildings: ActiveBuilding[];
  ruinStage: 0 | 1 | 2;
  resources?: readonly ResourceType[];
}): { gross: IncomeBreakdown; payable: IncomeBreakdown; buildingUpkeep: number; buildingBonuses: IncomeBreakdown } {
  const resources = input.resources ?? [];
  const gross: IncomeBreakdown = {
    building: Math.max(0, input.manualFlatIncome),
    tax: Math.max(0, input.taxIncome),
    landTrade: Math.max(0, input.settlementIncome + input.landTradeIncome + (input.agreementLandIncome ?? 0)),
    seaTrade: Math.max(0, input.seaTradeIncome + (input.agreementSeaIncome ?? 0))
  };
  let globalIncomePercent = input.manualIncomePercent;
  let buildingUpkeep = 0;

  for (const building of input.buildings) {
    const effect = BUILDINGS[building.buildingType]?.levels[building.level];
    if (!effect) continue;
    buildingUpkeep += effect.upkeep ?? 0;
    const silkMultiplier = resources.includes("SILK") && ["agora", "trade_guild"].includes(building.buildingType) ? 1.10 : 1;
    const flatIncome = Math.floor((effect.flatIncome ?? 0) * silkMultiplier);
    if (building.buildingType === "port") gross.seaTrade += flatIncome;
    else gross.building += flatIncome;
    globalIncomePercent += (effect.incomePercent ?? 0) * silkMultiplier;
    if (resources.includes("WINE") && building.buildingType === "lupanar") globalIncomePercent += 0.05;
    if (resources.includes("GLASS") && ["healer", "aqueduct"].includes(building.buildingType)) gross.building += 100;
    if (resources.includes("AMBER") && building.buildingType === "pantheon") gross.building += 300;
  }

  const incomeBeforePercentages = incomeTotal(gross);
  gross.building += Math.max(0, Math.floor(incomeBeforePercentages * globalIncomePercent));

  const resourceMultiplier = (resources.includes("GOLD") ? 1.10 : 1) * (resources.includes("SPICES") ? 1.20 : 1);
  if (resourceMultiplier > 1) gross.building += Math.floor(incomeTotal(gross) * (resourceMultiplier - 1));

  const buildingBonuses = zeroBreakdown();
  buildingBonuses.building = gross.building;
  const payable = scaleIncome(gross, ruinIncomeMultiplier(input.ruinStage));
  return { gross, payable, buildingUpkeep, buildingBonuses };
}
