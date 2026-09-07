import { MOBILIZATION_RULES } from "./catalog.js";
import type { Mobilization } from "./types.js";

export function militaryLimit(freePopulation: number, mobilization: Mobilization, marshalPartial = false): number {
  const rate = marshalPartial && mobilization === "PARTIAL" ? 0.125 : MOBILIZATION_RULES[mobilization].manpowerRate;
  return Math.floor(freePopulation * rate);
}

export function settlementMobilizationLimit(population: number, mobilization: Mobilization, marshalPartial = false): number {
  return militaryLimit(population, mobilization, marshalPartial);
}

export function settlementTrainingCapacity(population: number, mobilization: Mobilization, marshalPartial = false): number {
  const rate = marshalPartial && mobilization === "PARTIAL" ? 0.10 : MOBILIZATION_RULES[mobilization].trainingRate;
  return Math.floor(population * rate);
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
