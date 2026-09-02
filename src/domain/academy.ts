import type { CharacterRole } from "./types.js";

export const ACADEMY_ROLE_ORDER: readonly CharacterRole[] = ["SPY", "MERCHANT", "COMMANDER", "DIPLOMAT"];

export function academyRollSides(level: number): 20 | 30 | 40 {
  return level === 1 ? 40 : level === 2 ? 30 : 20;
}

export function academyRoleForRoll(
  level: number,
  roll: number,
  excludedRole: CharacterRole | null,
  selectedRole: CharacterRole | null
): CharacterRole {
  if (level === 3) {
    if (!selectedRole) throw new Error("Akademi Sv3 için görev seçilmelidir.");
    return selectedRole;
  }
  const roles = level === 2
    ? ACADEMY_ROLE_ORDER.filter((role) => role !== excludedRole)
    : ACADEMY_ROLE_ORDER;
  const index = Math.min(roles.length - 1, Math.max(0, Math.floor((roll - 1) / 10)));
  return roles[index]!;
}
