export interface SiegeStarvationFactors {
  farmLevel: number;
  aqueductLevel: number;
  garrisonReinforcement: boolean;
  formableBonus?: number | undefined;
}

export const MAX_SIEGE_STARVATION_BONUS = 8;

export function siegeStarvationBonus(factors: SiegeStarvationFactors): number {
  const farmBonus = factors.farmLevel >= 3 ? 3 : factors.farmLevel >= 2 ? 1 : 0;
  const aqueductBonus = factors.aqueductLevel >= 2 ? 1 : 0;
  const policyBonus = factors.garrisonReinforcement ? 1 : 0;
  return Math.min(
    MAX_SIEGE_STARVATION_BONUS,
    farmBonus + aqueductBonus + policyBonus + Math.max(0, factors.formableBonus ?? 0)
  );
}
