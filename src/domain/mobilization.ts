import { MOBILIZATION_RULES } from "./catalog.js";
import type { Mobilization } from "./types.js";

export function militaryLimit(freePopulation: number, mobilization: Mobilization): number {
  return Math.floor(freePopulation * MOBILIZATION_RULES[mobilization].manpowerRate);
}

export function settlementMobilizationLimit(population: number, mobilization: Mobilization): number {
  return militaryLimit(population, mobilization);
}

export function settlementTrainingCapacity(population: number, mobilization: Mobilization): number {
  return Math.floor(population * MOBILIZATION_RULES[mobilization].trainingRate);
}

export function createRecruitmentWaves(
  quantity: number,
  mobilization: Mobilization,
  currentTurn: number
): Array<{ dueTurn: number; quantity: number }> {
  const rules = MOBILIZATION_RULES[mobilization].waves;
  let assigned = 0;
  return rules.map((wave, index) => {
    const isLast = index === rules.length - 1;
    const waveQuantity = isLast ? quantity - assigned : Math.floor(quantity * wave.ratio);
    assigned += waveQuantity;
    return { dueTurn: currentTurn + wave.afterTurns, quantity: waveQuantity };
  }).filter((wave) => wave.quantity > 0);
}

export function isAcquisitionTurn(turn: number, interval: number): boolean {
  return turn % interval === 0;
}
