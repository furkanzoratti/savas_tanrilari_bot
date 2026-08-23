import { UNITS } from "./catalog.js";

export const BATTLE_TERRAINS = {
  OPEN_PLAIN: { label: "Açık Ova", frontageA: 30_000, frontageB: 30_000, preset: "open-plain.png" },
  AMBUSH: { label: "Pusu", frontageA: 15_000, frontageB: 8_000, preset: "ambush.png" },
  DESERT: { label: "Çöl", frontageA: 35_000, frontageB: 35_000, preset: "desert.png" },
  FOREST: { label: "Orman", frontageA: 15_000, frontageB: 15_000, preset: "forest.png" },
  MARSH: { label: "Bataklık", frontageA: 10_000, frontageB: 10_000, preset: "marsh.png" },
  MOUNTAIN: { label: "Dağlık Arazi", frontageA: 12_000, frontageB: 12_000, preset: "mountain.png" },
  MOUNTAIN_PASS: { label: "Dağ Geçidi", frontageA: 6_000, frontageB: 6_000, preset: "mountain-pass.png" },
  RIVER_CROSSING: { label: "Nehir Geçişi", frontageA: 10_000, frontageB: 20_000, preset: "river-crossing.png" },
  SIEGE: { label: "Kuşatma", frontageA: 12_000, frontageB: 18_000, preset: "siege.png" },
  NAVAL: { label: "Deniz Savaşı", frontageA: 30, frontageB: 30, preset: "naval.png" }
} as const;

export type BattleTerrain = keyof typeof BATTLE_TERRAINS;
export type BattleSideKey = "A" | "B";
export type BattleController = "PLAYERS" | "GM";
export type BattleUnitType = Exclude<keyof typeof UNITS, "observer">;
export type NavalUnitType = "kerkouros" | "trireme" | "quinquereme";
export type SiegeAssetType = "ladder_group" | "ram" | "mantlet" | "ballista" | "wall_ballista" | "catapult" | "siege_tower";
export type BattleForceType = BattleUnitType | NavalUnitType;
export type BattleComposition = Partial<Record<BattleForceType, number>>;
export type SiegeComposition = Partial<Record<SiegeAssetType, number>>;
export type SiegeTarget = "WALL" | "GATE" | "ARMY" | "ASSAULT";
export type SiegeTargets = Partial<Record<SiegeAssetType, SiegeTarget>>;
export type BattleOrder = "ORDERED" | "WORN" | "SHAKEN" | "BROKEN";

export const MAX_BOMBARDMENTS_PER_GAME_TURN = 3;
export const remainingBombardments = (used: number): number => Math.max(0, MAX_BOMBARDMENTS_PER_GAME_TURN - Math.max(0, Math.floor(used)));

export const BATTLE_UNIT_STATS: Record<BattleUnitType, {
  label: string; clashDice: number; clashSides: number; damageDice: number; damageSides: number; durability: 1 | 2 | 3;
}> = {
  light_infantry: { label: "Hafif Piyade / Ciritçi", clashDice: 1, clashSides: 6, damageDice: 1, damageSides: 6, durability: 1 },
  slinger: { label: "Sapancı", clashDice: 1, clashSides: 6, damageDice: 1, damageSides: 8, durability: 1 },
  spear: { label: "Mızraklı Piyade", clashDice: 1, clashSides: 8, damageDice: 1, damageSides: 6, durability: 2 },
  archer: { label: "Okçu", clashDice: 1, clashSides: 8, damageDice: 1, damageSides: 10, durability: 1 },
  heavy_infantry: { label: "Ağır Piyade", clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 8, durability: 3 },
  light_cavalry: { label: "Hafif Süvari", clashDice: 2, clashSides: 6, damageDice: 1, damageSides: 8, durability: 2 },
  heavy_cavalry: { label: "Ağır Süvari", clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 10, durability: 3 }
};

export const NAVAL_UNIT_STATS: Record<NavalUnitType, {
  label: string; clashDice: number; clashSides: number; damageDice: number; damageSides: number; durability: 1 | 2 | 3;
}> = {
  kerkouros: { label: "Kerkouros", clashDice: 1, clashSides: 6, damageDice: 1, damageSides: 6, durability: 1 },
  trireme: { label: "Trireme", clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 8, durability: 2 },
  quinquereme: { label: "Quinquereme", clashDice: 3, clashSides: 10, damageDice: 3, damageSides: 10, durability: 3 }
};

export const SIEGE_ASSET_BATTLE_STATS: Record<SiegeAssetType, { label: string }> = {
  ladder_group: { label: "Merdiven Grubu" }, ram: { label: "Koçbaşı" }, mantlet: { label: "Mantlet Grubu" },
  ballista: { label: "Balista" }, wall_ballista: { label: "Hafif Sur Balistası" }, catapult: { label: "Katapult" }, siege_tower: { label: "Kuşatma Kulesi" }
};
export interface BattleRoll {
  clash: number;
  damage: number;
  detail: Record<string, { engaged: number; clash: number; damage: number }>;
}

export interface RoundResolution {
  tier: "BALANCED" | "MINOR" | "CLEAR" | "CRUSHING";
  winner: BattleSideKey | null;
  lossA: number;
  lossB: number;
  remainingA: BattleComposition;
  remainingB: BattleComposition;
  pressureDeltaA: number;
  pressureDeltaB: number;
}

const unitKeys = Object.keys(BATTLE_UNIT_STATS) as BattleUnitType[];
const navalKeys = Object.keys(NAVAL_UNIT_STATS) as NavalUnitType[];
export const compositionTotal = (composition: BattleComposition): number => Object.values(composition).reduce<number>((sum, value) => sum + Math.max(0, value ?? 0), 0);

export function engagedComposition(composition: BattleComposition, frontage: number): BattleComposition {
  const total = compositionTotal(composition);
  if (total <= frontage) return { ...composition };
  const scale = frontage / total;
  const result: BattleComposition = {};
  let used = 0;
  for (const key of unitKeys) {
    const quantity = composition[key] ?? 0;
    const engaged = Math.floor(quantity * scale);
    if (engaged > 0) result[key] = engaged;
    used += engaged;
  }
  let rest = frontage - used;
  for (const key of unitKeys) {
    if (rest <= 0) break;
    const available = (composition[key] ?? 0) - (result[key] ?? 0);
    const add = Math.min(rest, Math.max(0, available));
    if (add > 0) result[key] = (result[key] ?? 0) + add;
    rest -= add;
  }
  return result;
}

function rollPool(quantity: number, dice: number, sides: number, randomInt: (max: number) => number, blockSize = 1_000): number {
  const full = Math.floor(quantity / blockSize);
  const remainder = quantity % blockSize;
  let total = 0;
  for (let block = 0; block < full; block += 1) for (let die = 0; die < dice; die += 1) total += randomInt(sides) + 1;
  if (remainder > 0) {
    let partial = 0;
    for (let die = 0; die < dice; die += 1) partial += randomInt(sides) + 1;
    total += Math.max(1, Math.round(partial * remainder / blockSize));
  }
  return total;
}

export function rollBattlePool(composition: BattleComposition, frontage: number, randomInt = (max: number) => Math.floor(Math.random() * max)): BattleRoll {
  const engaged = engagedComposition(composition, frontage);
  const detail: BattleRoll["detail"] = {};
  let clash = 0;
  let damage = 0;
  for (const key of unitKeys) {
    const quantity = engaged[key] ?? 0;
    if (!quantity) continue;
    const stats = BATTLE_UNIT_STATS[key];
    const unitClash = rollPool(quantity, stats.clashDice, stats.clashSides, randomInt);
    const unitDamage = rollPool(quantity, stats.damageDice, stats.damageSides, randomInt);
    clash += unitClash;
    damage += unitDamage;
    detail[key] = { engaged: quantity, clash: unitClash, damage: unitDamage };
  }
  return { clash, damage, detail };
}

export function rollNavalPool(composition: BattleComposition, frontage: number, randomInt = (max: number) => Math.floor(Math.random() * max)): BattleRoll {
  const total = compositionTotal(composition);
  const scale = total > frontage ? frontage / total : 1;
  const detail: BattleRoll["detail"] = {};
  let clash = 0;
  let damage = 0;
  for (const key of navalKeys) {
    const quantity = Math.floor((composition[key] ?? 0) * scale);
    if (!quantity) continue;
    const stats = NAVAL_UNIT_STATS[key];
    const unitClash = rollPool(quantity, stats.clashDice, stats.clashSides, randomInt, 1);
    const unitDamage = rollPool(quantity, stats.damageDice, stats.damageSides, randomInt, 1);
    clash += unitClash; damage += unitDamage;
    detail[key] = { engaged: quantity, clash: unitClash, damage: unitDamage };
  }
  return { clash, damage, detail };
}

export function rollSiegeSupport(
  composition: SiegeComposition, targets: SiegeTargets = {}, randomInt = (max: number) => Math.floor(Math.random() * max)
): { clash: number; damage: number; wallDamage: number; gateDamage: number; defense: number; detail: Record<string, number | string> } {
  const roll = (count: number, dice: number, sides: number) => rollPool(Math.min(count, 25), dice, sides, randomInt, 1);
  const ladder = composition.ladder_group ?? 0, ram = composition.ram ?? 0, mantlet = composition.mantlet ?? 0;
  const ballista = composition.ballista ?? 0, wallBallista = composition.wall_ballista ?? 0, catapult = composition.catapult ?? 0, tower = composition.siege_tower ?? 0;
  const ladderClash = roll(ladder, 1, 4), towerClash = roll(tower, 1, 10), mantletClash = roll(mantlet, 1, 4);
  const ballistaRoll = roll(ballista, 1, 8), wallBallistaDamage = roll(wallBallista, 2, 8), catapultRoll = roll(catapult, 1, 10), towerDamage = roll(tower, 1, 6);
  const ramGate = roll(ram, 1, 8) * 35;
  const ballistaWall = targets.ballista === "WALL" ? roll(ballista, 1, 6) * 5 : 0;
  const catapultWall = targets.catapult === "WALL" ? roll(catapult, 2, 10) * 20 : 0;
  const ballistaArmy = targets.ballista === "ARMY" ? ballistaRoll : 0;
  const catapultArmy = targets.catapult === "ARMY" ? catapultRoll : 0;
  return {
    clash: ladderClash + towerClash + mantletClash,
    damage: ballistaArmy + wallBallistaDamage + catapultArmy + towerDamage,
    wallDamage: ballistaWall + catapultWall,
    gateDamage: ramGate,
    defense: Math.min(0.50, mantlet * 0.05),
    detail: {
      ladderClash, towerClash, mantletClash, ballistaArmy, wallBallistaDamage, catapultArmy, towerDamage,
      ramGate, ballistaWall, catapultWall, ballistaTarget: targets.ballista ?? "WALL", catapultTarget: targets.catapult ?? "WALL"
    }
  };
}
export function advantageTier(a: number, b: number): { tier: RoundResolution["tier"]; winner: BattleSideKey | null } {
  if (a === b) return { tier: "BALANCED", winner: null };
  const winner: BattleSideKey = a > b ? "A" : "B";
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const ratio = low === 0 ? Infinity : (high - low) / low;
  if (ratio < 0.10) return { tier: "BALANCED", winner: null };
  if (ratio < 0.25) return { tier: "MINOR", winner };
  if (ratio < 0.50) return { tier: "CLEAR", winner };
  return { tier: "CRUSHING", winner };
}

const multipliers = {
  BALANCED: { winner: 0.80, loser: 0.80 }, MINOR: { winner: 1.00, loser: 0.70 },
  CLEAR: { winner: 1.15, loser: 0.50 }, CRUSHING: { winner: 1.30, loser: 0.30 }
} as const;

function applyLoss(composition: BattleComposition, rawDamage: number, mode: "LAND" | "NAVAL"): { remaining: BattleComposition; loss: number } {
  const result: BattleComposition = { ...composition };
  const keys: BattleForceType[] = mode === "NAVAL" ? navalKeys : unitKeys;
  const durabilityFor = (key: BattleForceType) => mode === "NAVAL" ? NAVAL_UNIT_STATS[key as NavalUnitType].durability : BATTLE_UNIT_STATS[key as BattleUnitType].durability;
  const weights = keys.map((key) => {
    const quantity = composition[key] ?? 0;
    const durability = durabilityFor(key);
    return { key, quantity, weight: quantity * ({ 1: 1, 2: 0.85, 3: 0.70 }[durability]) };
  }).filter((entry) => entry.quantity > 0);
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight || rawDamage <= 0) return { remaining: result, loss: 0 };
  let totalLoss = 0;
  for (const entry of weights) {
    const allocated = rawDamage * entry.weight / totalWeight;
    const durabilityMultiplier = { 1: 1, 2: 0.85, 3: 0.70 }[durabilityFor(entry.key)];
    const loss = Math.min(entry.quantity, Math.max(0, Math.round(allocated * durabilityMultiplier)));
    result[entry.key] = entry.quantity - loss;
    totalLoss += loss;
  }
  return { remaining: result, loss: totalLoss };
}

export function resolveRound(
  compositionA: BattleComposition, compositionB: BattleComposition, rollA: BattleRoll, rollB: BattleRoll,
  options: { mode?: "LAND" | "NAVAL"; damageFactorA?: number; damageFactorB?: number } = {}
): RoundResolution {
  const mode = options.mode ?? "LAND";
  const outcome = advantageTier(rollA.clash, rollB.clash);
  const multi = multipliers[outcome.tier];
  const factorA = (outcome.winner === "A" ? multi.winner : outcome.winner === "B" ? multi.loser : multi.winner) * (options.damageFactorA ?? 1);
  const factorB = (outcome.winner === "B" ? multi.winner : outcome.winner === "A" ? multi.loser : multi.winner) * (options.damageFactorB ?? 1);
  const scale = mode === "NAVAL" ? 0.012 : 20;
  const againstB = applyLoss(compositionB, rollA.damage * scale * factorA, mode);
  const againstA = applyLoss(compositionA, rollB.damage * scale * factorB, mode);
  const pressure = outcome.tier === "MINOR" ? 1 : outcome.tier === "CLEAR" ? 2 : outcome.tier === "CRUSHING" ? 3 : 0;
  return {
    tier: outcome.tier, winner: outcome.winner,
    lossA: againstA.loss, lossB: againstB.loss,
    remainingA: againstA.remaining, remainingB: againstB.remaining,
    pressureDeltaA: outcome.winner === "B" ? pressure : outcome.winner === "A" ? -1 : 0,
    pressureDeltaB: outcome.winner === "A" ? pressure : outcome.winner === "B" ? -1 : 0
  };
}
export function siegeDefenseModifiers(wallHp: number, gateHp: number): { defenderClash: number; defenderDamage: number; attackerDamage: number } {
  if (wallHp > 0 && gateHp > 0) return { defenderClash: 1.50, defenderDamage: 1.35, attackerDamage: 0.50 };
  if (wallHp > 0 || gateHp > 0) return { defenderClash: 1.25, defenderDamage: 1.15, attackerDamage: 0.75 };
  return { defenderClash: 1.10, defenderDamage: 1.00, attackerDamage: 1.00 };
}

export function siegeDefenderCaptured(initial: number, remaining: number, pressure: number, wallHp: number, gateHp: number, assaultAccess = false): boolean {
  const access = wallHp <= 0 || gateHp <= 0 || assaultAccess;
  return access && (remaining <= Math.floor(initial * 0.30) || pressure >= 8 || remaining <= 0);
}

export function baseRetreatRate(roundNumber: number): number {
  if (roundNumber <= 1) return 0;
  return 0.05 + Math.min(0.09, Math.max(0, roundNumber - 2) * 0.03);
}
export function orderState(pressure: number, initial: number, remaining: number): BattleOrder {
  const casualtyRate = initial > 0 ? 1 - remaining / initial : 1;
  if (pressure >= 6 || casualtyRate >= 0.40 || remaining <= 0) return "BROKEN";
  if (pressure >= 4 || casualtyRate >= 0.30) return "SHAKEN";
  if (pressure >= 2 || casualtyRate >= 0.10) return "WORN";
  return "ORDERED";
}

export const battleEnds = (pressure: number, initial: number, remaining: number): boolean => orderState(pressure, initial, remaining) === "BROKEN";

