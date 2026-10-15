import { scaleIncome, type IncomeBreakdown } from "./income.js";

export const CAPITAL_BONUS_PERCENT = 1;
const CAPITAL_BONUS_MULTIPLIER = 1 + CAPITAL_BONUS_PERCENT / 100;

export function applyCapitalIncomeBonus(income: IncomeBreakdown, isCapital: boolean): IncomeBreakdown {
  return isCapital ? scaleIncome(income, CAPITAL_BONUS_MULTIPLIER) : income;
}

export function applyCapitalPopulationBonus(populationGain: number, isCapital: boolean): number {
  return isCapital ? Math.floor(populationGain * CAPITAL_BONUS_MULTIPLIER) : populationGain;
}
