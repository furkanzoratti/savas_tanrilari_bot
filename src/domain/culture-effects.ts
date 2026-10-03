import type { IncomeBreakdown } from "./income.js";
import type { CultureGroup } from "./cultures.js";

export const FOREIGN_CULTURE_INCOME_MULTIPLIER = 0.80;
export const FOREIGN_CULTURE_MILITARY_MULTIPLIER = 0.80;

export function isForeignCulture(
  settlementCulture: CultureGroup,
  primaryCulture: CultureGroup
): boolean {
  return settlementCulture !== "UNASSIGNED"
    && primaryCulture !== "UNASSIGNED"
    && settlementCulture !== primaryCulture;
}

export function applyCultureIncomeEffect(
  income: IncomeBreakdown,
  settlementCulture: CultureGroup,
  primaryCulture: CultureGroup
): IncomeBreakdown {
  if (!isForeignCulture(settlementCulture, primaryCulture)) return { ...income };
  return {
    building: Math.floor(income.building * FOREIGN_CULTURE_INCOME_MULTIPLIER),
    tax: Math.floor(income.tax * FOREIGN_CULTURE_INCOME_MULTIPLIER),
    landTrade: Math.floor(income.landTrade * FOREIGN_CULTURE_INCOME_MULTIPLIER),
    seaTrade: Math.floor(income.seaTrade * FOREIGN_CULTURE_INCOME_MULTIPLIER)
  };
}

export function cultureMilitaryPopulation(
  population: number,
  settlementCulture: CultureGroup,
  primaryCulture: CultureGroup,
  enabled: boolean
): number {
  const normalized = Math.max(0, Math.floor(population));
  return enabled && isForeignCulture(settlementCulture, primaryCulture)
    ? Math.floor(normalized * FOREIGN_CULTURE_MILITARY_MULTIPLIER)
    : normalized;
}
