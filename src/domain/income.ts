import { BUILDINGS } from "./catalog.js";
import { ruinIncomeMultiplier, type ActiveBuilding } from "./economy.js";
import type { ResourceType } from "./resources.js";

export type IncomeCategory = "settlement" | "tax" | "landTrade" | "seaTrade";

export interface IncomeBreakdown {
  settlement: number;
  tax: number;
  landTrade: number;
  seaTrade: number;
}

const zeroBreakdown = (): IncomeBreakdown => ({ settlement: 0, tax: 0, landTrade: 0, seaTrade: 0 });

const buildingCategory: Record<string, IncomeCategory> = {
  trade_guild: "landTrade",
  lupanar: "tax",
  farm: "settlement",
  curia: "tax",
  pantheon: "tax",
  aqueduct: "settlement",
  agora: "landTrade",
  port: "seaTrade",
  shipyard: "seaTrade"
};

export function addIncomeBreakdowns(left: IncomeBreakdown, right: IncomeBreakdown): IncomeBreakdown {
  return {
    settlement: left.settlement + right.settlement,
    tax: left.tax + right.tax,
    landTrade: left.landTrade + right.landTrade,
    seaTrade: left.seaTrade + right.seaTrade
  };
}

export function incomeTotal(value: IncomeBreakdown): number {
  return value.settlement + value.tax + value.landTrade + value.seaTrade;
}

export function scaleIncome(value: IncomeBreakdown, multiplier: number): IncomeBreakdown {
  return {
    settlement: Math.floor(value.settlement * multiplier),
    tax: Math.floor(value.tax * multiplier),
    landTrade: Math.floor(value.landTrade * multiplier),
    seaTrade: Math.floor(value.seaTrade * multiplier)
  };
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
  const base: IncomeBreakdown = {
    settlement: input.settlementIncome + input.manualFlatIncome,
    tax: input.taxIncome,
    landTrade: input.landTradeIncome + (input.agreementLandIncome ?? 0),
    seaTrade: input.seaTradeIncome + (input.agreementSeaIncome ?? 0)
  };
  const flat = zeroBreakdown();
  const percent = zeroBreakdown();
  let buildingUpkeep = 0;
  const resources = input.resources ?? [];

  for (const building of input.buildings) {
    const effect = BUILDINGS[building.buildingType]?.levels[building.level];
    if (!effect) continue;
    buildingUpkeep += effect.upkeep ?? 0;
    const category = buildingCategory[building.buildingType] ?? "settlement";
    const silkMultiplier = resources.includes("SILK") && ["agora", "trade_guild"].includes(building.buildingType) ? 1.10 : 1;
    flat[category] += Math.floor((effect.flatIncome ?? 0) * silkMultiplier);
    percent[category] += (effect.incomePercent ?? 0) * silkMultiplier;
    if (resources.includes("WINE") && building.buildingType === "lupanar") percent[category] += 0.05;
    if (resources.includes("GLASS") && ["healer", "aqueduct"].includes(building.buildingType)) flat.settlement += 100;
    if (resources.includes("AMBER") && building.buildingType === "pantheon") flat.tax += 300;
  }

  const gross = zeroBreakdown();
  const buildingBonuses = zeroBreakdown();
  const resourceIncomeMultiplier = (resources.includes("GOLD") ? 1.10 : 1) * (resources.includes("SPICES") ? 1.20 : 1);
  for (const category of Object.keys(gross) as IncomeCategory[]) {
    const withoutBuildings = Math.max(0, Math.floor(base[category] * (1 + input.manualIncomePercent) * resourceIncomeMultiplier));
    gross[category] = Math.max(0, Math.floor((base[category] + flat[category]) * (1 + input.manualIncomePercent + percent[category]) * resourceIncomeMultiplier));
    buildingBonuses[category] = gross[category] - withoutBuildings;
  }

  const payable = scaleIncome(gross, ruinIncomeMultiplier(input.ruinStage));
  return { gross, payable, buildingUpkeep, buildingBonuses };
}
