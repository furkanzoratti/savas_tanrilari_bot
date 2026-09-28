import type { BattleSideKey } from "./battle.js";

export type NavalBattleOrder =
  | "BALANCED"
  | "RAM"
  | "DEFENSIVE"
  | "FLANK"
  | "RETREAT"
  | "CONTROLLED_RETREAT";

export const NAVAL_MANEUVER_POINT_LIMIT = 5;

export const NAVAL_BATTLE_ORDERS: Record<NavalBattleOrder, {
  label: string;
  description: string;
  maneuverCost: number;
  clashMultiplier: number;
  damageMultiplier: number;
  incomingDamageMultiplier: number;
}> = {
  BALANCED: {
    label: "Dengeli Muharebe",
    description: "Çarpışma ve hasar değişmez.",
    maneuverCost: 0,
    clashMultiplier: 1,
    damageMultiplier: 1,
    incomingDamageMultiplier: 1
  },
  RAM: {
    label: "Koçbaşı Hücumu",
    description: "Hasar +%20; alınan hasar +%10.",
    maneuverCost: 0,
    clashMultiplier: 1,
    damageMultiplier: 1.20,
    incomingDamageMultiplier: 1.10
  },
  DEFENSIVE: {
    label: "Savunma Hattı",
    description: "Alınan hasar -%20; verilen hasar -%15.",
    maneuverCost: 0,
    clashMultiplier: 1,
    damageMultiplier: 0.85,
    incomingDamageMultiplier: 0.80
  },
  FLANK: {
    label: "Kanat Manevrası",
    description: "Çarpışma +%15; hasar -%10.",
    maneuverCost: 0,
    clashMultiplier: 1.15,
    damageMultiplier: 0.90,
    incomingDamageMultiplier: 1
  },
  RETREAT: {
    label: "Temas Kesme",
    description: "Zar atılmadan deniz savaşından çekil.",
    maneuverCost: 0,
    clashMultiplier: 1,
    damageMultiplier: 1,
    incomingDamageMultiplier: 1
  },
  CONTROLLED_RETREAT: {
    label: "Kontrollü Temas Kesme",
    description: "3 Manevra Puanı harcayarak takip kaybını yarıya indir.",
    maneuverCost: 3,
    clashMultiplier: 1,
    damageMultiplier: 1,
    incomingDamageMultiplier: 1
  }
};

export const isNavalRetreatOrder = (order: NavalBattleOrder | null | undefined): boolean =>
  order === "RETREAT" || order === "CONTROLLED_RETREAT";

export function applyNavalOrderToRoll(
  order: NavalBattleOrder,
  roll: { clash: number; damage: number }
): { clash: number; damage: number } {
  const rule = NAVAL_BATTLE_ORDERS[order];
  return {
    clash: Math.max(0, Math.round(roll.clash * rule.clashMultiplier)),
    damage: Math.max(0, Math.round(roll.damage * rule.damageMultiplier))
  };
}

export function navalIncomingDamageMultiplier(order: NavalBattleOrder): number {
  return NAVAL_BATTLE_ORDERS[order].incomingDamageMultiplier;
}

export function awardNavalManeuverPoint(
  currentA: number,
  currentB: number,
  winner: BattleSideKey | null
): { A: number; B: number } {
  const clamp = (value: number) => Math.min(NAVAL_MANEUVER_POINT_LIMIT, Math.max(0, Math.floor(value)));
  return {
    A: clamp(currentA + (winner === "A" ? 1 : 0)),
    B: clamp(currentB + (winner === "B" ? 1 : 0))
  };
}

export interface NavalFleetConditionInput {
  initialHullHp: number;
  operationalHullHp: number;
  initialShips: number;
  activeShips: number;
  disabledShips: number;
  sunkShips: number;
}

export type NavalFleetCondition = "OPERATIONAL" | "DAMAGED" | "CRITICAL" | "OUT";

export function navalFleetCondition(input: NavalFleetConditionInput): NavalFleetCondition {
  if (input.activeShips <= 0 || input.operationalHullHp <= 0) return "OUT";
  if (navalFleetMustWithdraw(input)) return "CRITICAL";
  const hpRatio = input.initialHullHp > 0 ? input.operationalHullHp / input.initialHullHp : 0;
  const inactiveRatio = input.initialShips > 0 ? (input.disabledShips + input.sunkShips) / input.initialShips : 1;
  if (hpRatio <= 0.65 || inactiveRatio >= 0.25) return "DAMAGED";
  return "OPERATIONAL";
}

export function navalFleetMustWithdraw(input: NavalFleetConditionInput): boolean {
  if (input.activeShips <= 0 || input.operationalHullHp <= 0) return true;
  const hpRatio = input.initialHullHp > 0 ? input.operationalHullHp / input.initialHullHp : 0;
  const inactiveRatio = input.initialShips > 0 ? (input.disabledShips + input.sunkShips) / input.initialShips : 1;
  return hpRatio <= 0.40 && inactiveRatio >= 0.50;
}

