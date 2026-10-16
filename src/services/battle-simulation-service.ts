import {
  BATTLE_TERRAINS,
  BATTLE_UNIT_STATS,
  NAVAL_UNIT_STATS,
  battleEnds,
  compositionTotal,
  fieldPressureAfterRound,
  orderState,
  resolveRound,
  rollBattlePool,
  rollNavalPool,
  roundDamageFactors,
  type BattleComposition,
  type BattleOrder,
  type BattleTerrain,
  type BattleUnitType,
  type NavalUnitType
} from "../domain/battle.js";
import {
  NAVAL_HULL_STATS,
  applyNavalHullDamage,
  isHullOperational,
  type NavalHullState
} from "../domain/naval-hulls.js";
import {
  navalFleetCondition,
  navalFleetMustWithdraw,
  type NavalFleetCondition,
  type NavalFleetConditionInput
} from "../domain/naval-tactics.js";

export type BattleSimulationMode = "LAND" | "NAVAL";
type SimulationWinner = "A" | "B" | null;

interface RawSimulationSide {
  name?: unknown;
  units?: unknown;
}

export interface BattleSimulationInput {
  mode?: unknown;
  terrain?: unknown;
  sideA?: RawSimulationSide;
  sideB?: RawSimulationSide;
}

interface UnitResult {
  key: string;
  label: string;
  initial: number;
  lost: number;
  remaining: number;
  active?: number;
  disabled?: number;
}

interface RoundSideResult {
  clash: number;
  damage: number;
  lost: number;
  remaining: number;
  pressure?: number;
  order?: BattleOrder;
  disabled?: number;
  active?: number;
  condition?: NavalFleetCondition;
  lossesByUnit: Array<{ key: string; label: string; lost: number }>;
  disabledByUnit?: Array<{ key: string; label: string; disabled: number }>;
}

interface SimulationRound {
  round: number;
  tier: "BALANCED" | "MINOR" | "CLEAR" | "CRUSHING";
  winner: SimulationWinner;
  sideA: RoundSideResult;
  sideB: RoundSideResult;
}

const LAND_TERRAINS = Object.keys(BATTLE_TERRAINS)
  .filter((key) => key !== "NAVAL" && key !== "SIEGE") as BattleTerrain[];
const LAND_KEYS = Object.keys(BATTLE_UNIT_STATS) as BattleUnitType[];
const NAVAL_KEYS = Object.keys(NAVAL_UNIT_STATS) as NavalUnitType[];
const MAX_ROUNDS = 30;
const MAX_LAND_FORCE = 500_000;
const MAX_NAVAL_FORCE = 10_000;

const labelFor = (mode: BattleSimulationMode, key: string): string => mode === "LAND"
  ? BATTLE_UNIT_STATS[key as BattleUnitType]?.label ?? key
  : NAVAL_UNIT_STATS[key as NavalUnitType]?.label ?? key;

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.length > 60) throw new Error("Taraf adı en fazla 60 karakter olabilir.");
  return trimmed;
}

function parseComposition(mode: BattleSimulationMode, value: unknown): BattleComposition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Taraf birlikleri geçersiz.");
  const validKeys = mode === "LAND" ? new Set<string>(LAND_KEYS) : new Set<string>(NAVAL_KEYS);
  const composition: BattleComposition = {};
  for (const [key, rawQuantity] of Object.entries(value)) {
    if (!validKeys.has(key)) throw new Error(`Geçersiz birlik türü: ${key}`);
    const quantity = Number(rawQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error(`${labelFor(mode, key)} miktarı pozitif tam sayı olmalıdır.`);
    if (quantity > 0) composition[key as BattleUnitType | NavalUnitType] = quantity;
  }
  const total = compositionTotal(composition);
  const maximum = mode === "LAND" ? MAX_LAND_FORCE : MAX_NAVAL_FORCE;
  if (total <= 0) throw new Error("Her iki tarafta da en az bir birlik bulunmalıdır.");
  if (total > maximum) throw new Error(`Bir tarafta en fazla ${maximum.toLocaleString("tr-TR")} ${mode === "LAND" ? "asker" : "gemi"} simüle edilebilir.`);
  return composition;
}

function compositionLosses(
  mode: BattleSimulationMode,
  before: BattleComposition,
  after: BattleComposition
): Array<{ key: string; label: string; lost: number }> {
  const keys = mode === "LAND" ? LAND_KEYS : NAVAL_KEYS;
  return keys.flatMap((key) => {
    const lost = Math.max(0, Math.floor(before[key] ?? 0) - Math.floor(after[key] ?? 0));
    return lost > 0 ? [{ key, label: labelFor(mode, key), lost }] : [];
  });
}

function finalLandUnits(initial: BattleComposition, remaining: BattleComposition): UnitResult[] {
  return LAND_KEYS.flatMap((key) => {
    const initialQuantity = Math.floor(initial[key] ?? 0);
    if (initialQuantity <= 0) return [];
    const remainingQuantity = Math.max(0, Math.floor(remaining[key] ?? 0));
    return [{
      key,
      label: BATTLE_UNIT_STATS[key].label,
      initial: initialQuantity,
      lost: initialQuantity - remainingQuantity,
      remaining: remainingQuantity
    }];
  });
}

function runLandSimulation(
  terrain: BattleTerrain,
  sideAName: string,
  sideBName: string,
  initialA: BattleComposition,
  initialB: BattleComposition,
  randomInt?: (max: number) => number
) {
  const random = randomInt ?? ((max: number) => Math.floor(Math.random() * max));
  const frontage = BATTLE_TERRAINS[terrain];
  const initialTotalA = compositionTotal(initialA);
  const initialTotalB = compositionTotal(initialB);
  let compositionA = { ...initialA };
  let compositionB = { ...initialB };
  let pressureA = 0;
  let pressureB = 0;
  let winner: SimulationWinner = null;
  const rounds: SimulationRound[] = [];

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    let rollA = rollBattlePool(compositionA, frontage.frontageA, random, "FIELD", {
      opponentComposition: compositionB,
      opponentFrontage: frontage.frontageB
    });
    const rollB = rollBattlePool(compositionB, frontage.frontageB, random, "FIELD", {
      opponentComposition: compositionA,
      opponentFrontage: frontage.frontageA
    });
    if (terrain === "AMBUSH" && round === 1) {
      rollA = {
        ...rollA,
        clash: Math.round(rollA.clash * 1.25),
        damage: Math.round(rollA.damage * 1.10),
        antiCavalryDamage: Math.round((rollA.antiCavalryDamage ?? 0) * 1.10)
      };
    }
    const resolution = resolveRound(compositionA, compositionB, rollA, rollB, { mode: "LAND" });
    pressureA = fieldPressureAfterRound(pressureA, resolution.pressureDeltaA);
    pressureB = fieldPressureAfterRound(pressureB, resolution.pressureDeltaB);
    const nextA = resolution.remainingA;
    const nextB = resolution.remainingB;
    const remainingA = compositionTotal(nextA);
    const remainingB = compositionTotal(nextB);
    const brokenA = battleEnds(pressureA, initialTotalA, remainingA);
    const brokenB = battleEnds(pressureB, initialTotalB, remainingB);
    rounds.push({
      round,
      tier: resolution.tier,
      winner: resolution.winner,
      sideA: {
        clash: rollA.clash,
        damage: rollA.damage,
        lost: resolution.lossA,
        remaining: remainingA,
        pressure: pressureA,
        order: orderState(pressureA, initialTotalA, remainingA),
        lossesByUnit: compositionLosses("LAND", compositionA, nextA)
      },
      sideB: {
        clash: rollB.clash,
        damage: rollB.damage,
        lost: resolution.lossB,
        remaining: remainingB,
        pressure: pressureB,
        order: orderState(pressureB, initialTotalB, remainingB),
        lossesByUnit: compositionLosses("LAND", compositionB, nextB)
      }
    });
    compositionA = nextA;
    compositionB = nextB;
    if (!brokenA && !brokenB) continue;
    winner = brokenA === brokenB ? (remainingA === remainingB ? null : remainingA > remainingB ? "A" : "B") : brokenA ? "B" : "A";
    break;
  }

  if (rounds.length === MAX_ROUNDS && winner === null) {
    const totalA = compositionTotal(compositionA);
    const totalB = compositionTotal(compositionB);
    winner = totalA === totalB ? null : totalA > totalB ? "A" : "B";
  }
  const remainingTotalA = compositionTotal(compositionA);
  const remainingTotalB = compositionTotal(compositionB);
  return {
    mode: "LAND" as const,
    terrain,
    terrainLabel: BATTLE_TERRAINS[terrain].label,
    roundCount: rounds.length,
    reachedRoundLimit: rounds.length === MAX_ROUNDS && !battleEnds(pressureA, initialTotalA, remainingTotalA) && !battleEnds(pressureB, initialTotalB, remainingTotalB),
    winner,
    winnerName: winner === "A" ? sideAName : winner === "B" ? sideBName : null,
    sides: {
      A: { name: sideAName, initialTotal: initialTotalA, lostTotal: initialTotalA - remainingTotalA, remainingTotal: remainingTotalA, pressure: pressureA, order: orderState(pressureA, initialTotalA, remainingTotalA), units: finalLandUnits(initialA, compositionA) },
      B: { name: sideBName, initialTotal: initialTotalB, lostTotal: initialTotalB - remainingTotalB, remainingTotal: remainingTotalB, pressure: pressureB, order: orderState(pressureB, initialTotalB, remainingTotalB), units: finalLandUnits(initialB, compositionB) }
    },
    rounds
  };
}

function makeHulls(side: "A" | "B", composition: BattleComposition): NavalHullState[] {
  const hulls: NavalHullState[] = [];
  for (const key of NAVAL_KEYS) {
    const quantity = Math.max(0, Math.floor(composition[key] ?? 0));
    for (let index = 0; index < quantity; index += 1) {
      hulls.push({ id: `${side}-${key}-${index + 1}`, shipType: key, maxHp: NAVAL_HULL_STATS[key].maxHp, currentHp: NAVAL_HULL_STATS[key].maxHp, disabledRound: null, sunkRound: null });
    }
  }
  return hulls;
}

function navalComposition(hulls: NavalHullState[], activeOnly: boolean): BattleComposition {
  const result: BattleComposition = {};
  for (const hull of hulls) {
    if (hull.sunkRound !== null || hull.currentHp <= 0 || (activeOnly && !isHullOperational(hull))) continue;
    result[hull.shipType] = (result[hull.shipType] ?? 0) + 1;
  }
  return result;
}

function navalMetrics(initial: NavalHullState[], current: NavalHullState[]): NavalFleetConditionInput {
  const operational = current.filter(isHullOperational);
  return {
    initialHullHp: initial.reduce((sum, hull) => sum + hull.maxHp, 0),
    operationalHullHp: operational.reduce((sum, hull) => sum + hull.currentHp, 0),
    initialShips: initial.length,
    activeShips: operational.length,
    disabledShips: current.filter((hull) => hull.sunkRound === null && hull.currentHp > 0 && !isHullOperational(hull)).length,
    sunkShips: current.filter((hull) => hull.sunkRound !== null || hull.currentHp <= 0).length
  };
}

function navalStateByType(hulls: NavalHullState[], key: NavalUnitType) {
  const relevant = hulls.filter((hull) => hull.shipType === key);
  return {
    remaining: relevant.filter((hull) => hull.sunkRound === null && hull.currentHp > 0).length,
    active: relevant.filter(isHullOperational).length,
    disabled: relevant.filter((hull) => hull.sunkRound === null && hull.currentHp > 0 && !isHullOperational(hull)).length
  };
}

function newlySunkByType(before: NavalHullState[], after: NavalHullState[]): Array<{ key: string; label: string; lost: number }> {
  return NAVAL_KEYS.flatMap((key) => {
    const count = after.filter((hull) => hull.shipType === key && hull.sunkRound !== null).length
      - before.filter((hull) => hull.shipType === key && hull.sunkRound !== null).length;
    if (count <= 0) return [];
    return [{ key, label: NAVAL_UNIT_STATS[key].label, lost: count }];
  });
}

function newlyDisabledByType(before: NavalHullState[], after: NavalHullState[]): Array<{ key: string; label: string; disabled: number }> {
  return NAVAL_KEYS.flatMap((key) => {
    const count = after.filter((hull) => hull.shipType === key && hull.disabledRound !== null).length
      - before.filter((hull) => hull.shipType === key && hull.disabledRound !== null).length;
    if (count <= 0) return [];
    return [{ key, label: NAVAL_UNIT_STATS[key].label, disabled: count }];
  });
}

function finalNavalUnits(initial: BattleComposition, hulls: NavalHullState[]): UnitResult[] {
  return NAVAL_KEYS.flatMap((key) => {
    const initialQuantity = Math.floor(initial[key] ?? 0);
    if (initialQuantity <= 0) return [];
    const state = navalStateByType(hulls, key);
    return [{ key, label: NAVAL_UNIT_STATS[key].label, initial: initialQuantity, lost: initialQuantity - state.remaining, remaining: state.remaining, active: state.active, disabled: state.disabled }];
  });
}

function runNavalSimulation(
  sideAName: string,
  sideBName: string,
  initialA: BattleComposition,
  initialB: BattleComposition,
  randomInt?: (max: number) => number
) {
  const random = randomInt ?? ((max: number) => Math.floor(Math.random() * max));
  const initialHullsA = makeHulls("A", initialA);
  const initialHullsB = makeHulls("B", initialB);
  let hullsA = initialHullsA.map((hull) => ({ ...hull }));
  let hullsB = initialHullsB.map((hull) => ({ ...hull }));
  let winner: SimulationWinner = null;
  const rounds: SimulationRound[] = [];

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const beforeA = hullsA;
    const beforeB = hullsB;
    const rollA = rollNavalPool(navalComposition(beforeA, true), random);
    const rollB = rollNavalPool(navalComposition(beforeB, true), random);
    const factors = roundDamageFactors(rollA.clash, rollB.clash);
    const damageToA = applyNavalHullDamage(beforeA, rollB.damage * factors.factorB, round);
    const damageToB = applyNavalHullDamage(beforeB, rollA.damage * factors.factorA, round);
    hullsA = damageToA.hulls;
    hullsB = damageToB.hulls;
    const metricsA = navalMetrics(initialHullsA, hullsA);
    const metricsB = navalMetrics(initialHullsB, hullsB);
    rounds.push({
      round,
      tier: factors.tier,
      winner: factors.winner,
      sideA: {
        clash: rollA.clash,
        damage: rollA.damage,
        lost: damageToA.newlySunk,
        disabled: damageToA.newlyDisabled,
        remaining: metricsA.initialShips - metricsA.sunkShips,
        active: metricsA.activeShips,
        condition: navalFleetCondition(metricsA),
        lossesByUnit: newlySunkByType(beforeA, hullsA),
        disabledByUnit: newlyDisabledByType(beforeA, hullsA)
      },
      sideB: {
        clash: rollB.clash,
        damage: rollB.damage,
        lost: damageToB.newlySunk,
        disabled: damageToB.newlyDisabled,
        remaining: metricsB.initialShips - metricsB.sunkShips,
        active: metricsB.activeShips,
        condition: navalFleetCondition(metricsB),
        lossesByUnit: newlySunkByType(beforeB, hullsB),
        disabledByUnit: newlyDisabledByType(beforeB, hullsB)
      }
    });
    const withdrawA = navalFleetMustWithdraw(metricsA);
    const withdrawB = navalFleetMustWithdraw(metricsB);
    if (!withdrawA && !withdrawB) continue;
    winner = withdrawA === withdrawB ? null : withdrawA ? "B" : "A";
    break;
  }

  const metricsA = navalMetrics(initialHullsA, hullsA);
  const metricsB = navalMetrics(initialHullsB, hullsB);
  if (rounds.length === MAX_ROUNDS && winner === null) {
    winner = metricsA.activeShips === metricsB.activeShips ? null : metricsA.activeShips > metricsB.activeShips ? "A" : "B";
  }
  return {
    mode: "NAVAL" as const,
    terrain: "NAVAL" as const,
    terrainLabel: BATTLE_TERRAINS.NAVAL.label,
    roundCount: rounds.length,
    reachedRoundLimit: rounds.length === MAX_ROUNDS && !navalFleetMustWithdraw(metricsA) && !navalFleetMustWithdraw(metricsB),
    winner,
    winnerName: winner === "A" ? sideAName : winner === "B" ? sideBName : null,
    sides: {
      A: { name: sideAName, initialTotal: metricsA.initialShips, lostTotal: metricsA.sunkShips, remainingTotal: metricsA.initialShips - metricsA.sunkShips, activeTotal: metricsA.activeShips, disabledTotal: metricsA.disabledShips, initialHullHp: metricsA.initialHullHp, operationalHullHp: metricsA.operationalHullHp, condition: navalFleetCondition(metricsA), units: finalNavalUnits(initialA, hullsA) },
      B: { name: sideBName, initialTotal: metricsB.initialShips, lostTotal: metricsB.sunkShips, remainingTotal: metricsB.initialShips - metricsB.sunkShips, activeTotal: metricsB.activeShips, disabledTotal: metricsB.disabledShips, initialHullHp: metricsB.initialHullHp, operationalHullHp: metricsB.operationalHullHp, condition: navalFleetCondition(metricsB), units: finalNavalUnits(initialB, hullsB) }
    },
    rounds
  };
}

export const battleSimulationService = {
  catalog() {
    return {
      landUnits: LAND_KEYS.map((key) => ({ key, ...BATTLE_UNIT_STATS[key] })),
      navalUnits: NAVAL_KEYS.map((key) => ({ key, ...NAVAL_UNIT_STATS[key], maxHp: NAVAL_HULL_STATS[key].maxHp })),
      terrains: LAND_TERRAINS.map((key) => ({ key, ...BATTLE_TERRAINS[key] })),
      limits: { maxRounds: MAX_ROUNDS, maxLandForce: MAX_LAND_FORCE, maxNavalForce: MAX_NAVAL_FORCE }
    };
  },

  simulate(rawInput: unknown, randomInt?: (max: number) => number) {
    const input: BattleSimulationInput = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? rawInput as BattleSimulationInput
      : {};
    const mode: BattleSimulationMode = input.mode === "NAVAL" ? "NAVAL" : input.mode === "LAND" ? "LAND" : (() => { throw new Error("Savaş türü kara veya deniz olmalıdır."); })();
    const sideAName = safeName(input.sideA?.name, "A Tarafı");
    const sideBName = safeName(input.sideB?.name, "B Tarafı");
    const compositionA = parseComposition(mode, input.sideA?.units);
    const compositionB = parseComposition(mode, input.sideB?.units);
    if (mode === "NAVAL") return runNavalSimulation(sideAName, sideBName, compositionA, compositionB, randomInt);
    const terrain = typeof input.terrain === "string" && LAND_TERRAINS.includes(input.terrain as BattleTerrain)
      ? input.terrain as BattleTerrain
      : "OPEN_PLAIN";
    return runLandSimulation(terrain, sideAName, sideBName, compositionA, compositionB, randomInt);
  }
};
