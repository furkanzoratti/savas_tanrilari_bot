import { BUILDINGS } from "./catalog.js";
import { ruinIncomeMultiplier, type ActiveBuilding } from "./economy.js";

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

  for (const building of input.buildings) {
    const effect = BUILDINGS[building.buildingType]?.levels[building.level];
    if (!effect) continue;
    buildingUpkeep += effect.upkeep ?? 0;
    const category = buildingCategory[building.buildingType] ?? "settlement";
    flat[category] += effect.flatIncome ?? 0;
    percent[category] += effect.incomePercent ?? 0;
  }

  const gross = zeroBreakdown();
  const buildingBonuses = zeroBreakdown();
  for (const category of Object.keys(gross) as IncomeCategory[]) {
    const withoutBuildings = Math.max(0, Math.floor(base[category] * (1 + input.manualIncomePercent)));
    gross[category] = Math.max(0, Math.floor((base[category] + flat[category]) * (1 + input.manualIncomePercent + percent[category])));
    buildingBonuses[category] = gross[category] - withoutBuildings;
  }

  const payable = scaleIncome(gross, ruinIncomeMultiplier(input.ruinStage));
  return { gross, payable, buildingUpkeep, buildingBonuses };
}
