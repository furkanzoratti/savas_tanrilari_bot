import type { NavalUnitType } from "./battle.js";

export interface NavalHullStats {
  label: string;
  maxHp: number;
  armor: number;
  incomingMultiplier: number;
  disabledAtHp: number;
}

export const NAVAL_HULL_STATS: Record<NavalUnitType, NavalHullStats> = {
  kerkouros: { label:"Kerkouros", maxHp:40, armor:1, incomingMultiplier:1.15, disabledAtHp:10 },
  trireme: { label:"Trireme", maxHp:75, armor:3, incomingMultiplier:1, disabledAtHp:20 },
  quinquereme: { label:"Quinquereme", maxHp:120, armor:6, incomingMultiplier:0.85, disabledAtHp:30 }
};

export interface NavalHullState {
  id: string;
  shipType: NavalUnitType;
  maxHp: number;
  currentHp: number;
  disabledRound: number | null;
  sunkRound: number | null;
}

export interface NavalDamageResult {
  hulls: NavalHullState[];
  absorbedDamage: number;
  newlyDisabled: number;
  newlySunk: number;
}

export function isHullOperational(hull: NavalHullState): boolean {
  if (hull.sunkRound !== null || hull.currentHp <= 0) return false;
  return hull.disabledRound === null && hull.currentHp > NAVAL_HULL_STATS[hull.shipType].disabledAtHp;
}

export function applyNavalHullDamage(hulls: NavalHullState[], rawDamage: number, round: number): NavalDamageResult {
  const next = hulls.map((hull) => ({ ...hull }));
  let remainingRaw = Math.max(0, Math.floor(rawDamage));
  let absorbedDamage = 0;
  let newlyDisabled = 0;
  let newlySunk = 0;
  const targets = next
    .filter((hull) => hull.sunkRound === null && hull.currentHp > 0)
    .sort((a,b) => {
      const aOldDisabled = a.disabledRound !== null && a.disabledRound < round ? 0 : 1;
      const bOldDisabled = b.disabledRound !== null && b.disabledRound < round ? 0 : 1;
      return aOldDisabled-bOldDisabled || a.currentHp-b.currentHp || a.id.localeCompare(b.id);
    });
  for (let index=0; index<targets.length && remainingRaw>0; index+=1) {
    const hull = targets[index]!;
    const rawShare = Math.max(1,Math.ceil(remainingRaw/(targets.length-index)));
    remainingRaw -= rawShare;
    const stats = NAVAL_HULL_STATS[hull.shipType];
    const effective = Math.max(1,Math.floor(rawShare*stats.incomingMultiplier)-stats.armor);
    const hpBefore = hull.currentHp;
    const wasDisabledBeforeRound = hull.disabledRound !== null && hull.disabledRound < round;
    if (effective >= hpBefore) {
      if (wasDisabledBeforeRound) {
        hull.currentHp = 0;
        hull.sunkRound = round;
        newlySunk += 1;
      } else {
        // A working ship cannot sink from a single battle-round hit.
        // It becomes disabled first and may sink from damage in a later round.
        hull.currentHp = Math.max(1,Math.min(hpBefore,stats.disabledAtHp));
        hull.disabledRound = round;
        newlyDisabled += 1;
      }
    } else {
      hull.currentHp = hpBefore-effective;
      if (hull.disabledRound === null && hull.currentHp <= stats.disabledAtHp) {
        hull.disabledRound = round;
        newlyDisabled += 1;
      }
    }
    absorbedDamage += hpBefore-hull.currentHp;
  }
  return { hulls:next,absorbedDamage,newlyDisabled,newlySunk };
}

export const SHIPYARD_REPAIR_HP_PER_TURN: Record<1|2|3,number> = { 1:150,2:300,3:500 };

export function repairDurationTurns(missingHp:number,shipyardLevel:1|2|3):number {
  return Math.max(1,Math.ceil(Math.max(0,missingHp)/SHIPYARD_REPAIR_HP_PER_TURN[shipyardLevel]));
}
