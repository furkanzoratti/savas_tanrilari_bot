import type { AdmiralSpecialization } from "./characters.js";

export type NavalRaidTier = "CRITICAL_FAILURE" | "FAILED" | "PARTIAL" | "SUCCESS" | "SUPERIOR";

export function blockadeSeaTradeLossPercent(
  specialization: AdmiralSpecialization | null,
  specializationLevel: number
): number {
  if (specialization !== "BLOCKADE_EXPERT" || specializationLevel < 1) return 10;
  if (specializationLevel >= 3) return 60;
  return specializationLevel >= 2 ? 30 : 15;
}

export function navalRaidBonus(specialization: AdmiralSpecialization | null, specializationLevel: number): number {
  return specialization === "SEA_RAIDER" && specializationLevel >= 1 ? 1 : 0;
}

export function navalRaidDetectionModifier(
  specialization: AdmiralSpecialization | null,
  specializationLevel: number
): number {
  return specialization === "SEA_RAIDER" && specializationLevel >= 2 ? -1 : 0;
}

export function navalRaidLootMultiplier(
  specialization: AdmiralSpecialization | null,
  specializationLevel: number
): number {
  if (specialization !== "SEA_RAIDER") return 1;
  if (specializationLevel >= 3) return 1.25;
  return specializationLevel >= 2 ? 1.15 : 1;
}

export function navalRaidResult(roll: number, bonus: number): { tier: NavalRaidTier; lootPercent: number } {
  if (roll === 1) return { tier: "CRITICAL_FAILURE", lootPercent: 0 };
  if (roll === 20) return { tier: "SUPERIOR", lootPercent: 20 };
  const total = roll + bonus;
  if (total >= 20) return { tier: "SUPERIOR", lootPercent: 15 };
  if (total >= 15) return { tier: "SUCCESS", lootPercent: 10 };
  if (total >= 10) return { tier: "PARTIAL", lootPercent: 5 };
  return { tier: "FAILED", lootPercent: 0 };
}

export function navalRaidDetected(roll: number, modifier: number): boolean {
  if (roll === 1) return false;
  if (roll === 20) return true;
  return roll + modifier >= 15;
}
