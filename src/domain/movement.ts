import type { BattleUnitType, NavalUnitType } from "./battle.js";

export type MapDomain = "LAND" | "SEA" | "VOID";
export type MapTerrain =
  | "OPEN_PLAIN"
  | "FLAT_DESERT"
  | "STEPPE"
  | "FOREST"
  | "MARSH"
  | "MOUNTAIN"
  | "SETTLEMENT"
  | "COAST"
  | "SEA"
  | "IMPASSABLE";

export type MovementMode = "NORMAL" | "STRATEGIC_REDEPLOYMENT" | "FORCED_MARCH" | "STEALTH";
export type FormationKind = "ARMY" | "FLEET";
export type MovementOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export interface MovementBand {
  maximum: number | null;
  allowance: number;
}

export interface MovementRules {
  minimumMovement: number;
  armySizeBands: readonly MovementBand[];
  fleetSizeBands: readonly MovementBand[];
  pureCavalryBonus: number;
  strategicRedeploymentBonus: number;
  forcedMarchBonus: number;
  lightSiegePenaltyAboveHalf: number;
  heavySiegePenaltyAtMostHalf: number;
  heavySiegePenaltyAboveHalf: number;
  allKerkourosBonus: number;
  quinqueremePenalty: number;
  fleetCargoPenaltyBands: readonly { maximumUtilization: number; penalty: number }[];
  terrainCosts: Readonly<Record<MapTerrain, number | null>>;
}

export const DEFAULT_MOVEMENT_RULES = {
  minimumMovement: 1,
  armySizeBands: [
    { maximum: 4_999, allowance: 6 },
    { maximum: 14_999, allowance: 5 },
    { maximum: 29_999, allowance: 4 },
    { maximum: 49_999, allowance: 3 },
    { maximum: null, allowance: 2 }
  ],
  fleetSizeBands: [
    { maximum: 5, allowance: 9 },
    { maximum: 15, allowance: 8 },
    { maximum: 30, allowance: 7 },
    { maximum: 50, allowance: 6 },
    { maximum: null, allowance: 5 }
  ],
  pureCavalryBonus: 1,
  strategicRedeploymentBonus: 2,
  forcedMarchBonus: 2,
  lightSiegePenaltyAboveHalf: 1,
  heavySiegePenaltyAtMostHalf: 1,
  heavySiegePenaltyAboveHalf: 2,
  allKerkourosBonus: 1,
  quinqueremePenalty: 1,
  fleetCargoPenaltyBands: [
    { maximumUtilization: 0.50, penalty: 0 },
    { maximumUtilization: 0.75, penalty: 1 },
    { maximumUtilization: 0.90, penalty: 2 },
    { maximumUtilization: 1, penalty: 3 }
  ],
  terrainCosts: {
    OPEN_PLAIN: 1,
    FLAT_DESERT: 1,
    STEPPE: 1,
    FOREST: 1,
    MARSH: 1,
    MOUNTAIN: 1,
    SETTLEMENT: 1,
    COAST: 1,
    SEA: 1,
    IMPASSABLE: null
  }
} as const satisfies MovementRules;

export type MobileSiegeLoad = Partial<Record<"ballista" | "mantlet" | "catapult" | "siege_tower", number>>;

function whole(value: number | undefined): number {
  return Math.max(0, Math.floor(Number(value ?? 0)));
}

function allowanceFor(total: number, bands: readonly MovementBand[]): number {
  const normalized = Math.max(0, Math.floor(total));
  const band = bands.find((candidate) => candidate.maximum === null || normalized <= candidate.maximum);
  if (!band) throw new Error("Hareket kuralında bütün büyüklükleri kapsayan son bant bulunmuyor.");
  return band.allowance;
}

export function siegeLoad(assets: MobileSiegeLoad): number {
  return Math.ceil(whole(assets.ballista) / 2)
    + whole(assets.mantlet)
    + whole(assets.catapult)
    + whole(assets.siege_tower) * 2;
}

export function siegeCapacity(totalTroops: number): number {
  return Math.max(1, Math.floor(Math.max(0, totalTroops) / 5_000));
}

export function isPureLightHeavyCavalry(composition: Partial<Record<BattleUnitType, number>>): boolean {
  const active = Object.entries(composition).filter(([, quantity]) => whole(quantity) > 0);
  return active.length > 0 && active.every(([unitType]) => unitType === "light_cavalry" || unitType === "heavy_cavalry");
}

export interface ArmyMovementInput {
  totalTroops: number;
  composition: Partial<Record<BattleUnitType, number>>;
  siegeAssets?: MobileSiegeLoad;
  speedPercent?: number;
  mode?: MovementMode;
  strategicRedeploymentEligible?: boolean;
  friendlyTerritoryRoute?: boolean;
  rules?: MovementRules;
}

export interface ArmyMovementResult {
  canMove: boolean;
  baseAllowance: number;
  speedBonus: number;
  formationBonus: number;
  territoryBonus: number;
  modeBonus: number;
  siegePenalty: number;
  siegeLoad: number;
  siegeCapacity: number;
  siegeUtilization: number;
  allowance: number;
  reason: string | null;
}

export function calculateArmyMovement(input: ArmyMovementInput): ArmyMovementResult {
  const rules = input.rules ?? DEFAULT_MOVEMENT_RULES;
  const totalTroops = whole(input.totalTroops);
  const baseAllowance = allowanceFor(totalTroops, rules.armySizeBands);
  const speedBonus = Math.ceil(baseAllowance * Math.max(0, Number(input.speedPercent ?? 0)));
  const assets = input.siegeAssets ?? {};
  const load = siegeLoad(assets);
  const capacity = siegeCapacity(totalTroops);
  const utilization = load / capacity;
  const heavy = whole(assets.catapult) > 0 || whole(assets.siege_tower) > 0;
  const siegePenalty = load === 0
    ? 0
    : heavy
      ? (utilization <= 0.5 ? rules.heavySiegePenaltyAtMostHalf : rules.heavySiegePenaltyAboveHalf)
      : (utilization <= 0.5 ? 0 : rules.lightSiegePenaltyAboveHalf);
  const pureCavalry = load === 0 && isPureLightHeavyCavalry(input.composition);
  const formationBonus = pureCavalry ? rules.pureCavalryBonus : 0;
  const territoryBonus = input.friendlyTerritoryRoute ? 1 : 0;
  const mode = input.mode ?? "NORMAL";
  const modeBonus = mode === "STRATEGIC_REDEPLOYMENT"
    ? (input.strategicRedeploymentEligible ? rules.strategicRedeploymentBonus : 0)
    : mode === "FORCED_MARCH"
      ? rules.forcedMarchBonus
      : 0;
  const canMove = load <= capacity;
  const allowance = canMove
    ? Math.max(rules.minimumMovement, baseAllowance + speedBonus + formationBonus + territoryBonus + modeBonus - siegePenalty)
    : 0;
  return {
    canMove,
    baseAllowance,
    speedBonus,
    formationBonus,
    territoryBonus,
    modeBonus,
    siegePenalty,
    siegeLoad: load,
    siegeCapacity: capacity,
    siegeUtilization: utilization,
    allowance,
    reason: canMove ? null : `Kuşatma yükü kapasiteyi aşıyor (${load}/${capacity}).`
  };
}

export interface FleetMovementInput {
  composition: Partial<Record<NavalUnitType, number>>;
  cargoLoad?: number;
  cargoCapacity?: number;
  speedPercent?: number;
  friendlyTerritoryRoute?: boolean;
  rules?: MovementRules;
}

export interface FleetMovementResult {
  canMove: boolean;
  totalShips: number;
  baseAllowance: number;
  speedBonus: number;
  territoryBonus: number;
  compositionModifier: number;
  cargoPenalty: number;
  cargoUtilization: number;
  allowance: number;
  reason: string | null;
}

export function calculateFleetMovement(input: FleetMovementInput): FleetMovementResult {
  const rules = input.rules ?? DEFAULT_MOVEMENT_RULES;
  const kerkouros = whole(input.composition.kerkouros);
  const trireme = whole(input.composition.trireme);
  const quinquereme = whole(input.composition.quinquereme);
  const totalShips = kerkouros + trireme + quinquereme;
  const baseAllowance = allowanceFor(totalShips, rules.fleetSizeBands);
  const speedBonus = Math.ceil(baseAllowance * Math.max(0, Number(input.speedPercent ?? 0)));
  const compositionModifier = totalShips > 0 && kerkouros === totalShips
    ? rules.allKerkourosBonus
    : quinquereme > 0
      ? -rules.quinqueremePenalty
      : 0;
  const cargoLoad = Math.max(0, Number(input.cargoLoad ?? 0));
  const cargoCapacity = Math.max(0, Number(input.cargoCapacity ?? 0));
  const cargoUtilization = cargoCapacity > 0 ? cargoLoad / cargoCapacity : (cargoLoad > 0 ? Number.POSITIVE_INFINITY : 0);
  const cargoPenalty = cargoLoad <= 0
    ? 0
    : rules.fleetCargoPenaltyBands.find((band) => cargoUtilization <= band.maximumUtilization)?.penalty
      ?? rules.fleetCargoPenaltyBands[rules.fleetCargoPenaltyBands.length - 1]!.penalty;
  const canMove = totalShips > 0 && cargoLoad <= cargoCapacity;
  const territoryBonus = input.friendlyTerritoryRoute ? 1 : 0;
  const allowance = canMove
    ? Math.max(rules.minimumMovement, baseAllowance + speedBonus + compositionModifier + territoryBonus - cargoPenalty)
    : 0;
  return {
    canMove,
    totalShips,
    baseAllowance,
    speedBonus,
    territoryBonus,
    compositionModifier,
    cargoPenalty,
    cargoUtilization,
    allowance,
    reason: totalShips <= 0
      ? "Filoda hareket edebilecek gemi bulunmuyor."
      : cargoLoad > cargoCapacity
        ? `Deniz yükü kapasiteyi aşıyor (${cargoLoad}/${cargoCapacity}).`
        : null
  };
}

export interface OffsetHexCoordinate {
  column: number;
  row: number;
}

export function hexColumnName(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error("Hex sütunu sıfır veya daha büyük tam sayı olmalıdır.");
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function hexColumnIndex(name: string): number {
  const normalized = name.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) throw new Error("Geçersiz Hex sütunu.");
  let value = 0;
  for (const character of normalized) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

export function parseHexCoordinate(value: string): OffsetHexCoordinate {
  const match = /^([A-Za-z]+)[-\s]?(\d+)$/.exec(value.trim());
  if (!match) throw new Error("Koordinat A12 veya A-12 biçiminde olmalıdır.");
  const row = Number(match[2]);
  if (!Number.isSafeInteger(row) || row < 0) throw new Error("Geçersiz Hex satırı.");
  return { column: hexColumnIndex(match[1]!), row };
}

export function formatHexCoordinate(coordinate: OffsetHexCoordinate): string {
  return `${hexColumnName(coordinate.column)}${String(coordinate.row).padStart(2, "0")}`;
}

export function hexCodeAxial(value: string): { q: number; r: number } {
  const coordinate = parseHexCoordinate(value);
  return {
    q: coordinate.column,
    r: coordinate.row - 1 - Math.floor((coordinate.column - (coordinate.column & 1)) / 2)
  };
}

function oddQCube(coordinate: OffsetHexCoordinate): { x: number; y: number; z: number } {
  const x = coordinate.column;
  const z = coordinate.row - Math.floor((coordinate.column - (coordinate.column & 1)) / 2);
  return { x, z, y: -x - z };
}

export function hexDistance(left: OffsetHexCoordinate, right: OffsetHexCoordinate): number {
  const a = oddQCube(left);
  const b = oddQCube(right);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

export function adjacentHexes(coordinate: OffsetHexCoordinate): OffsetHexCoordinate[] {
  const even = coordinate.column % 2 === 0;
  const offsets = even
    ? [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]]
    : [[1, 0], [1, 1], [0, -1], [-1, 1], [-1, 0], [0, 1]];
  return offsets.map(([column, row]) => ({ column: coordinate.column + column!, row: coordinate.row + row! }));
}

export type ReconKind = "REGIONAL_OBSERVER" | "MOBILE_SCOUT";
export type ReconTier = "CRITICAL_FAILURE" | "NO_INFORMATION" | "SUCCESS" | "STRONG" | "SHARP" | "SUPERIOR";

export interface ReconRollResult {
  kind: ReconKind;
  naturalRoll: number;
  total: number;
  tier: ReconTier;
  informationLevel: 0 | 1 | 2 | 3 | 4;
  label: string;
  observerExposed: boolean;
  opponentFreeAction: boolean;
}

export function effectiveScoutStrength(input: { lightCavalry?: number; horseArchers?: number; heavyCavalry?: number }): number {
  return whole(input.lightCavalry) + whole(input.horseArchers) + Math.floor(whole(input.heavyCavalry) / 2);
}

export function scoutSizeModifiers(effectiveStrength: number): { rollBonus: number; detectionBonusForEnemy: number } {
  const strength = whole(effectiveStrength);
  if (strength >= 800) return { rollBonus: 2, detectionBonusForEnemy: 1 };
  if (strength >= 400) return { rollBonus: 1, detectionBonusForEnemy: 0 };
  return { rollBonus: 0, detectionBonusForEnemy: 0 };
}

export function targetVisibility(totalTroops: number, hasSiegeAssets: boolean, stealthMarch: boolean): number {
  const total = whole(totalTroops);
  const size = total <= 999 ? -2 : total <= 4_999 ? -1 : total <= 14_999 ? 0 : total <= 29_999 ? 1 : 2;
  return size + (hasSiegeAssets ? 1 : 0) - (stealthMarch ? 2 : 0);
}

export function reconTerrainBonus(kind: ReconKind, terrain: MapTerrain, nearFriendlySettlement: boolean): number {
  if (nearFriendlySettlement) return kind === "MOBILE_SCOUT" ? 2 : 1;
  if (terrain === "OPEN_PLAIN") return 1;
  if (terrain === "FOREST" || terrain === "MARSH" || terrain === "MOUNTAIN") return kind === "MOBILE_SCOUT" ? -2 : -1;
  return 0;
}

export function resolveReconRoll(kind: ReconKind, naturalRoll: number, modifier: number): ReconRollResult {
  if (!Number.isInteger(naturalRoll) || naturalRoll < 1 || naturalRoll > 20) throw new Error("Keşif zarı 1 ile 20 arasında olmalıdır.");
  const total = naturalRoll + Math.trunc(modifier);
  if (naturalRoll === 1) {
    return {
      kind, naturalRoll, total, tier: "CRITICAL_FAILURE", informationLevel: 0,
      label: kind === "MOBILE_SCOUT" ? "Keşif Felaketi" : "Ağ Açığa Çıktı",
      observerExposed: kind === "REGIONAL_OBSERVER", opponentFreeAction: kind === "MOBILE_SCOUT"
    };
  }
  if (naturalRoll === 20) {
    return {
      kind, naturalRoll, total, tier: "SUPERIOR", informationLevel: 4, label: "Üstün Keşif",
      observerExposed: false, opponentFreeAction: false
    };
  }
  const successThreshold = kind === "MOBILE_SCOUT" ? 11 : 11;
  const strongThreshold = kind === "MOBILE_SCOUT" ? 15 : 16;
  const sharpThreshold = kind === "MOBILE_SCOUT" ? 18 : 18;
  if (total >= sharpThreshold) return { kind, naturalRoll, total, tier: "SHARP", informationLevel: 3, label: "Keskin Keşif", observerExposed: false, opponentFreeAction: false };
  if (total >= strongThreshold) return { kind, naturalRoll, total, tier: "STRONG", informationLevel: 2, label: "Güçlü Keşif", observerExposed: false, opponentFreeAction: false };
  if (total >= successThreshold) return { kind, naturalRoll, total, tier: "SUCCESS", informationLevel: 1, label: "Başarılı Keşif", observerExposed: false, opponentFreeAction: false };
  return {
    kind, naturalRoll, total, tier: "NO_INFORMATION", informationLevel: 0,
    label: kind === "MOBILE_SCOUT" && total <= 3 ? "Dağılmış Keşif" : kind === "REGIONAL_OBSERVER" && total <= 4 ? "Temas Kaybedildi" : "Bilgi Yok",
    observerExposed: false, opponentFreeAction: false
  };
}

export type UnobservedDetectionTier = "CRITICAL_FAILURE" | "UNDETECTED" | "DELAYED_RUMOR" | "IMMEDIATE_RUMOR";

export function resolveUnobservedDetection(naturalRoll: number, visibility: number): { total: number; tier: UnobservedDetectionTier } {
  if (!Number.isInteger(naturalRoll) || naturalRoll < 1 || naturalRoll > 20) throw new Error("Tespit zarı 1 ile 20 arasında olmalıdır.");
  const total = naturalRoll + Math.trunc(visibility);
  if (naturalRoll === 1) return { total, tier: "CRITICAL_FAILURE" };
  if (naturalRoll === 20) return { total, tier: "IMMEDIATE_RUMOR" };
  if (total >= 15) return { total, tier: "DELAYED_RUMOR" };
  return { total, tier: "UNDETECTED" };
}

export interface MutualAwarenessResult {
  superiorSide: "A" | "B" | null;
  levelDifference: number;
  ambushBonus: 0 | 1 | 2 | 3;
  mayChooseTerrain: boolean;
  mayAvoidContact: boolean;
  learnsEnemyDeployment: boolean;
}

export function mutualAwareness(levelA: number, levelB: number): MutualAwarenessResult {
  const a = Math.max(0, Math.min(4, Math.floor(levelA)));
  const b = Math.max(0, Math.min(4, Math.floor(levelB)));
  const difference = Math.abs(a - b);
  const superiorSide = a === b ? null : a > b ? "A" : "B";
  return {
    superiorSide,
    levelDifference: difference,
    ambushBonus: difference === 0 ? 0 : difference === 1 ? 1 : difference === 2 ? 2 : 3,
    mayChooseTerrain: difference >= 2,
    mayAvoidContact: difference >= 2,
    learnsEnemyDeployment: difference >= 3
  };
}
