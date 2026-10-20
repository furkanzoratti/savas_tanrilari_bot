import { BUILDINGS, SHIPS, UNITS, portShipCapacity, shipHarborRequirement } from "../domain/catalog.js";
import { assessArmyComposition, type ArmyCompositionProfile, type BattleComposition, type BattleUnitType } from "../domain/battle.js";
import { isAcquisitionTurn } from "../domain/mobilization.js";
import {
  NPC_AUTO_PURCHASE_DOCTRINES, NPC_UNIT_PURCHASE_BATCH, npcBuildingLimit, npcBuildingPriority, npcDevelopmentOnly, npcPrioritizesShips, npcRecruitsUnits,
  type NpcAutoPurchaseDoctrine, type PurchasableUnitType
} from "../domain/npc-auto-purchase.js";
import { pool } from "../db/pool.js";
import {
  GameError,buildingPurchaseTerms,gameService,unitPurchaseCost,
  modifiedBuildingPurchaseCost,modifiedShipPurchaseCost,modifiedUnitPurchaseCost,
  type CountryDocument
} from "./game-service.js";
import { formableModifiers } from "../domain/formable-countries.js";
import { STEPPE_ARMY_UNIT_TYPES } from "../domain/steppe-army.js";
import { SCANDINAVIAN_ARMY_UNIT_TYPES } from "../domain/scandinavian-army.js";
import { purchasableShipTypes } from "../domain/scandinavian-navy.js";

export type NpcAutoPurchaseScope = "ALL_PLAYERLESS" | "INCLUDED_ONLY";
export type NpcCountryOverrideStatus = "AUTO" | "INCLUDE" | "EXCLUDE";

export interface NpcAutoPurchaseConfig {
  guildId: string;
  enabled: boolean;
  doctrine: NpcAutoPurchaseDoctrine;
  budgetPercent: number;
  targetFillPercent: number;
  minimumReserve: number;
  scope: NpcAutoPurchaseScope;
}

interface BuildingAction {
  settlementId: string;
  settlementName: string;
  buildingType: string;
  buildingName: string;
  targetLevel: number;
  cost: number;
}

interface BuildingCandidate extends BuildingAction {
  score: number;
  isNew: boolean;
}

export interface ShipAction {
  settlementId: string;
  settlementName: string;
  shipType: keyof typeof SHIPS;
  quantity: number;
  cost: number;
}

export interface UnitAction {
  settlementId: string;
  settlementName: string;
  unitType: PurchasableUnitType;
  quantity: number;
  cost: number;
}

export interface NpcCountryPurchasePlan {
  countryId: string;
  countryName: string;
  doctrine: NpcAutoPurchaseDoctrine;
  startingTreasury: number;
  spendLimit: number;
  plannedCost: number;
  buildingActions: BuildingAction[];
  shipActions: ShipAction[];
  unitActions: UnitAction[];
  notes: string[];
}

export interface NpcCountryPurchaseResult extends NpcCountryPurchasePlan {
  status: "COMPLETE" | "PARTIAL" | "FAILED";
  runNumber: number;
  actualCost: number;
  errors: string[];
}

export interface NpcAutoPurchaseDashboardCountry {
  id: string;
  name: string;
  treasury: number;
  localTreasury: number;
  population: number;
  settlementCount: number;
  overrideStatus: NpcCountryOverrideStatus;
  overrideDoctrine: NpcAutoPurchaseDoctrine | null;
  effectiveDoctrine: NpcAutoPurchaseDoctrine;
  included: boolean;
  lastRun: {
    turn: number;
    status: string;
    attemptCount: number;
    completedAt: string | null;
    actualCost: number;
  } | null;
}

export interface NpcAutoPurchaseDashboard {
  guild: { currentTurn: number; acquisitionInterval: number; acquisitionTurn: boolean };
  config: NpcAutoPurchaseConfig;
  doctrines: typeof NPC_AUTO_PURCHASE_DOCTRINES;
  countries: NpcAutoPurchaseDashboardCountry[];
}

const DEFAULT_CONFIG: Omit<NpcAutoPurchaseConfig, "guildId"> = {
  enabled: false,
  doctrine: "FULL_BUILDING_ARMY",
  budgetPercent: 70,
  targetFillPercent: 85,
  minimumReserve: 1_000,
  scope: "ALL_PLAYERLESS"
};

function assertPercent(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) throw new GameError(`${name} 1 ile 100 arasında olmalıdır.`);
}

function activePolicyKeys(settlement: CountryDocument["settlements"][number]): Array<CountryDocument["settlements"][number]["policies"][number]["policy_key"]> {
  return settlement.policies.filter((policy) => policy.status === "ACTIVE").map((policy) => policy.policy_key);
}

function validBuildingCandidates(doc: CountryDocument, doctrine: NpcAutoPurchaseDoctrine, spendLimit: number, buildingLimit: number): BuildingCandidate[] {
  if (buildingLimit <= 0) return [];
  const priority = npcBuildingPriority(doctrine);
  const developmentOnly = npcDevelopmentOnly(doctrine);
  const candidates: BuildingCandidate[] = [];
  for (const settlement of doc.settlements) {
    if (settlement.isBesieged) continue;
    const activeConstruction = settlement.buildings.filter((building) => building.status === "BUILDING").length;
    if (activeConstruction >= settlement.constructionLimit) continue;
    const occupiedSlots = settlement.buildings.filter((building) => building.level > 0 || building.status === "BUILDING").length;
    const policies = activePolicyKeys(settlement);
    for (let priorityIndex = 0; priorityIndex < priority.length; priorityIndex += 1) {
      const buildingType = priority[priorityIndex]!;
      const definition = BUILDINGS[buildingType];
      if (!definition) continue;
      const current = settlement.buildings.find((building) => building.building_type === buildingType);
      if (current?.status === "BUILDING") continue;
      if (developmentOnly && (!current || current.status !== "ACTIVE" || current.level !== 1 || definition.maxLevel < 2)) continue;
      const targetLevel = developmentOnly ? 2 : (current?.level ?? 0) + 1;
      if (targetLevel > definition.maxLevel) continue;
      if (!current && occupiedSlots >= settlement.slotLimit) continue;
      if (buildingType === "port" && !settlement.is_coastal) continue;
      if (buildingType === "shipyard" || buildingType === "customs_house") {
        const hasPort = settlement.buildings.some((building) => building.building_type === "port" && (building.status === "ACTIVE" || building.status === "BUILDING") && building.level >= 1);
        if (!hasPort) continue;
      }
      const baseTerms=buildingPurchaseTerms(buildingType,targetLevel,settlement.effectiveResources,policies,doc.country.active_formable_key,settlement.religionModifiers);
      const terms={...baseTerms,cost:modifiedBuildingPurchaseCost(baseTerms.cost,doc.greatProjectModifiers)};
      if (terms.cost > settlement.local_treasury || terms.cost > spendLimit) continue;
      candidates.push({
        settlementId: settlement.id,
        settlementName: settlement.name,
        buildingType,
        buildingName: definition.name,
        targetLevel,
        cost: terms.cost,
        isNew: !current,
        score: targetLevel * 100 + priorityIndex - Math.min(25, Math.floor(settlement.local_treasury / 10_000))
      });
    }
  }
  return candidates.sort((left, right) => left.score - right.score || left.settlementName.localeCompare(right.settlementName, "tr"));
}

const BASE_PURCHASABLE_UNITS: readonly PurchasableUnitType[] = [
  "light_infantry", "spear", "archer", "light_cavalry", "slinger", "heavy_infantry", "heavy_cavalry"
];

const COMPOSITION_TARGET = { line: 0.50, spear: 0.125, ranged: 0.1875, mobile: 0.1875 } as const;

const PREMIUM_UNITS = new Set<PurchasableUnitType>([
  "heavy_infantry", "heavy_cavalry",
  ...Object.keys(UNITS).filter((unitType) => !BASE_PURCHASABLE_UNITS.includes(unitType as PurchasableUnitType)
    && unitType !== "observer" && unitType !== "militia") as PurchasableUnitType[]
]);

export interface PurchasePlanningOptions {
  unitCandidates?: readonly PurchasableUnitType[];
  shipCandidates?: readonly (keyof typeof SHIPS)[];
  shipSelection?: "PRIORITY" | "BALANCED";
  qualityMixTarget?: number;
  compositionBaseline?: "CURRENT" | "EMPTY";
}

function currentArmyComposition(doc: CountryDocument): BattleComposition {
  const composition: BattleComposition = {};
  for (const settlement of doc.settlements) {
    for (const unit of settlement.units) {
      if (unit.force_type !== "ARMY" || unit.quantity <= 0 || unit.unit_type === "observer") continue;
      const unitType = unit.unit_type as BattleUnitType;
      composition[unitType] = (composition[unitType] ?? 0) + unit.quantity;
    }
    for (const pending of settlement.pendingRecruitment) {
      if (pending.quantity <= 0 || pending.unit_type === "observer" || pending.unit_type === "militia") continue;
      const unitType = pending.unit_type as BattleUnitType;
      composition[unitType] = (composition[unitType] ?? 0) + pending.quantity;
    }
  }
  return composition;
}

function compositionDistance(composition: BattleComposition, profile: ArmyCompositionProfile = "STANDARD"): number {
  const assessment = assessArmyComposition(composition, "FIELD", profile);
  if (profile !== "STANDARD") {
    const tierScore = { EXCELLENT: 0, BALANCED: 0.1, STANDARD: 0.25, LIMITED: 0.6, MONOTYPE: 1 }[assessment.tier];
    return tierScore + Math.pow(Math.max(0, assessment.dominantUnitShare - 0.55), 2);
  }
  const roleDistance = (Object.keys(COMPOSITION_TARGET) as Array<keyof typeof COMPOSITION_TARGET>)
    .reduce((sum, role) => sum + Math.pow(assessment.roleShares[role] - COMPOSITION_TARGET[role], 2), 0);
  const dominancePenalty = Math.pow(Math.max(0, assessment.dominantUnitShare - 0.55), 2) * 2;
  return roleDistance + dominancePenalty;
}

function qualityMixDistance(composition: BattleComposition, target: number): number {
  const total = Object.values(composition).reduce((sum, quantity) => sum + Math.max(0, quantity ?? 0), 0);
  if (total <= 0) return Math.abs(target);
  const premium = [...PREMIUM_UNITS].reduce((sum, unitType) => sum + Math.max(0, composition[unitType] ?? 0), 0);
  return Math.abs(premium / total - target);
}

function orderedCompositionNeeds(
  composition: BattleComposition,
  candidates: readonly PurchasableUnitType[],
  qualityMixTarget?: number,
  profile: ArmyCompositionProfile = "STANDARD"
): PurchasableUnitType[] {
  return [...candidates].sort((left, right) => {
    const leftProjected = { ...composition, [left]: (composition[left] ?? 0) + NPC_UNIT_PURCHASE_BATCH };
    const rightProjected = { ...composition, [right]: (composition[right] ?? 0) + NPC_UNIT_PURCHASE_BATCH };
    const leftScore = compositionDistance(leftProjected, profile)
      + (qualityMixTarget === undefined ? 0 : qualityMixDistance(leftProjected, qualityMixTarget) * 0.10);
    const rightScore = compositionDistance(rightProjected, profile)
      + (qualityMixTarget === undefined ? 0 : qualityMixDistance(rightProjected, qualityMixTarget) * 0.10);
    const scoreDifference = leftScore - rightScore;
    if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
    const quantityDifference = (composition[left] ?? 0) - (composition[right] ?? 0);
    if (quantityDifference !== 0) return quantityDifference;
    return candidates.indexOf(left) - candidates.indexOf(right);
  });
}

export function planCountryPurchases(
  doc: CountryDocument,
  config: NpcAutoPurchaseConfig,
  doctrine: NpcAutoPurchaseDoctrine,
  buildingAllowance = npcBuildingLimit(doctrine),
  options: PurchasePlanningOptions = {}
): NpcCountryPurchasePlan {
  const startingTreasury = doc.settlements.reduce((sum, settlement) => sum + Math.max(0, Number(settlement.local_treasury)), 0);
  const spendableAfterReserve = Math.max(0, startingTreasury - config.minimumReserve);
  const spendLimit = Math.min(spendableAfterReserve, Math.floor(startingTreasury * config.budgetPercent / 100));
  const localTreasury = new Map(doc.settlements.map((settlement) => [settlement.id, Math.max(0, Number(settlement.local_treasury))]));
  let remainingBudget = spendLimit;
  const buildingActions: BuildingAction[] = [];
  const buildingLimit = Math.max(0, Math.min(npcBuildingLimit(doctrine), buildingAllowance));
  const buildingCandidates = validBuildingCandidates(doc, doctrine, remainingBudget, buildingLimit);
  const plannedConstructionCount = new Map(doc.settlements.map((settlement) => [
    settlement.id,
    settlement.buildings.filter((building) => building.status === "BUILDING").length
  ]));
  const plannedNewSlots = new Map(doc.settlements.map((settlement) => [settlement.id, 0]));
  const selectedBuildingKeys = new Set<string>();
  for (const candidate of buildingCandidates) {
    if (buildingActions.length >= buildingLimit) break;
    const settlement = doc.settlements.find((item) => item.id === candidate.settlementId)!;
    const key = `${candidate.settlementId}:${candidate.buildingType}`;
    if (selectedBuildingKeys.has(key)) continue;
    if ((plannedConstructionCount.get(candidate.settlementId) ?? 0) >= settlement.constructionLimit) continue;
    const occupiedSlots = settlement.buildings.filter((building) => building.level > 0 || building.status === "BUILDING").length;
    if (candidate.isNew && occupiedSlots + (plannedNewSlots.get(candidate.settlementId) ?? 0) >= settlement.slotLimit) continue;
    const available = localTreasury.get(candidate.settlementId) ?? 0;
    if (candidate.cost > available || candidate.cost > remainingBudget) continue;
    const { score: _score, isNew, ...action } = candidate;
    buildingActions.push(action);
    selectedBuildingKeys.add(key);
    plannedConstructionCount.set(candidate.settlementId, (plannedConstructionCount.get(candidate.settlementId) ?? 0) + 1);
    if (isNew) plannedNewSlots.set(candidate.settlementId, (plannedNewSlots.get(candidate.settlementId) ?? 0) + 1);
    localTreasury.set(candidate.settlementId, available - candidate.cost);
    remainingBudget -= candidate.cost;
  }

  const desiredMilitary = Math.floor((doc.militaryLimit * config.targetFillPercent / 100) / NPC_UNIT_PURCHASE_BATCH) * NPC_UNIT_PURCHASE_BATCH;
  let remainingPersonnel = npcRecruitsUnits(doctrine)
    ? Math.max(0, desiredMilitary - doc.militaryUsed)
    : 0;
  const shipActions: ShipAction[] = [];
  if (npcPrioritizesShips(doctrine) && remainingPersonnel > 0) {
    const modifiers = formableModifiers(doc.country.active_formable_key);
    const shipyardBonus = modifiers.shipyardPointBonus ?? {};
    const bonusPoints = (shipyardBonus.kerkouros ?? 0) + (shipyardBonus.trireme ?? 0) * 2 + (shipyardBonus.quinquereme ?? 0) * 4;
    const productionRemaining = new Map<string, number>();
    const harborRemaining = new Map<string, number>();
    const shipyardLevels = new Map<string, number>();
    for (const settlement of doc.settlements) {
      const portLevel = settlement.buildings.find((building) => building.building_type === "port"
        && (building.status === "ACTIVE" || building.status === "BUILDING") && building.level >= 1)?.level ?? 0;
      const portActive = portLevel > 0;
      const shipyardLevel = settlement.buildings.find((building) => building.building_type === "shipyard" && building.status === "ACTIVE")?.level ?? 0;
      if (settlement.is_conquered || settlement.isBesieged || !portActive || shipyardLevel <= 0) continue;
      const basePoints = shipyardLevel === 1 ? 5 : shipyardLevel === 2 ? 10 : 15;
      const pontusBonus = doc.country.active_formable_key === "PONTUS" ? (shipyardLevel >= 3 ? 4 : shipyardLevel >= 2 ? 2 : 0) : 0;
      const usedProduction = settlement.pendingShips
        .filter((ship) => ship.ordered_turn === doc.guild.current_turn)
        .reduce((sum, ship) => sum + SHIPS[ship.ship_type].productionPoints * ship.quantity, 0);
      const usedHarbor = settlement.ships
        .filter((ship) => ship.status === "RESERVE")
        .reduce((sum, ship) => sum + shipHarborRequirement(ship.ship_type, ship.quantity), 0)
        + settlement.pendingShips.reduce((sum, ship) => sum + shipHarborRequirement(ship.ship_type, ship.quantity), 0);
      productionRemaining.set(settlement.id, Math.max(0, basePoints + bonusPoints + pontusBonus - usedProduction));
      harborRemaining.set(settlement.id, Math.max(0, portShipCapacity(portLevel) - usedHarbor));
      shipyardLevels.set(settlement.id, shipyardLevel);
    }
    const groupedShips = new Map<string, ShipAction>();
    const permittedShips = new Set(purchasableShipTypes(Boolean(doc.isScandinavianState)));
    const preferredShipOrder: Array<keyof typeof SHIPS> = ["quinquereme", "trireme", "hjortspring", "kerkouros"];
    const requestedShips = options.shipCandidates ?? preferredShipOrder;
    const shipPriority = [...new Set(requestedShips)].filter((shipType) => permittedShips.has(shipType));
    const plannedShipCounts = new Map(shipPriority.map((shipType) => [shipType, 0]));
    const minimumShipManpower = Math.min(...shipPriority.map((shipType) => SHIPS[shipType].manpower));
    while (shipPriority.length > 0 && remainingBudget > 0 && remainingPersonnel >= minimumShipManpower) {
      let selected: { settlement: CountryDocument["settlements"][number]; shipType: keyof typeof SHIPS; cost: number } | undefined;
      const currentPriority = options.shipSelection === "BALANCED"
        ? [...shipPriority].sort((left, right) =>
            (plannedShipCounts.get(left) ?? 0) - (plannedShipCounts.get(right) ?? 0)
            || shipPriority.indexOf(left) - shipPriority.indexOf(right))
        : shipPriority;
      for (const shipType of currentPriority) {
        const ship = SHIPS[shipType];
        const eligible = doc.settlements.filter((settlement) => {
          const level = shipyardLevels.get(settlement.id) ?? 0;
          if (!level || (shipType === "quinquereme" && level < 2)) return false;
          if ((productionRemaining.get(settlement.id) ?? 0) < ship.productionPoints) return false;
          if ((harborRemaining.get(settlement.id) ?? 0) < ship.harborPoints) return false;
          if (remainingPersonnel < ship.manpower) return false;
          const cost=modifiedShipPurchaseCost(shipType,1,settlement.effectiveResources,doc.country.active_formable_key,settlement.religionModifiers,doc.greatProjectModifiers);
          return cost <= remainingBudget && cost <= (localTreasury.get(settlement.id) ?? 0);
        }).sort((left, right) => (productionRemaining.get(right.id) ?? 0) - (productionRemaining.get(left.id) ?? 0)
          || (localTreasury.get(right.id) ?? 0) - (localTreasury.get(left.id) ?? 0));
        if (eligible[0]) {
          const settlement = eligible[0];
          selected={settlement,shipType,cost:modifiedShipPurchaseCost(shipType,1,settlement.effectiveResources,doc.country.active_formable_key,settlement.religionModifiers,doc.greatProjectModifiers)};
          break;
        }
      }
      if (!selected) break;
      const ship = SHIPS[selected.shipType];
      const key = `${selected.settlement.id}:${selected.shipType}`;
      const action = groupedShips.get(key) ?? { settlementId: selected.settlement.id, settlementName: selected.settlement.name, shipType: selected.shipType, quantity: 0, cost: 0 };
      action.quantity += 1;
      action.cost += selected.cost;
      groupedShips.set(key, action);
      plannedShipCounts.set(selected.shipType, (plannedShipCounts.get(selected.shipType) ?? 0) + 1);
      productionRemaining.set(selected.settlement.id, (productionRemaining.get(selected.settlement.id) ?? 0) - ship.productionPoints);
      harborRemaining.set(selected.settlement.id, (harborRemaining.get(selected.settlement.id) ?? 0) - ship.harborPoints);
      localTreasury.set(selected.settlement.id, (localTreasury.get(selected.settlement.id) ?? 0) - selected.cost);
      remainingPersonnel -= ship.manpower;
      remainingBudget -= selected.cost;
    }
    shipActions.push(...groupedShips.values());
  }
  remainingPersonnel = Math.floor(remainingPersonnel / NPC_UNIT_PURCHASE_BATCH) * NPC_UNIT_PURCHASE_BATCH;
  const settlementCapacity = new Map<string, number>();
  for (const settlement of doc.settlements) {
    const plannedShipPersonnel = shipActions
      .filter((action) => action.settlementId === settlement.id)
      .reduce((sum, action) => sum + SHIPS[action.shipType].manpower * action.quantity, 0);
    const capacity = settlement.is_conquered || settlement.isBesieged ? 0 : Math.max(0, Math.min(
      settlement.trainingRemaining,
      settlement.militaryLimit - settlement.militaryUsed - plannedShipPersonnel
    ));
    settlementCapacity.set(settlement.id, Math.floor(capacity / NPC_UNIT_PURCHASE_BATCH) * NPC_UNIT_PURCHASE_BATCH);
  }

  const unlockedSpecials: readonly PurchasableUnitType[] = doc.specialUnitUnlocks ?? [];
  const baseUnitSet = new Set<PurchasableUnitType>(BASE_PURCHASABLE_UNITS);
  const defaultCandidates = doc.isSteppeConfederation
    ? [...STEPPE_ARMY_UNIT_TYPES] as PurchasableUnitType[]
    : doc.isScandinavianState
      ? SCANDINAVIAN_ARMY_UNIT_TYPES.filter((unitType) => unlockedSpecials.includes(unitType)) as PurchasableUnitType[]
    : [...BASE_PURCHASABLE_UNITS, ...unlockedSpecials.filter((unitType) => !baseUnitSet.has(unitType))];
  const unlockedSet = new Set<PurchasableUnitType>(doc.isSteppeConfederation
    ? STEPPE_ARMY_UNIT_TYPES
    : doc.isScandinavianState
      ? SCANDINAVIAN_ARMY_UNIT_TYPES.filter((unitType) => unlockedSpecials.includes(unitType))
    : [...BASE_PURCHASABLE_UNITS, ...unlockedSpecials]);
  const unitCandidates = (options.unitCandidates ?? defaultCandidates).filter((unitType) => unlockedSet.has(unitType));
  const compositionProfile: ArmyCompositionProfile = doc.isSteppeConfederation ? "STEPPE" : doc.isScandinavianState ? "SCANDINAVIAN" : "STANDARD";
  const composition = options.compositionBaseline === "EMPTY" ? {} : currentArmyComposition(doc);
  const grouped = new Map<string, UnitAction>();
  while (remainingPersonnel >= NPC_UNIT_PURCHASE_BATCH && remainingBudget > 0) {
    let selected: { settlement: CountryDocument["settlements"][number]; unitType: PurchasableUnitType; cost: number } | undefined;
    for (const unitType of orderedCompositionNeeds(composition, unitCandidates, options.qualityMixTarget, compositionProfile)) {
      const eligible = doc.settlements
        .filter((settlement) => (settlementCapacity.get(settlement.id) ?? 0) >= NPC_UNIT_PURCHASE_BATCH)
        .map((settlement) => ({
          settlement,
          unitType,
          cost:modifiedUnitPurchaseCost(
            unitPurchaseCost(unitType,NPC_UNIT_PURCHASE_BATCH,settlement.effectiveResources,activePolicyKeys(settlement),doc.country.active_formable_key,settlement.religionModifiers),
            unitType,doc.greatProjectModifiers
          )
        }))
        .filter(({ settlement, cost }) => cost <= remainingBudget && cost <= (localTreasury.get(settlement.id) ?? 0))
        .sort((left, right) => (settlementCapacity.get(right.settlement.id) ?? 0) - (settlementCapacity.get(left.settlement.id) ?? 0)
          || (localTreasury.get(right.settlement.id) ?? 0) - (localTreasury.get(left.settlement.id) ?? 0));
      if (eligible[0]) {
        selected = eligible[0];
        break;
      }
    }
    if (!selected) break;
    const { settlement, unitType, cost } = selected;
    const key = `${settlement.id}:${unitType}`;
    const current = grouped.get(key) ?? { settlementId: settlement.id, settlementName: settlement.name, unitType, quantity: 0, cost: 0 };
    current.quantity += NPC_UNIT_PURCHASE_BATCH;
    current.cost += cost;
    grouped.set(key, current);
    composition[unitType] = (composition[unitType] ?? 0) + NPC_UNIT_PURCHASE_BATCH;
    settlementCapacity.set(settlement.id, (settlementCapacity.get(settlement.id) ?? 0) - NPC_UNIT_PURCHASE_BATCH);
    localTreasury.set(settlement.id, (localTreasury.get(settlement.id) ?? 0) - cost);
    remainingPersonnel -= NPC_UNIT_PURCHASE_BATCH;
    remainingBudget -= cost;
  }

  const unitActions = [...grouped.values()].map((action) => {
    const settlement = doc.settlements.find((item) => item.id === action.settlementId)!;
    return {...action,cost:modifiedUnitPurchaseCost(
      unitPurchaseCost(action.unitType,action.quantity,settlement.effectiveResources,activePolicyKeys(settlement),doc.country.active_formable_key,settlement.religionModifiers),
      action.unitType,doc.greatProjectModifiers
    )};
  });
  const plannedCost = buildingActions.reduce((sum, action) => sum + action.cost, 0)
    + shipActions.reduce((sum, action) => sum + action.cost, 0)
    + unitActions.reduce((sum, action) => sum + action.cost, 0);
  const notes: string[] = [];
  if (spendLimit <= 0) notes.push("Hazine rezervi nedeniyle harcanabilir bütçe yok.");
  if (npcRecruitsUnits(doctrine) && desiredMilitary <= doc.militaryUsed) notes.push("Hedef askerî doluluk zaten sağlanmış.");
  if (remainingPersonnel > 0) notes.push(`${remainingPersonnel.toLocaleString("tr-TR")} kişilik hedef; kapasite veya bütçe nedeniyle planlanamadı.`);
  if (buildingLimit > 0 && !buildingActions.length) notes.push(npcDevelopmentOnly(doctrine)
    ? "Seviye 2'ye yükseltilebilecek uygun ve karşılanabilir bina bulunamadı."
    : "Uygun, boş slotlu ve karşılanabilir bina emri bulunamadı.");
  return { countryId: doc.country.id, countryName: doc.country.name, doctrine, startingTreasury, spendLimit, plannedCost, buildingActions, shipActions, unitActions, notes };
}

async function countryOverrides(guildId: string): Promise<Map<string, { status: NpcCountryOverrideStatus; doctrine: NpcAutoPurchaseDoctrine | null }>> {
  const rows = (await pool.query<{ country_id: string; status: NpcCountryOverrideStatus; doctrine: NpcAutoPurchaseDoctrine | null }>(
    `SELECT override.country_id,override.status,override.doctrine
       FROM npc_auto_purchase_country_overrides override
       JOIN countries country ON country.id=override.country_id
      WHERE country.guild_id=$1`, [guildId]
  )).rows;
  return new Map(rows.map((row) => [row.country_id, { status: row.status, doctrine: row.doctrine }]));
}

async function eligibleCountryPlans(guildId: string, config: NpcAutoPurchaseConfig, onlyCountryId?: string): Promise<NpcCountryPurchasePlan[]> {
  const countries = await gameService.listCountries(guildId);
  const overrides = await countryOverrides(guildId);
  const plans: NpcCountryPurchasePlan[] = [];
  for (const country of countries) {
    if (onlyCountryId && country.id !== onlyCountryId) continue;
    const override = overrides.get(country.id);
    if (override?.status === "EXCLUDE") continue;
    if (config.scope === "INCLUDED_ONLY" && override?.status !== "INCLUDE") continue;
    const doc = await gameService.document(country.id);
    if (doc.playerIds.length) continue;
    const doctrine = override?.doctrine ?? config.doctrine;
    const buildingsStartedThisTurn = doc.settlements.reduce((total, settlement) => total
      + settlement.buildings.filter((building) => building.status === "BUILDING" && building.started_turn === doc.guild.current_turn).length, 0);
    const buildingAllowance = Math.max(0, npcBuildingLimit(doctrine) - buildingsStartedThisTurn);
    plans.push(planCountryPurchases(doc, config, doctrine, buildingAllowance));
  }
  return plans;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const npcAutoPurchaseService = {
  async dashboard(guildId: string): Promise<NpcAutoPurchaseDashboard> {
    const [config, guild, rows] = await Promise.all([
      this.config(guildId),
      gameService.guildState(guildId),
      pool.query<{
        id: string; name: string; treasury: number; local_treasury: number; population: number; settlement_count: number;
        override_status: NpcCountryOverrideStatus | null; override_doctrine: NpcAutoPurchaseDoctrine | null;
        run_turn: number | null; run_status: string | null; attempt_count: number | null; completed_at: string | null; summary: NpcCountryPurchaseResult | null;
      }>(
        `SELECT country.id,country.name,country.treasury,
                COALESCE(stats.local_treasury,0)::bigint AS local_treasury,
                COALESCE(stats.population,0)::bigint AS population,
                COALESCE(stats.settlement_count,0)::int AS settlement_count,
                override.status AS override_status,override.doctrine AS override_doctrine,
                run.acquisition_turn AS run_turn,run.status AS run_status,run.attempt_count,run.completed_at,run.summary
           FROM countries country
           LEFT JOIN npc_auto_purchase_country_overrides override ON override.country_id=country.id
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(settlement.local_treasury),0) AS local_treasury,
                    COALESCE(SUM(settlement.population+settlement.slave_population),0) AS population,
                    COUNT(*) AS settlement_count
               FROM settlements settlement WHERE settlement.country_id=country.id
           ) stats ON TRUE
           LEFT JOIN LATERAL (
             SELECT purchase.acquisition_turn,purchase.status,purchase.attempt_count,purchase.completed_at,purchase.summary
               FROM npc_auto_purchase_runs purchase WHERE purchase.country_id=country.id
              ORDER BY purchase.acquisition_turn DESC,purchase.completed_at DESC NULLS LAST LIMIT 1
           ) run ON TRUE
          WHERE country.guild_id=$1 AND country.status='ACTIVE'
            AND NOT EXISTS(SELECT 1 FROM country_members member WHERE member.country_id=country.id)
          ORDER BY country.name`,
        [guildId]
      )
    ]);
    const countries = rows.rows.map((row): NpcAutoPurchaseDashboardCountry => {
      const overrideStatus = row.override_status ?? "AUTO";
      const included = overrideStatus !== "EXCLUDE" && (config.scope === "ALL_PLAYERLESS" || overrideStatus === "INCLUDE");
      return {
        id: row.id,
        name: row.name,
        treasury: Number(row.treasury),
        localTreasury: Number(row.local_treasury),
        population: Number(row.population),
        settlementCount: Number(row.settlement_count),
        overrideStatus,
        overrideDoctrine: row.override_doctrine,
        effectiveDoctrine: row.override_doctrine ?? config.doctrine,
        included,
        lastRun: row.run_turn === null ? null : {
          turn: Number(row.run_turn),
          status: row.run_status ?? "UNKNOWN",
          attemptCount: Number(row.attempt_count ?? 1),
          completedAt: row.completed_at,
          actualCost: Number(row.summary?.actualCost ?? 0)
        }
      };
    });
    return {
      guild: {
        currentTurn: Number(guild.current_turn),
        acquisitionInterval: Number(guild.acquisition_interval),
        acquisitionTurn: isAcquisitionTurn(guild.current_turn,guild.acquisition_interval)
      },
      config,
      doctrines: NPC_AUTO_PURCHASE_DOCTRINES,
      countries
    };
  },

  async config(guildId: string): Promise<NpcAutoPurchaseConfig> {
    const row = (await pool.query<{
      enabled: boolean; doctrine: NpcAutoPurchaseDoctrine; budget_percent: number;
      target_fill_percent: number; minimum_reserve: number; scope: NpcAutoPurchaseScope;
    }>("SELECT enabled,doctrine,budget_percent,target_fill_percent,minimum_reserve,scope FROM npc_auto_purchase_configs WHERE guild_id=$1", [guildId])).rows[0];
    return row ? {
      guildId,
      enabled: row.enabled,
      doctrine: row.doctrine,
      budgetPercent: row.budget_percent,
      targetFillPercent: row.target_fill_percent,
      minimumReserve: row.minimum_reserve,
      scope: row.scope
    } : { guildId, ...DEFAULT_CONFIG };
  },

  async saveConfig(input: Omit<NpcAutoPurchaseConfig, "guildId"> & { guildId: string; actorId: string }): Promise<NpcAutoPurchaseConfig> {
    if (typeof input.enabled !== "boolean") throw new GameError("NPC otomatik alım durumu geçersiz.");
    assertPercent(input.budgetPercent, "Bütçe yüzdesi");
    assertPercent(input.targetFillPercent, "Hedef doluluk");
    if (!Number.isSafeInteger(input.minimumReserve) || input.minimumReserve < 0) throw new GameError("Asgari hazine rezervi negatif olamaz.");
    if (typeof input.doctrine !== "string" || !(input.doctrine in NPC_AUTO_PURCHASE_DOCTRINES)) throw new GameError("Geçersiz NPC doktrini.");
    if (input.scope !== "ALL_PLAYERLESS" && input.scope !== "INCLUDED_ONLY") throw new GameError("Geçersiz NPC alım kapsamı.");
    await gameService.ensureGuild(input.guildId);
    await pool.query(
      `INSERT INTO npc_auto_purchase_configs(guild_id,enabled,doctrine,budget_percent,target_fill_percent,minimum_reserve,scope,updated_by,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT(guild_id) DO UPDATE SET enabled=EXCLUDED.enabled,doctrine=EXCLUDED.doctrine,
         budget_percent=EXCLUDED.budget_percent,target_fill_percent=EXCLUDED.target_fill_percent,
         minimum_reserve=EXCLUDED.minimum_reserve,scope=EXCLUDED.scope,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [input.guildId, input.enabled, input.doctrine, input.budgetPercent, input.targetFillPercent, input.minimumReserve, input.scope, input.actorId]
    );
    return { guildId: input.guildId, enabled: input.enabled, doctrine: input.doctrine, budgetPercent: input.budgetPercent, targetFillPercent: input.targetFillPercent, minimumReserve: input.minimumReserve, scope: input.scope };
  },

  async setCountryOverride(input: { guildId: string; countryId: string; status: NpcCountryOverrideStatus; doctrine: NpcAutoPurchaseDoctrine | null; actorId: string }): Promise<void> {
    const country = await gameService.listCountries(input.guildId).then((countries) => countries.find((item) => item.id === input.countryId));
    if (!country) throw new GameError("Ülke bulunamadı.");
    if (!(["AUTO","INCLUDE","EXCLUDE"] as const).includes(input.status)) throw new GameError("Geçersiz NPC devlet kapsam ayarı.");
    if (input.doctrine !== null && (typeof input.doctrine !== "string" || !(input.doctrine in NPC_AUTO_PURCHASE_DOCTRINES))) throw new GameError("Geçersiz NPC doktrini.");
    await pool.query(
      `INSERT INTO npc_auto_purchase_country_overrides(country_id,status,doctrine,updated_by,updated_at)
       VALUES($1,$2,$3,$4,NOW())
       ON CONFLICT(country_id) DO UPDATE SET status=EXCLUDED.status,doctrine=EXCLUDED.doctrine,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [input.countryId, input.status, input.doctrine, input.actorId]
    );
  },

  async preview(guildId: string, countryId?: string): Promise<NpcCountryPurchasePlan[]> {
    const config = await this.config(guildId);
    const guild = await gameService.guildState(guildId);
    if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("NPC otomatik alım önizlemesi yalnızca Alım Turunda hazırlanabilir.");
    const plans = await eligibleCountryPlans(guildId, config, countryId);
    if (countryId && !plans.length) throw new GameError("Bu NPC devlet mevcut kapsamda otomatik alıma uygun değil. Devlet ayarını ve kapsamı kontrol edin.");
    return plans;
  },

  async execute(guildId: string, actorId: string, countryId?: string): Promise<NpcCountryPurchaseResult[]> {
    const lockClient = await pool.connect();
    const lockKey = "npc-auto-purchase:" + guildId;
    let locked = false;
    let discardClient = false;
    try {
      const lockResult = await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [lockKey]);
      locked = lockResult.rows[0]?.locked === true;
      if (!locked) throw new GameError("Bu sunucuda başka bir NPC otomatik alımı hâlen çalışıyor. Mevcut işlem tamamlandıktan sonra yeniden deneyin.");
    const config = await this.config(guildId);
    if (!config.enabled) throw new GameError("NPC otomatik alım sistemi kapalı. Önce `/npc-devlet-oto-alim ayarla` ile etkinleştirin.");
    const guild = await gameService.guildState(guildId);
    if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("NPC otomatik alımı yalnızca Alım Turunda çalıştırılabilir.");
    const plans = await eligibleCountryPlans(guildId, config, countryId);
    if (countryId && !plans.length) throw new GameError("Bu NPC devlet mevcut kapsamda otomatik alıma uygun değil. Devlet ayarını ve kapsamı kontrol edin.");
    const results: NpcCountryPurchaseResult[] = [];
    for (const plan of plans) {
      const claimed = await pool.query<{ attempt_count: number }>(
        "INSERT INTO npc_auto_purchase_runs(guild_id,acquisition_turn,country_id,doctrine,status,summary,attempt_count) " +
        "VALUES($1,$2,$3,$4,'RUNNING','{}'::jsonb,1) " +
        "ON CONFLICT(guild_id,acquisition_turn,country_id) DO UPDATE SET " +
        "doctrine=EXCLUDED.doctrine,status='RUNNING',summary='{}'::jsonb,completed_at=NULL,attempt_count=npc_auto_purchase_runs.attempt_count+1 " +
        "RETURNING attempt_count",
        [guildId, guild.current_turn, plan.countryId, plan.doctrine]
      );
      const runNumber = Number(claimed.rows[0]?.attempt_count ?? 1);
      const errors: string[] = [];
      let actualCost = 0;
      for (const action of plan.buildingActions) {
        try {
          const result = await gameService.purchaseBuilding({ guildId, actorId, countryId: plan.countryId, settlementId: action.settlementId, buildingType: action.buildingType });
          actualCost += result.cost;
        } catch (error) {
          errors.push(`${action.settlementName}: ${action.buildingName} alınamadı — ${errorMessage(error)}`);
        }
      }
      for (const action of plan.shipActions) {
        try {
          const result = await gameService.purchaseShips({ guildId, actorId, countryId: plan.countryId, settlementId: action.settlementId, shipType: action.shipType, quantity: action.quantity });
          actualCost += result.cost;
        } catch (error) {
          errors.push(`${action.settlementName}: ${action.quantity} ${SHIPS[action.shipType].name} alınamadı — ${errorMessage(error)}`);
        }
      }
      for (const action of plan.unitActions) {
        try {
          const result = await gameService.purchaseUnits({ guildId, actorId, countryId: plan.countryId, settlementId: action.settlementId, unitType: action.unitType, quantity: action.quantity });
          actualCost += result.cost;
        } catch (error) {
          errors.push(`${action.settlementName}: ${UNITS[action.unitType].name} alınamadı — ${errorMessage(error)}`);
        }
      }
      const attempted = plan.buildingActions.length + plan.shipActions.length + plan.unitActions.length;
      const status: NpcCountryPurchaseResult["status"] = errors.length === 0 ? "COMPLETE" : errors.length < attempted ? "PARTIAL" : "FAILED";
      const result: NpcCountryPurchaseResult = { ...plan, status, runNumber, actualCost, errors };
      await pool.query(
        "UPDATE npc_auto_purchase_runs SET status=$1,summary=$2::jsonb,completed_at=NOW() WHERE guild_id=$3 AND acquisition_turn=$4 AND country_id=$5",
        [status, JSON.stringify(result), guildId, guild.current_turn, plan.countryId]
      );
      results.push(result);
    }
    return results;
    } catch (error) {
      // Kilit sorgusu bağlantı hatasıyla sonuçlandıysa sunucu kilidi almış olabilir,
      // fakat cevabı görememiş olabiliriz. Bu oturumu havuza geri döndürmeyiz.
      if (!locked && !(error instanceof GameError)) discardClient = true;
      throw error;
    } finally {
      if (locked) {
        try {
          const unlockResult = await lockClient.query<{ unlocked: boolean }>("SELECT pg_advisory_unlock(hashtext($1)) AS unlocked", [lockKey]);
          if (unlockResult.rows[0]?.unlocked === false) discardClient = true;
        } catch {
          discardClient = true;
        }
      }
      lockClient.release(discardClient);
    }
  }
};
