import { UNIT_POWER } from "./great-power.js";

export type RebelFactionType = "POPULAR" | "SEPARATIST" | "RELIGIOUS" | "SLAVE";

export const REBEL_FACTION_LABELS: Record<RebelFactionType, string> = {
  POPULAR: "Halk Ayaklanması",
  SEPARATIST: "Bağımsızlık Yanlıları",
  RELIGIOUS: "Dinî İsyancılar",
  SLAVE: "Köle İsyanı"
};

export interface StabilityFactor { label: string; adjustment: number }

export function prosperityTier(prosperity: number): { label: string; incomeMultiplier: number; populationMultiplier: number; unrestAdjustment: number } {
  const value = Math.max(0, Math.min(100, Math.floor(prosperity)));
  if (value === 100) return { label: "Altın Çağ", incomeMultiplier: 1.10, populationMultiplier: 1.10, unrestAdjustment: -10 };
  if (value >= 75) return { label: "Müreffeh", incomeMultiplier: 1.05, populationMultiplier: 1.05, unrestAdjustment: -5 };
  if (value >= 50) return { label: "İstikrarlı", incomeMultiplier: 1, populationMultiplier: 1, unrestAdjustment: 0 };
  if (value >= 25) return { label: "Kırılgan", incomeMultiplier: 0.90, populationMultiplier: 0.90, unrestAdjustment: 5 };
  return { label: "Çöküntü", incomeMultiplier: 0.80, populationMultiplier: 0.80, unrestAdjustment: 10 };
}

export function rebellionRisk(factors: readonly StabilityFactor[]): number {
  return Math.max(0, Math.min(75, factors.reduce((sum, factor) => sum + factor.adjustment, 0)));
}

export function nextRebellionProgress(input: { before: number; eligible: boolean; risk: number; roll: number | null; immune: boolean }): number {
  if (input.immune) return Math.max(0, input.before - 20);
  if (!input.eligible) return Math.max(0, input.before - 20);
  if (input.roll !== null && input.roll <= input.risk) return Math.min(100, input.before + 20);
  return input.risk < 25 ? Math.max(0, input.before - 10) : input.before;
}

export function chooseRebelFaction(scores: Record<RebelFactionType, number>): RebelFactionType {
  const priority: RebelFactionType[] = ["SEPARATIST", "RELIGIOUS", "SLAVE", "POPULAR"];
  return priority.reduce((best, key) => scores[key] > scores[best] ? key : best, "POPULAR" as RebelFactionType);
}

const REBEL_COMPOSITION: Record<RebelFactionType, Readonly<Record<string, number>>> = {
  // İsyancılar geçici milis değil; kaçak askerler, yerel seçkinler ve tecrübeli savaşçılar içerir.
  POPULAR: { light_infantry: 25, spear: 25, archer: 15, heavy_infantry: 20, light_cavalry: 10, heavy_cavalry: 5 },
  SEPARATIST: { light_infantry: 15, spear: 20, archer: 15, heavy_infantry: 25, light_cavalry: 15, heavy_cavalry: 10 },
  RELIGIOUS: { light_infantry: 20, spear: 25, archer: 20, heavy_infantry: 20, light_cavalry: 10, heavy_cavalry: 5 },
  SLAVE: { light_infantry: 30, spear: 30, slinger: 15, archer: 10, heavy_infantry: 10, light_cavalry: 5 }
};

export function rebelPersonnel(input: { type: RebelFactionType; population: number; slavePopulation: number; warExhaustion: number }): number {
  const freePopulation = Math.max(0, input.population);
  const slavePopulation = Math.max(0, input.slavePopulation);
  const ratios: Record<RebelFactionType, readonly [number, number]> = {
    POPULAR: [0.06, 0.02], SEPARATIST: [0.08, 0.03], RELIGIOUS: [0.07, 0.02], SLAVE: [0.02, 0.20]
  };
  const [freeRatio, slaveRatio] = ratios[input.type];
  const raw = (freePopulation * freeRatio + slavePopulation * slaveRatio) * (1 + Math.max(0, input.warExhaustion) / 500);
  const cap = Math.max(1_000, Math.min(30_000, Math.floor((freePopulation + slavePopulation) * 0.20)));
  return Math.max(1_000, Math.min(cap, Math.round(raw / 100) * 100));
}

export function rebelComposition(type: RebelFactionType, personnel: number): Record<string, number> {
  const total = Math.max(0, Math.floor(personnel));
  const weights = REBEL_COMPOSITION[type];
  const result: Record<string, number> = {};
  let allocated = 0;
  for (const [unit, percent] of Object.entries(weights)) {
    const quantity = Math.floor(total * percent / 100);
    result[unit] = quantity;
    allocated += quantity;
  }
  const primary = Object.keys(weights)[0]!;
  result[primary] = (result[primary] ?? 0) + total - allocated;
  return result;
}

export function rebelMilitaryPower(composition: Readonly<Record<string, number>>): number {
  return Math.round(Object.entries(composition).reduce((sum, [unit, quantity]) =>
    sum + Math.max(0, quantity) * (UNIT_POWER[unit as keyof typeof UNIT_POWER] ?? 1), 0));
}
