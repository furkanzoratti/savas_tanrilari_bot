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
  SIEGE: { label: "Kuşatma", frontageA: 20_000, frontageB: 23_000, preset: "siege.png" },
  NAVAL: { label: "Deniz Savaşı", frontageA: Number.MAX_SAFE_INTEGER, frontageB: Number.MAX_SAFE_INTEGER, preset: "naval.png" }
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
export type BattleOrder = "ORDERED" | "WORN" | "SHAKEN" | "CRITICAL" | "BROKEN";

export const MAX_BOMBARDMENTS_PER_GAME_TURN = 4;
export const BASE_SIEGE_STARVATION_TURNS = 6;
export const FIELD_BATTLE_PRESSURE_LIMIT = 10;
export const SIEGE_PRESSURE_LIMIT = 12;
export const remainingBombardments = (used: number): number => Math.max(0, MAX_BOMBARDMENTS_PER_GAME_TURN - Math.max(0, Math.floor(used)));
export const SIEGE_ASSAULT_FRONTAGE = 15_000;
export const SIEGE_RANGED_SUPPORT_FRONTAGE = 5_000;
export const SIEGE_TOTAL_ASSAULT_FRONTAGE = SIEGE_ASSAULT_FRONTAGE + SIEGE_RANGED_SUPPORT_FRONTAGE;
export const SIEGE_GATE_BREACH_INFANTRY_BONUS = 5_000;
export const SIEGE_WALL_BREACH_INFANTRY_BONUS = 10_000;
export const SIEGE_FULL_BREACH_INFANTRY_BONUS = 15_000;
export const SIEGE_GATE_BREACH_FRONTAGE = SIEGE_ASSAULT_FRONTAGE + SIEGE_GATE_BREACH_INFANTRY_BONUS;
export const SIEGE_GATE_BREACH_TOTAL_FRONTAGE = SIEGE_GATE_BREACH_FRONTAGE + SIEGE_RANGED_SUPPORT_FRONTAGE;
export const SIEGE_WALL_BREACH_FRONTAGE = SIEGE_ASSAULT_FRONTAGE + SIEGE_WALL_BREACH_INFANTRY_BONUS;
export const SIEGE_FULL_BREACH_FRONTAGE = SIEGE_ASSAULT_FRONTAGE + SIEGE_FULL_BREACH_INFANTRY_BONUS;
export const SIEGE_BREACHED_RANGED_SUPPORT_FRONTAGE = 10_000;
export const SIEGE_DEFENDER_INTACT_INFANTRY_FRONTAGE = 18_000;
export const SIEGE_DEFENDER_GATE_BREACH_INFANTRY_FRONTAGE = 20_500;
export const SIEGE_DEFENDER_WALL_BREACH_INFANTRY_FRONTAGE = 23_000;
export const LADDER_GROUP_ASSAULT_CAPACITY = 1_000;
export const SIEGE_TOWER_ASSAULT_CAPACITY = 3_000;

export type SiegeFortificationState = "INTACT" | "GATE_BREACHED" | "WALL_BREACHED" | "FULLY_BREACHED";

export interface SiegeFrontageProfile {
  state: SiegeFortificationState;
  attackerInfantry: number;
  attackerRanged: number;
  defenderInfantry: number;
  defenderRanged: number;
}

export function siegeFortificationState(wallHp: number, gateHp: number): SiegeFortificationState {
  const wallBreached = Math.max(0, wallHp) <= 0;
  const gateBreached = Math.max(0, gateHp) <= 0;
  if (wallBreached && gateBreached) return "FULLY_BREACHED";
  if (wallBreached) return "WALL_BREACHED";
  if (gateBreached) return "GATE_BREACHED";
  return "INTACT";
}

export function siegeFrontageProfile(wallHp: number, gateHp: number): SiegeFrontageProfile {
  const state = siegeFortificationState(wallHp, gateHp);
  if (state === "FULLY_BREACHED") return {
    state,
    attackerInfantry: SIEGE_FULL_BREACH_FRONTAGE,
    attackerRanged: SIEGE_RANGED_SUPPORT_FRONTAGE,
    defenderInfantry: SIEGE_DEFENDER_WALL_BREACH_INFANTRY_FRONTAGE,
    defenderRanged: SIEGE_BREACHED_RANGED_SUPPORT_FRONTAGE
  };
  if (state === "WALL_BREACHED") return {
    state,
    attackerInfantry: SIEGE_WALL_BREACH_FRONTAGE,
    attackerRanged: SIEGE_RANGED_SUPPORT_FRONTAGE,
    defenderInfantry: SIEGE_DEFENDER_WALL_BREACH_INFANTRY_FRONTAGE,
    defenderRanged: SIEGE_BREACHED_RANGED_SUPPORT_FRONTAGE
  };
  if (state === "GATE_BREACHED") return {
    state,
    attackerInfantry: SIEGE_GATE_BREACH_FRONTAGE,
    attackerRanged: SIEGE_RANGED_SUPPORT_FRONTAGE,
    defenderInfantry: SIEGE_DEFENDER_GATE_BREACH_INFANTRY_FRONTAGE,
    defenderRanged: SIEGE_RANGED_SUPPORT_FRONTAGE
  };
  return {
    state,
    attackerInfantry: SIEGE_ASSAULT_FRONTAGE,
    attackerRanged: SIEGE_RANGED_SUPPORT_FRONTAGE,
    defenderInfantry: SIEGE_DEFENDER_INTACT_INFANTRY_FRONTAGE,
    defenderRanged: SIEGE_RANGED_SUPPORT_FRONTAGE
  };
}

export function commanderClashBonus(skillBonus: number): number {
  return Math.min(3, Math.max(0, Math.floor(skillBonus)));
}

export const BATTLE_UNIT_STATS: Record<BattleUnitType, {
  label: string; clashDice: number; clashSides: number; damageDice: number; damageSides: number; durability: 1 | 2 | 3;
}> = {
  light_infantry: { label: "Hafif Piyade / Ciritçi", clashDice: 1, clashSides: 4, damageDice: 1, damageSides: 6, durability: 1 },
  militia: { label: "Milis", clashDice: 1, clashSides: 4, damageDice: 1, damageSides: 4, durability: 1 },
  slinger: { label: "Sapancı", clashDice: 1, clashSides: 6, damageDice: 1, damageSides: 8, durability: 1 },
  spear: { label: "Mızraklı Piyade", clashDice: 1, clashSides: 8, damageDice: 1, damageSides: 6, durability: 2 },
  archer: { label: "Okçu", clashDice: 1, clashSides: 8, damageDice: 1, damageSides: 12, durability: 1 },
  heavy_infantry: { label: "Ağır Piyade", clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 8, durability: 3 },
  light_cavalry: { label: "Hafif Süvari", clashDice: 2, clashSides: 6, damageDice: 1, damageSides: 8, durability: 2 },
  heavy_cavalry: { label: "Ağır Süvari", clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 10, durability: 3 },
  legionary: { label: "Lejyoner", clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 8, durability: 3 },
  hoplite: { label: "Hoplit", clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 12, durability: 3 },
  horse_archer: { label: "Atlı Okçu", clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 8, durability: 2 },
  camel_cavalry: { label: "Deve Süvarisi", clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 10, durability: 2 },
  briton_longbow: { label: "Briton Uzun Yaycıları", clashDice: 1, clashSides: 12, damageDice: 2, damageSides: 12, durability: 1 },
  persian_immortal: { label: "Pers Ölümsüzleri", clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 10, durability: 3 },
  carthaginian_war_elephant: { label: "Kartaca Savaş Filleri", clashDice: 3, clashSides: 10, damageDice: 2, damageSides: 10, durability: 3 },
  iberian_caetrati: { label: "İber Caetratileri", clashDice: 2, clashSides: 6, damageDice: 2, damageSides: 8, durability: 1 },
  germanic_shock_warrior: { label: "Cermen Şok Savaşçıları", clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 8, durability: 1 },
  anatolian_thureophoroi: { label: "Anadolu Kalkanlıları (Thureophoroi)", clashDice: 2, clashSides: 6, damageDice: 1, damageSides: 10, durability: 2 },
  triarii_veteran: { label: "Triarii Gazileri", clashDice: 2, clashSides: 6, damageDice: 1, damageSides: 8, durability: 2 },
  punic_veteran: { label: "Pön Gazileri", clashDice: 3, clashSides: 6, damageDice: 2, damageSides: 8, durability: 3 },
  gaesatae: { label: "Gaesatae", clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 8, durability: 2 },
  peltast: { label: "Peltastlar", clashDice: 1, clashSides: 8, damageDice: 1, damageSides: 8, durability: 1 },
  silver_shield: { label: "Gümüş Kalkanlılar", clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 10, durability: 3 },
  machimoi_phalangitai: { label: "Machimoi Phalangitai", clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 10, durability: 3 },
  mauryan_war_elephant: { label: "Maurya Savaş Filleri", clashDice: 3, clashSides: 12, damageDice: 2, damageSides: 12, durability: 3 },
  desert_raider: { label: "Çöl Akıncıları", clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 8, durability: 2 },
  egyptian_war_chariot: { label: "Chariot", clashDice: 2, clashSides: 12, damageDice: 2, damageSides: 12, durability: 2 },
  germanic_companion_cavalry: { label: "Cermen Atlı Yoldaşları", clashDice: 2, clashSides: 10, damageDice: 2, damageSides: 8, durability: 2 },
  balearic_slinger: { label: "Balear Sapancıları", clashDice: 1, clashSides: 10, damageDice: 2, damageSides: 10, durability: 1 },
  sarmatian_longswordsmen: { label: "Sarmat Uzun Kılıçlıları", clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 10, durability: 2 },
  briton_noble_spearmen: { label: "Briton Asil Mızraklıları", clashDice: 2, clashSides: 8, damageDice: 1, damageSides: 10, durability: 2 }
};

export const NAVAL_UNIT_STATS: Record<NavalUnitType, {
  label: string; clashDice: number; clashSides: number; damageDice: number; damageSides: number; durability: 1 | 2 | 3;
}> = {
  kerkouros: { label: "Kerkouros", clashDice: 1, clashSides: 6, damageDice: 1, damageSides: 12, durability: 1 },
  trireme: { label: "Trireme", clashDice: 2, clashSides: 8, damageDice: 2, damageSides: 12, durability: 2 },
  quinquereme: { label: "Quinquereme", clashDice: 3, clashSides: 10, damageDice: 3, damageSides: 12, durability: 3 }
};

export const SIEGE_ASSET_BATTLE_STATS: Record<SiegeAssetType, { label: string }> = {
  ladder_group: { label: "Merdiven Grubu" }, ram: { label: "Koçbaşı" }, mantlet: { label: "Mantlet Grubu" },
  ballista: { label: "Balista" }, wall_ballista: { label: "Hafif Sur Balistası" }, catapult: { label: "Katapult" }, siege_tower: { label: "Kuşatma Kulesi" }
};
export interface BattleRoll {
  clash: number;
  damage: number;
  detail: Record<string, { engaged: number; clash: number; damage: number }>;
  composition?: ArmyCompositionAssessment;
  antiCavalryDamage?: number;
  counter?: SpearCavalryCounterAssessment;
}

export interface SpearCavalryCounterAssessment {
  effectiveSpears: number;
  effectiveEnemyCavalry: number;
  matched: number;
  coverage: number;
  mobileCoverage: number;
  clashBonus: number;
  antiCavalryDamage: number;
}

export interface BattleCounterContext {
  opponentComposition: BattleComposition;
  opponentFrontage: number;
}

export type ArmyCompositionTier = "MONOTYPE" | "LIMITED" | "STANDARD" | "BALANCED" | "EXCELLENT";
export type ArmyCompositionContext = "FIELD" | "SIEGE_RESTRICTED";

export interface ArmyCompositionAssessment {
  tier: ArmyCompositionTier;
  label: string;
  clashMultiplier: number;
  damageMultiplier: number;
  dominantUnitShare: number;
  meaningfulUnitCount: number;
  roleShares: Record<"line" | "spear" | "ranged" | "mobile", number>;
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
  pressureTier: "BALANCED" | "MINOR" | "CLEAR" | "CRUSHING";
  pressureWinner: BattleSideKey | null;
}

const unitKeys = Object.keys(BATTLE_UNIT_STATS) as BattleUnitType[];
const navalKeys = Object.keys(NAVAL_UNIT_STATS) as NavalUnitType[];
export const compositionTotal = (composition: BattleComposition): number => Object.values(composition).reduce<number>((sum, value) => sum + Math.max(0, value ?? 0), 0);

export const ASSAULT_UNIT_TYPES = [
  "light_infantry", "militia", "spear", "heavy_infantry", "legionary", "hoplite",
  "persian_immortal", "iberian_caetrati", "germanic_shock_warrior", "anatolian_thureophoroi",
  "triarii_veteran", "punic_veteran", "gaesatae", "peltast", "silver_shield", "machimoi_phalangitai",
  "sarmatian_longswordsmen", "briton_noble_spearmen"
] as const satisfies readonly BattleUnitType[];

export const CAVALRY_UNIT_TYPES = [
  "light_cavalry", "heavy_cavalry", "horse_archer", "camel_cavalry", "carthaginian_war_elephant",
  "mauryan_war_elephant", "desert_raider", "egyptian_war_chariot", "germanic_companion_cavalry"
] as const satisfies readonly BattleUnitType[];

export function assaultUnitTotal(composition: BattleComposition): number {

  return ASSAULT_UNIT_TYPES.reduce((sum, key) => sum + Math.max(0, composition[key] ?? 0), 0);
}

const SIEGE_DEFENDER_DISMOUNT_MAP = {
  light_cavalry: "light_infantry",
  heavy_cavalry: "heavy_infantry",
  horse_archer: "archer",
  camel_cavalry: "spear",
  germanic_companion_cavalry: "heavy_infantry"
} as const satisfies Partial<Record<BattleUnitType, BattleUnitType>>;

export const SIEGE_ATTACKER_DISMOUNT_MAP = {
  light_cavalry: "light_infantry",
  heavy_cavalry: "heavy_infantry",
  horse_archer: "archer",
  camel_cavalry: "spear",
  germanic_companion_cavalry: "heavy_infantry"
} as const satisfies Partial<Record<BattleUnitType, BattleUnitType>>;
export type SiegeDismountUnitType = keyof typeof SIEGE_ATTACKER_DISMOUNT_MAP;

function dismountedQuantity(
  composition: BattleComposition,
  dismounted: BattleComposition,
  source: SiegeDismountUnitType
): number {
  return Math.min(
    Math.max(0, Math.floor(composition[source] ?? 0)),
    Math.max(0, Math.floor(dismounted[source] ?? 0))
  );
}

export function siegeAttackerDismountedComposition(
  composition: BattleComposition,
  dismounted: BattleComposition
): BattleComposition {
  const effective: BattleComposition = { ...composition };
  for (const [source, target] of Object.entries(SIEGE_ATTACKER_DISMOUNT_MAP) as Array<[SiegeDismountUnitType, BattleUnitType]>) {
    const quantity = dismountedQuantity(composition, dismounted, source);
    if (quantity <= 0) continue;
    const mountedRemaining = Math.max(0, (effective[source] ?? 0) - quantity);
    if (mountedRemaining > 0) effective[source] = mountedRemaining;
    else delete effective[source];
    effective[target] = (effective[target] ?? 0) + quantity;
  }
  return effective;
}

export function restoreSiegeAttackerCasualtyTypes(
  original: BattleComposition,
  effectiveCasualties: BattleComposition,
  dismounted: BattleComposition
): BattleComposition {
  const restored: BattleComposition = { ...effectiveCasualties };
  for (const [source, target] of Object.entries(SIEGE_ATTACKER_DISMOUNT_MAP) as Array<[SiegeDismountUnitType, BattleUnitType]>) {
    const converted = dismountedQuantity(original, dismounted, source);
    if (converted <= 0) continue;
    const native = Math.max(0, original[target] ?? 0);
    const targetTotal = native + converted;
    const engagedTarget = Math.max(0, effectiveCasualties[target] ?? 0);
    const convertedEngaged = targetTotal > 0
      ? Math.min(converted, Math.max(0, Math.round(engagedTarget * converted / targetTotal)))
      : 0;
    const nativeEngaged = Math.max(0, engagedTarget - convertedEngaged);
    if (nativeEngaged > 0) restored[target] = nativeEngaged;
    else delete restored[target];
    if (convertedEngaged > 0) restored[source] = convertedEngaged;
    else delete restored[source];
  }
  return restored;
}

export function siegeDefenderComposition(composition: BattleComposition): BattleComposition {
  const dismounted: BattleComposition = { ...composition };
  for (const [mountedType, infantryType] of Object.entries(SIEGE_DEFENDER_DISMOUNT_MAP) as Array<[BattleUnitType, BattleUnitType]>) {
    const quantity = Math.max(0, composition[mountedType] ?? 0);
    if (quantity <= 0) continue;
    dismounted[infantryType] = (dismounted[infantryType] ?? 0) + quantity;
    delete dismounted[mountedType];
  }
  return dismounted;
}

export function hasAssaultForce(composition: BattleComposition): boolean {
  return assaultUnitTotal(composition) > 0;
}

const COMPOSITION_TIERS: Record<ArmyCompositionTier, Pick<ArmyCompositionAssessment, "label" | "clashMultiplier" | "damageMultiplier">> = {
  MONOTYPE: { label: "Tekdüze Ordu", clashMultiplier: 0.85, damageMultiplier: 0.90 },
  LIMITED: { label: "Sınırlı Kompozisyon", clashMultiplier: 0.90, damageMultiplier: 0.95 },
  STANDARD: { label: "Standart Kompozisyon", clashMultiplier: 1.00, damageMultiplier: 1.00 },
  BALANCED: { label: "Dengeli Karma Ordu", clashMultiplier: 1.10, damageMultiplier: 1.05 },
  EXCELLENT: { label: "Mükemmel Kompozisyon", clashMultiplier: 1.15, damageMultiplier: 1.08 }
};

export const roleWeights: Record<BattleUnitType, Partial<Record<keyof ArmyCompositionAssessment["roleShares"], number>>> = {
  light_infantry: { line: 1 }, militia: { line: 1 }, heavy_infantry: { line: 1 }, legionary: { line: 1 }, persian_immortal: { line: 1 },
  punic_veteran: { line: 1 }, gaesatae: { line: 1 }, peltast: { line: 0.8, ranged: 0.2 },
  spear: { spear: 1 }, hoplite: { line: 0.5, spear: 0.5 }, triarii_veteran: { spear: 1 },
  silver_shield: { spear: 1 }, machimoi_phalangitai: { spear: 1 }, briton_noble_spearmen: { spear: 1 },
  slinger: { ranged: 1 }, archer: { ranged: 1 }, briton_longbow: { ranged: 1 }, balearic_slinger: { ranged: 1 },
  light_cavalry: { mobile: 1 }, heavy_cavalry: { mobile: 1 }, camel_cavalry: { mobile: 1 }, carthaginian_war_elephant: { mobile: 1 },
  mauryan_war_elephant: { mobile: 1 }, desert_raider: { mobile: 1 }, egyptian_war_chariot: { ranged: 0.5, mobile: 0.5 }, germanic_companion_cavalry: { mobile: 1 },
  horse_archer: { ranged: 0.5, mobile: 0.5 },
  iberian_caetrati: { line: 1 }, germanic_shock_warrior: { line: 1 }, sarmatian_longswordsmen: { line: 1 },
  anatolian_thureophoroi: { line: 0.70, spear: 0.30 }
};

const spearCounterWeights: Partial<Record<BattleUnitType, number>> = {
  spear: 1,
  hoplite: 0.5,
  anatolian_thureophoroi: 0.3,
  triarii_veteran: 1,
  silver_shield: 1,
  machimoi_phalangitai: 1,
  briton_noble_spearmen: 1
};

const cavalryCounterWeights: Partial<Record<BattleUnitType, number>> = {
  light_cavalry: 1,
  heavy_cavalry: 1,
  horse_archer: 0.5,
  camel_cavalry: 1,
  carthaginian_war_elephant: 1,
  mauryan_war_elephant: 1,
  desert_raider: 1,
  egyptian_war_chariot: 1,
  germanic_companion_cavalry: 1
};

function weightedCounterTotal(
  composition: BattleComposition,
  weights: Partial<Record<BattleUnitType, number>>
): number {
  return Object.entries(weights).reduce((sum, [key, weight]) => sum + Math.max(0, composition[key as BattleUnitType] ?? 0) * (weight ?? 0), 0);
}

export function spearCavalryCounter(
  engagedSpears: BattleComposition,
  engagedEnemy: BattleComposition
): SpearCavalryCounterAssessment {
  const effectiveSpears = weightedCounterTotal(engagedSpears, spearCounterWeights);
  const effectiveEnemyCavalry = weightedCounterTotal(engagedEnemy, cavalryCounterWeights);
  const matched = Math.min(effectiveSpears, effectiveEnemyCavalry);
  const coverage = effectiveSpears > 0 ? matched / effectiveSpears : 0;
  const mobileCoverage = effectiveEnemyCavalry > 0 ? matched / effectiveEnemyCavalry : 0;
  if (matched <= 0) {
    return { effectiveSpears, effectiveEnemyCavalry, matched: 0, coverage: 0, mobileCoverage: 0, clashBonus: 0, antiCavalryDamage: 0 };
  }
  const spearShare = effectiveSpears > 0 ? matched / effectiveSpears : 0;
  const matchedClash = Object.entries(spearCounterWeights).reduce((sum, [key, weight]) => sum + (engagedSpears[key as BattleUnitType] ?? 0) * (weight ?? 0) * spearShare, 0);
  const matchedDamage = matchedClash;
  return {
    effectiveSpears,
    effectiveEnemyCavalry,
    matched,
    coverage,
    mobileCoverage,
    clashBonus: Math.round(matchedClash / 1_000 * 0.30),
    antiCavalryDamage: Math.round(matchedDamage / 1_000 * 0.15)
  };
}

function cavalryOnly(fullComposition: BattleComposition, casualtyComposition?: BattleComposition): BattleComposition {
  const result: BattleComposition = {};
  for (const key of CAVALRY_UNIT_TYPES) {
    const quantity = Math.min(Math.max(0, fullComposition[key] ?? 0), Math.max(0, casualtyComposition?.[key] ?? fullComposition[key] ?? 0));
    if (quantity > 0) result[key] = quantity;
  }
  return result;
}

const inRange = (value: number, minimum: number, maximum: number): boolean => value >= minimum && value <= maximum;

export function assessArmyComposition(
  composition: BattleComposition,
  context: ArmyCompositionContext = "FIELD"
): ArmyCompositionAssessment {
  const quantities = unitKeys.map((key) => ({ key, quantity: Math.max(0, composition[key] ?? 0) })).filter((entry) => entry.quantity > 0);
  const total = quantities.reduce((sum, entry) => sum + entry.quantity, 0);
  const roleShares: ArmyCompositionAssessment["roleShares"] = { line: 0, spear: 0, ranged: 0, mobile: 0 };
  if (total <= 0) {
    return { tier: "LIMITED", ...COMPOSITION_TIERS.LIMITED, dominantUnitShare: 0, meaningfulUnitCount: 0, roleShares };
  }

  const shares = quantities.map((entry) => ({ ...entry, share: entry.quantity / total }));
  for (const entry of shares) {
    for (const [role, weight] of Object.entries(roleWeights[entry.key]) as Array<[keyof typeof roleShares, number]>) {
      roleShares[role] += entry.share * weight;
    }
  }
  const dominantUnitShare = Math.max(...shares.map((entry) => entry.share));
  const meaningfulUnitCount = shares.filter((entry) => entry.share >= 0.20).length;
  const requiredRoles = context === "SIEGE_RESTRICTED"
    ? [roleShares.line, roleShares.spear, roleShares.ranged]
    : [roleShares.line, roleShares.spear, roleShares.ranged, roleShares.mobile];
  const meaningfulRoleCount = requiredRoles.filter((share) => share >= 0.10).length;

  let tier: ArmyCompositionTier;
  if (dominantUnitShare >= 0.80) {
    tier = "MONOTYPE";
  } else if (context === "SIEGE_RESTRICTED"
    ? inRange(roleShares.line, 0.50, 0.65) && inRange(roleShares.ranged, 0.20, 0.35) && inRange(roleShares.spear, 0.15, 0.25)
    : inRange(roleShares.line, 0.40, 0.55) && inRange(roleShares.ranged, 0.15, 0.25)
      && inRange(roleShares.mobile, 0.15, 0.25) && inRange(roleShares.spear, 0.10, 0.20)) {
    tier = "EXCELLENT";
  } else if (dominantUnitShare <= 0.60 && (context === "SIEGE_RESTRICTED"
    ? inRange(roleShares.line, 0.45, 0.75) && roleShares.ranged >= 0.10 && roleShares.spear >= 0.10
    : inRange(roleShares.line, 0.40, 0.65) && roleShares.ranged >= 0.10 && roleShares.mobile >= 0.10 && roleShares.spear >= 0.10)) {
    tier = "BALANCED";
  } else if (dominantUnitShare <= 0.60 && meaningfulUnitCount >= 3 && meaningfulRoleCount >= 3) {
    tier = "STANDARD";
  } else {
    tier = "LIMITED";
  }

  return { tier, ...COMPOSITION_TIERS[tier], dominantUnitShare, meaningfulUnitCount, roleShares };
}

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

export interface SiegeAssaultAccess {
  capacity: number;
  activeLadderGroups: number;
  activeSiegeTowers: number;
}

export function siegeAssaultAccess(composition: SiegeComposition, frontage = SIEGE_ASSAULT_FRONTAGE): SiegeAssaultAccess {
  const safeFrontage = Math.min(SIEGE_ASSAULT_FRONTAGE, Math.max(0, Math.floor(frontage)));
  const towers = Math.max(0, Math.floor(composition.siege_tower ?? 0));
  const ladders = Math.max(0, Math.floor(composition.ladder_group ?? 0));
  const activeSiegeTowers = Math.min(towers, Math.floor(safeFrontage / SIEGE_TOWER_ASSAULT_CAPACITY));
  const afterTowers = safeFrontage - activeSiegeTowers * SIEGE_TOWER_ASSAULT_CAPACITY;
  const activeLadderGroups = Math.min(ladders, Math.floor(afterTowers / LADDER_GROUP_ASSAULT_CAPACITY));
  return {
    capacity: activeSiegeTowers * SIEGE_TOWER_ASSAULT_CAPACITY + activeLadderGroups * LADDER_GROUP_ASSAULT_CAPACITY,
    activeLadderGroups, activeSiegeTowers
  };
}

export function activeSiegeAssaultAssets(composition: SiegeComposition, frontage = SIEGE_ASSAULT_FRONTAGE): SiegeComposition {
  const active = siegeAssaultAccess(composition, frontage);
  const result: SiegeComposition = { ...composition };
  if (active.activeLadderGroups > 0) result.ladder_group = active.activeLadderGroups;
  else delete result.ladder_group;
  if (active.activeSiegeTowers > 0) result.siege_tower = active.activeSiegeTowers;
  else delete result.siege_tower;
  return result;
}

export interface SiegeAssaultGroups {
  infantry: BattleComposition;
  ranged: BattleComposition;
  combined: BattleComposition;
}

export function siegeAssaultGroups(
  composition: BattleComposition, support: SiegeComposition, wallHp: number, gateHp: number, frontage = SIEGE_TOTAL_ASSAULT_FRONTAGE
): SiegeAssaultGroups {
  const profile = siegeFrontageProfile(wallHp, gateHp);
  const access = siegeAssaultAccess(support, SIEGE_ASSAULT_FRONTAGE);
  const meleeSource: BattleComposition = {};
  for (const key of ASSAULT_UNIT_TYPES) {
    const quantity = composition[key] ?? 0;
    if (quantity > 0) meleeSource[key] = quantity;
  }
  const infantryFrontage = profile.state === "INTACT" ? access.capacity : profile.attackerInfantry;
  const infantry = engagedComposition(meleeSource, infantryFrontage);
  const rangedSource: BattleComposition = {};
  for (const key of ["slinger", "archer", "briton_longbow", "balearic_slinger"] as BattleUnitType[]) {
    const quantity = composition[key] ?? 0;
    if (quantity > 0) rangedSource[key] = quantity;
  }
  const ranged = engagedComposition(rangedSource, Math.min(profile.attackerRanged, Math.max(0, frontage)));
  return { infantry, ranged, combined: { ...infantry, ...ranged } };
}

export function siegeAssaultComposition(
  composition: BattleComposition, support: SiegeComposition, wallHp: number, gateHp: number, frontage = SIEGE_TOTAL_ASSAULT_FRONTAGE
): BattleComposition {
  return siegeAssaultGroups(composition, support, wallHp, gateHp, frontage).combined;
}

/**
 * Kuşatma saldırganının gerçekten sur hücumuna soktuğu özgün birlikleri döndürür.
 * Yaya indirilmeyen süvariler, filler ve cephe kapasitesinin dışında kalan rezervler
 * geri çekilme takip kaybına dâhil edilmez.
 */
export function siegeAttackerRetreatExposure(
  composition: BattleComposition,
  dismounted: BattleComposition,
  support: SiegeComposition,
  wallHp: number,
  gateHp: number,
  frontage = SIEGE_TOTAL_ASSAULT_FRONTAGE
): BattleComposition {
  const effective = siegeAttackerDismountedComposition(composition, dismounted);
  const engaged = siegeAssaultGroups(effective, support, wallHp, gateHp, frontage).combined;
  return restoreSiegeAttackerCasualtyTypes(composition, engaged, dismounted);
}

export function applyRestrictedBattleLoss(
  composition: BattleComposition,
  exposed: BattleComposition,
  requestedLoss: number
): { remaining: BattleComposition; applied: number } {
  const result: BattleComposition = { ...composition };
  const entries = Object.entries(exposed)
    .map(([key, quantity]) => [key as BattleForceType, Math.min(
      Math.max(0, Math.floor(quantity ?? 0)),
      Math.max(0, Math.floor(composition[key as BattleForceType] ?? 0))
    )] as const)
    .filter(([, quantity]) => quantity > 0);
  const total = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  const target = Math.min(Math.max(0, Math.floor(requestedLoss)), total);
  if (!target) return { remaining: result, applied: 0 };

  let applied = 0;
  for (const [key, quantity] of entries) {
    const loss = Math.min(quantity, Math.floor(target * quantity / total));
    result[key] = Math.max(0, (result[key] ?? 0) - loss);
    applied += loss;
  }

  let rest = target - applied;
  for (const [key, quantity] of entries) {
    if (rest <= 0) break;
    const alreadyLost = (composition[key] ?? 0) - (result[key] ?? 0);
    const available = Math.max(0, quantity - alreadyLost);
    const extra = Math.min(rest, available);
    result[key] = Math.max(0, (result[key] ?? 0) - extra);
    applied += extra;
    rest -= extra;
  }
  return { remaining: result, applied };
}

export function siegeDefenderGroups(
  composition: BattleComposition,
  wallHp: number,
  gateHp: number
): SiegeAssaultGroups {
  const profile = siegeFrontageProfile(wallHp, gateHp);
  const dismounted = siegeDefenderComposition(composition);
  const rangedSource: BattleComposition = {};
  const infantrySource: BattleComposition = {};
  const rangedTypes = new Set<BattleUnitType>(["slinger", "archer", "briton_longbow", "balearic_slinger"]);
  for (const key of unitKeys) {
    const quantity = Math.max(0, dismounted[key] ?? 0);
    if (quantity <= 0) continue;
    if (rangedTypes.has(key)) rangedSource[key] = quantity;
    else infantrySource[key] = quantity;
  }
  const infantry = engagedComposition(infantrySource, profile.defenderInfantry);
  const ranged = engagedComposition(rangedSource, profile.defenderRanged);
  return { infantry, ranged, combined: { ...infantry, ...ranged } };
}

export function rollBattlePool(
  composition: BattleComposition,
  frontage: number,
  randomInt = (max: number) => Math.floor(Math.random() * max),
  context: ArmyCompositionContext = "FIELD",
  counterContext?: BattleCounterContext,
  applyComposition = true
): BattleRoll {
  const engaged = engagedComposition(composition, frontage);
  const compositionAssessment = assessArmyComposition(engaged, context);
  const appliedComposition = applyComposition ? compositionAssessment : { ...compositionAssessment, clashMultiplier: 1, damageMultiplier: 1 };
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

  const baseCounter = context === "FIELD" && counterContext
    ? spearCavalryCounter(engaged, engagedComposition(counterContext.opponentComposition, counterContext.opponentFrontage))
    : undefined;
  const counter = baseCounter && baseCounter.matched > 0 ? {
    ...baseCounter,
    clashBonus: Math.round(Object.entries(spearCounterWeights).reduce((sum, [key, weight]) =>
      sum + Number(detail[key]?.clash ?? 0) * Number(weight ?? 0), 0) * baseCounter.coverage * 0.30 * appliedComposition.clashMultiplier),
    antiCavalryDamage: Math.round(Object.entries(spearCounterWeights).reduce((sum, [key, weight]) =>
      sum + Number(detail[key]?.damage ?? 0) * Number(weight ?? 0), 0) * baseCounter.coverage * 0.15 * appliedComposition.damageMultiplier)
  } : undefined;
  const baseDamage = Math.ceil(damage * appliedComposition.damageMultiplier);
  return {
    clash: Math.ceil(clash * appliedComposition.clashMultiplier) + (counter?.clashBonus ?? 0),
    damage: baseDamage + (counter?.antiCavalryDamage ?? 0),
    detail,
    composition: appliedComposition,
    ...(counter ? { antiCavalryDamage: counter.antiCavalryDamage, counter } : {})
  };
}

export function rollNavalPool(composition: BattleComposition, randomInt = (max: number) => Math.floor(Math.random() * max)): BattleRoll {
  const detail: BattleRoll["detail"] = {};
  let clash = 0;
  let damage = 0;
  for (const key of navalKeys) {
    const quantity = Math.max(0,Math.floor(composition[key] ?? 0));
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
  composition: SiegeComposition,
  targets: SiegeTargets = {},
  randomInt = (max: number) => Math.floor(Math.random() * max),
  artilleryDamageDieBonus: number | SiegeComposition = 0
): { clash: number; damage: number; wallDamage: number; gateDamage: number; defense: number; detail: Record<string, number | string> } {
  const roll = (count: number, dice: number, sides: number) => rollPool(Math.min(count, 25), dice, sides, randomInt, 1);
  const uniformBonus = typeof artilleryDamageDieBonus === "number" ? Math.max(0, Math.floor(artilleryDamageDieBonus)) : 0;
  const enhancedAssets = typeof artilleryDamageDieBonus === "number" ? null : artilleryDamageDieBonus;
  const diceBonus = (asset: SiegeAssetType, count: number, dice: number) => enhancedAssets
    ? Math.min(count, 25, Math.max(0, Math.floor(enhancedAssets[asset] ?? 0))) * dice
    : Math.min(count, 25) * dice * uniformBonus;
  const bonus = enhancedAssets ? Object.values(enhancedAssets).some((count) => (count ?? 0) > 0) ? 1 : 0 : uniformBonus;
  const ram = Math.min(1, composition.ram ?? 0), mantlet = composition.mantlet ?? 0;
  const ballista = composition.ballista ?? 0, wallBallista = composition.wall_ballista ?? 0, catapult = composition.catapult ?? 0, tower = composition.siege_tower ?? 0;
  // Merdivenler yalnızca surlara hücum erişimi sağlar; doğrudan çarpışma puanı üretmez.
  const ladderClash = 0, towerClash = roll(tower, 1, 10), mantletClash = 0;
  const ballistaRoll = roll(ballista, 1, 10) + diceBonus("ballista", ballista, 1);
  const wallBallistaDamage = roll(wallBallista, 2, 8) + diceBonus("wall_ballista", wallBallista, 2);
  const catapultRoll = roll(catapult, 1, 20) + diceBonus("catapult", catapult, 1);
  const towerDamage = roll(tower, 1, 6);
  const ramGate = roll(ram, 1, 8) * 35;
  const ballistaStructure = ["WALL", "GATE"].includes(targets.ballista ?? "")
    ? (roll(ballista, 1, 10) + diceBonus("ballista", ballista, 1)) * 5
    : 0;
  const ballistaWall = targets.ballista === "WALL" ? ballistaStructure : 0;
  const ballistaGate = targets.ballista === "GATE" ? ballistaStructure : 0;
  const catapultWall = targets.catapult === "WALL" ? (roll(catapult, 2, 20) + diceBonus("catapult", catapult, 2)) * 20 : 0;
  const ballistaArmy = targets.ballista === "ARMY" ? ballistaRoll : 0;
  const catapultArmy = targets.catapult === "ARMY" ? catapultRoll : 0;
  return {
    clash: ladderClash + towerClash + mantletClash,
    damage: ballistaArmy + wallBallistaDamage + catapultArmy + towerDamage,
    wallDamage: ballistaWall + catapultWall,
    gateDamage: ramGate + ballistaGate,
    defense: Math.min(0.20, mantlet * 0.02),
    detail: {
      ladderClash, towerClash, mantletClash, ballistaArmy, wallBallistaDamage, catapultArmy, towerDamage,
      ramGate, ballistaWall, ballistaGate, catapultWall, artilleryDamageDieBonus: bonus,
      ballistaTarget: targets.ballista ?? "WALL", catapultTarget: targets.catapult ?? "WALL"
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

export function roundDamageFactors(clashA:number,clashB:number):{
  tier:RoundResolution["tier"];winner:BattleSideKey|null;factorA:number;factorB:number;
}{
  const outcome=advantageTier(clashA,clashB);
  const multi=multipliers[outcome.tier];
  return {
    ...outcome,
    factorA:outcome.winner==="A"?multi.winner:outcome.winner==="B"?multi.loser:multi.winner,
    factorB:outcome.winner==="B"?multi.winner:outcome.winner==="A"?multi.loser:multi.winner
  };
}

export function egyptianWarChariotPressureBonus(input: {
  round: number;
  terrain: BattleTerrain;
  pressureWinner: BattleSideKey | null;
  side: BattleSideKey;
  engagedChariots: number;
  enemyMobileCoverage: number;
}): number {
  if (input.round !== 1 || !["OPEN_PLAIN", "DESERT"].includes(input.terrain)) return 0;
  if (input.pressureWinner !== input.side || input.engagedChariots <= 0) return 0;
  return input.enemyMobileCoverage < 0.50 ? 1 : 0;
}

type CasualtyDurabilityOverrides = Partial<Record<BattleForceType, 1 | 2 | 3>>;

function applyLoss(
  composition: BattleComposition,
  rawDamage: number,
  mode: "LAND" | "NAVAL",
  durabilityOverrides: CasualtyDurabilityOverrides = {}
): { remaining: BattleComposition; loss: number } {
  const result: BattleComposition = { ...composition };
  const keys: BattleForceType[] = mode === "NAVAL" ? navalKeys : unitKeys;
  const durabilityFor = (key: BattleForceType) => durabilityOverrides[key]
    ?? (mode === "NAVAL" ? NAVAL_UNIT_STATS[key as NavalUnitType].durability : BATTLE_UNIT_STATS[key as BattleUnitType].durability);
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

function applyLossWithinComposition(
  fullComposition: BattleComposition,
  casualtyComposition: BattleComposition,
  rawDamage: number,
  mode: "LAND" | "NAVAL",
  durabilityOverrides: CasualtyDurabilityOverrides = {}
): { remaining: BattleComposition; loss: number } {
  const keys: BattleForceType[] = mode === "NAVAL" ? navalKeys : unitKeys;
  const eligible: BattleComposition = {};
  for (const key of keys) {
    const quantity = Math.min(Math.max(0, fullComposition[key] ?? 0), Math.max(0, casualtyComposition[key] ?? 0));
    if (quantity > 0) eligible[key] = quantity;
  }
  const applied = applyLoss(eligible, rawDamage, mode, durabilityOverrides);
  const remaining: BattleComposition = { ...fullComposition };
  let loss = 0;
  for (const key of keys) {
    const deducted = Math.max(0, (eligible[key] ?? 0) - (applied.remaining[key] ?? 0));
    if (!deducted) continue;
    remaining[key] = Math.max(0, (fullComposition[key] ?? 0) - deducted);
    loss += deducted;
  }
  return { remaining, loss };
}

function applyDamageWithCounter(
  fullComposition: BattleComposition,
  casualtyComposition: BattleComposition | undefined,
  totalDamage: number,
  antiCavalryDamage: number,
  mode: "LAND" | "NAVAL",
  durabilityOverrides: CasualtyDurabilityOverrides = {}
): { remaining: BattleComposition; loss: number } {
  const targetedDamage = mode === "LAND" ? Math.min(Math.max(0, totalDamage), Math.max(0, antiCavalryDamage)) : 0;
  const normalDamage = Math.max(0, totalDamage - targetedDamage);
  const normal = casualtyComposition
    ? applyLossWithinComposition(fullComposition, casualtyComposition, normalDamage, mode, durabilityOverrides)
    : applyLoss(fullComposition, normalDamage, mode, durabilityOverrides);
  if (targetedDamage <= 0) return normal;
  const cavalryCasualties = cavalryOnly(normal.remaining, casualtyComposition);
  const counter = applyLossWithinComposition(normal.remaining, cavalryCasualties, targetedDamage, "LAND", durabilityOverrides);
  return { remaining: counter.remaining, loss: normal.loss + counter.loss };
}

function applySplitDamageWithCounter(
  fullComposition: BattleComposition,
  primaryComposition: BattleComposition,
  secondaryComposition: BattleComposition,
  primaryShare: number,
  totalDamage: number,
  antiCavalryDamage: number,
  mode: "LAND" | "NAVAL",
  durabilityOverrides: CasualtyDurabilityOverrides = {}
): { remaining: BattleComposition; loss: number } {
  const primaryAvailable = compositionTotal(primaryComposition) > 0;
  const secondaryAvailable = compositionTotal(secondaryComposition) > 0;
  const safePrimaryShare = Math.min(1, Math.max(0, primaryShare));
  const appliedPrimaryShare = primaryAvailable && secondaryAvailable ? safePrimaryShare : primaryAvailable ? 1 : 0;
  const appliedSecondaryShare = primaryAvailable && secondaryAvailable ? 1 - safePrimaryShare : secondaryAvailable ? 1 : 0;
  const primary = applyDamageWithCounter(
    fullComposition, primaryComposition, totalDamage * appliedPrimaryShare,
    antiCavalryDamage * appliedPrimaryShare, mode, durabilityOverrides
  );
  const secondary = applyDamageWithCounter(
    primary.remaining, secondaryComposition, totalDamage * appliedSecondaryShare,
    antiCavalryDamage * appliedSecondaryShare, mode, durabilityOverrides
  );
  return { remaining: secondary.remaining, loss: primary.loss + secondary.loss };
}

export function resolveRound(
  compositionA: BattleComposition, compositionB: BattleComposition, rollA: BattleRoll, rollB: BattleRoll,
  options: {
    mode?: "LAND" | "NAVAL"; damageFactorA?: number; damageFactorB?: number;
    pressureClashA?: number; pressureClashB?: number;
    casualtyCompositionA?: BattleComposition | undefined; casualtyCompositionB?: BattleComposition | undefined;
    casualtySplitA?: { primaryComposition: BattleComposition; secondaryComposition: BattleComposition; primaryShare: number } | undefined;
    casualtyDurabilityOverridesA?: CasualtyDurabilityOverrides | undefined;
    casualtyDurabilityOverridesB?: CasualtyDurabilityOverrides | undefined;
  } = {}
): RoundResolution {
  const mode = options.mode ?? "LAND";
  const outcome = advantageTier(rollA.clash, rollB.clash);
  const pressureOutcome = options.pressureClashA === undefined || options.pressureClashB === undefined
    ? outcome
    : advantageTier(options.pressureClashA, options.pressureClashB);
  const roundFactors=roundDamageFactors(rollA.clash,rollB.clash);
  const factorA = roundFactors.factorA * (options.damageFactorA ?? 1);
  const factorB = roundFactors.factorB * (options.damageFactorB ?? 1);
  const scale = mode === "NAVAL" ? 0.012 : 20;
  const againstB = applyDamageWithCounter(
    compositionB, options.casualtyCompositionB, rollA.damage * scale * factorA,
    (rollA.antiCavalryDamage ?? 0) * scale * factorA, mode, options.casualtyDurabilityOverridesB
  );
  const againstA = options.casualtySplitA
    ? applySplitDamageWithCounter(
      compositionA,
      options.casualtySplitA.primaryComposition,
      options.casualtySplitA.secondaryComposition,
      options.casualtySplitA.primaryShare,
      rollB.damage * scale * factorB,
      (rollB.antiCavalryDamage ?? 0) * scale * factorB,
      mode,
      options.casualtyDurabilityOverridesA
    )
    : applyDamageWithCounter(
      compositionA, options.casualtyCompositionA, rollB.damage * scale * factorB,
      (rollB.antiCavalryDamage ?? 0) * scale * factorB, mode, options.casualtyDurabilityOverridesA
    );
  const pressure = pressureOutcome.tier === "MINOR" ? 1 : pressureOutcome.tier === "CLEAR" ? 2 : pressureOutcome.tier === "CRUSHING" ? 3 : 0;
  return {
    tier: outcome.tier, winner: outcome.winner,
    lossA: againstA.loss, lossB: againstB.loss,
    remainingA: againstA.remaining, remainingB: againstB.remaining,
    pressureDeltaA: pressureOutcome.winner === "B" ? pressure : pressureOutcome.winner === "A" ? -1 : 0,
    pressureDeltaB: pressureOutcome.winner === "A" ? pressure : pressureOutcome.winner === "B" ? -1 : 0,
    pressureTier: pressureOutcome.tier, pressureWinner: pressureOutcome.winner
  };
}
export interface SiegeDefenseModifiers {
  attackerClash: number;
  attackerDamage: number;
  defenderClash: number;
  defenderDamage: number;
  defenderIncomingDamage: number;
}

export function siegeDefenseModifiers(wallHp: number, gateHp: number): SiegeDefenseModifiers {
  const state = siegeFortificationState(wallHp, gateHp);
  if (state === "INTACT") return {
    attackerClash: 0.80, attackerDamage: 0.80,
    defenderClash: 1.20, defenderDamage: 1.00, defenderIncomingDamage: 0.95
  };
  if (state === "FULLY_BREACHED") return {
    attackerClash: 1.00, attackerDamage: 1.00,
    defenderClash: 1.20, defenderDamage: 1.00, defenderIncomingDamage: 1.00
  };
  return {
    attackerClash: 0.90, attackerDamage: 0.90,
    defenderClash: 1.20, defenderDamage: 1.00, defenderIncomingDamage: 0.975
  };
}

export interface SiegeReserveBonus {
  reserve: number;
  stepSize: number;
  tiers: number;
  clashMultiplier: number;
  damageMultiplier: number;
  incomingDamageMultiplier: number;
}

export function siegeDefenderReserveBonus(remaining: number, frontage: number): SiegeReserveBonus {
  const safeFrontage = Math.max(1, Math.floor(frontage));
  const reserve = Math.max(0, Math.floor(remaining) - safeFrontage);
  const stepSize = safeFrontage / 5;
  const tiers = Math.min(5, Math.max(0, Math.floor(reserve / stepSize)));
  return {
    reserve,
    stepSize,
    tiers,
    clashMultiplier: 1 + tiers * 0.01,
    damageMultiplier: 1 + tiers * 0.01,
    incomingDamageMultiplier: 1 - tiers * 0.01
  };
}

export interface SiegePressureState {
  pressure: number;
  reserve: number;
  reserveRelief: number;
  hasUsableReserve: boolean;
}

export function siegePressureAfterRound(currentPressure: number, delta: number, remaining: number, frontage: number): SiegePressureState {
  const safeFrontage = Math.max(1, Math.floor(frontage));
  const reserve = Math.max(0, Math.floor(remaining) - safeFrontage);
  return {
    pressure: Math.min(SIEGE_PRESSURE_LIMIT, Math.max(0, Math.floor(currentPressure) + Math.floor(delta))),
    reserve,
    reserveRelief: 0,
    hasUsableReserve: reserve >= Math.ceil(safeFrontage / 2)
  };
}

export function siegeOrderState(pressure: number, remaining: number): BattleOrder {
  if (remaining <= 0) return "BROKEN";
  if (pressure >= SIEGE_PRESSURE_LIMIT) return "CRITICAL";
  if (pressure >= 8) return "SHAKEN";
  if (pressure >= 4) return "WORN";
  return "ORDERED";
}

export function siegeAttackerBreaks(pressure: number, initial: number, remaining: number): boolean {
  const casualtyRate = initial > 0 ? 1 - remaining / initial : 1;
  return remaining <= 0 || (pressure >= SIEGE_PRESSURE_LIMIT && casualtyRate >= 0.50);
}

export function siegeDefenderCaptured(input: { remaining: number }): boolean {
  return input.remaining <= 0;
}

export function baseRetreatRate(roundNumber: number): number {
  if (roundNumber <= 1) return 0;
  return 0.05 + Math.min(0.09, Math.max(0, roundNumber - 2) * 0.03);
}
export function orderState(pressure: number, initial: number, remaining: number): BattleOrder {
  const casualtyRate = initial > 0 ? 1 - remaining / initial : 1;
  if (remaining <= 0 || (pressure >= FIELD_BATTLE_PRESSURE_LIMIT && casualtyRate >= 0.50)) return "BROKEN";
  if (pressure >= FIELD_BATTLE_PRESSURE_LIMIT || casualtyRate >= 0.50) return "CRITICAL";
  if (pressure >= 6 || casualtyRate >= 0.40) return "SHAKEN";
  if (pressure >= 2 || casualtyRate >= 0.10) return "WORN";
  return "ORDERED";
}

export const battleEnds = (pressure: number, initial: number, remaining: number): boolean => orderState(pressure, initial, remaining) === "BROKEN";

export const fieldPressureAfterRound = (currentPressure: number, delta: number): number =>
  Math.min(FIELD_BATTLE_PRESSURE_LIMIT, Math.max(0, Math.floor(currentPressure) + Math.floor(delta)));
