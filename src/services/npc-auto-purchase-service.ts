import { BUILDINGS, PORT_SHIP_CAPACITY, SHIPS, UNITS, shipHarborRequirement } from "../domain/catalog.js";
import { assessArmyComposition, type BattleComposition, type BattleUnitType } from "../domain/battle.js";
import { isAcquisitionTurn } from "../domain/mobilization.js";
import {
  NPC_AUTO_PURCHASE_DOCTRINES, npcBuildingLimit, npcBuildingPriority, npcDevelopmentOnly, npcPrioritizesShips, npcRecruitsUnits,
  type NpcAutoPurchaseDoctrine, type PurchasableUnitType
} from "../domain/npc-auto-purchase.js";
import { pool } from "../db/pool.js";
import {
  GameError, buildingPurchaseTerms, gameService, unitPurchaseCost,
  type CountryDocument
} from "./game-service.js";
import { formableModifiers } from "../domain/formable-countries.js";
import { shipCostMultiplier } from "../domain/resources.js";

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

interface ShipAction {
  settlementId: string;
  settlementName: string;
  shipType: keyof typeof SHIPS;
  quantity: number;
  cost: number;
}

interface UnitAction {
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
      if (buildingType === "shipyard") {
        const hasPort = settlement.buildings.some((building) => building.building_type === "port" && building.status === "ACTIVE" && building.level >= 1);
        if (!hasPort) continue;
      }
      const terms = buildingPurchaseTerms(buildingType, targetLevel, settlement.effectiveResources, policies, doc.country.active_formable_key);
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

function compositionDistance(composition: BattleComposition): number {
  const assessment = assessArmyComposition(composition, "FIELD");
  const roleDistance = (Object.keys(COMPOSITION_TARGET) as Array<keyof typeof COMPOSITION_TARGET>)
    .reduce((sum, role) => sum + Math.pow(assessment.roleShares[role] - COMPOSITION_TARGET[role], 2), 0);
  const dominancePenalty = Math.pow(Math.max(0, assessment.dominantUnitShare - 0.55), 2) * 2;
  return roleDistance + dominancePenalty;
}

function orderedCompositionNeeds(composition: BattleComposition, candidates: readonly PurchasableUnitType[]): PurchasableUnitType[] {
  return [...candidates].sort((left, right) => {
    const leftProjected = { ...composition, [left]: (composition[left] ?? 0) + 1_000 };
    const rightProjected = { ...composition, [right]: (composition[right] ?? 0) + 1_000 };
    const scoreDifference = compositionDistance(leftProjected) - compositionDistance(rightProjected);
    if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
    const quantityDifference = (composition[left] ?? 0) - (composition[right] ?? 0);
    if (quantityDifference !== 0) return quantityDifference;
    return candidates.indexOf(left) - candidates.indexOf(right);
  });
}

export function planCountryPurchases(doc: CountryDocument, config: NpcAutoPurchaseConfig, doctrine: NpcAutoPurchaseDoctrine, buildingAllowance = npcBuildingLimit(doctrine)): NpcCountryPurchasePlan {
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

  const desiredMilitary = Math.floor((doc.militaryLimit * config.targetFillPercent / 100) / 1_000) * 1_000;
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
      const portActive = settlement.buildings.some((building) => building.building_type === "port" && building.status === "ACTIVE" && building.level >= 1);
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
      harborRemaining.set(settlement.id, Math.max(0, PORT_SHIP_CAPACITY - usedHarbor));
      shipyardLevels.set(settlement.id, shipyardLevel);
    }
    const groupedShips = new Map<string, ShipAction>();
    const shipPriority: Array<keyof typeof SHIPS> = ["quinquereme", "trireme", "kerkouros"];
    while (remainingBudget > 0 && remainingPersonnel >= SHIPS.kerkouros.manpower) {
      let selected: { settlement: CountryDocument["settlements"][number]; shipType: keyof typeof SHIPS; cost: number } | undefined;
      for (const shipType of shipPriority) {
        const ship = SHIPS[shipType];
        const eligible = doc.settlements.filter((settlement) => {
          const level = shipyardLevels.get(settlement.id) ?? 0;
          if (!level || (shipType === "quinquereme" && level < 2)) return false;
          if ((productionRemaining.get(settlement.id) ?? 0) < ship.productionPoints) return false;
          if ((harborRemaining.get(settlement.id) ?? 0) < ship.harborPoints) return false;
          if (remainingPersonnel < ship.manpower) return false;
          const cost = Math.ceil(ship.price * Math.max(0.5, shipCostMultiplier(settlement.effectiveResources) - (modifiers.shipDiscount ?? 0)));
          return cost <= remainingBudget && cost <= (localTreasury.get(settlement.id) ?? 0);
        }).sort((left, right) => (productionRemaining.get(right.id) ?? 0) - (productionRemaining.get(left.id) ?? 0)
          || (localTreasury.get(right.id) ?? 0) - (localTreasury.get(left.id) ?? 0));
        if (eligible[0]) {
          const settlement = eligible[0];
          selected = { settlement, shipType, cost: Math.ceil(ship.price * Math.max(0.5, shipCostMultiplier(settlement.effectiveResources) - (modifiers.shipDiscount ?? 0))) };
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
      productionRemaining.set(selected.settlement.id, (productionRemaining.get(selected.settlement.id) ?? 0) - ship.productionPoints);
      harborRemaining.set(selected.settlement.id, (harborRemaining.get(selected.settlement.id) ?? 0) - ship.harborPoints);
      localTreasury.set(selected.settlement.id, (localTreasury.get(selected.settlement.id) ?? 0) - selected.cost);
      remainingPersonnel -= ship.manpower;
      remainingBudget -= selected.cost;
    }
    shipActions.push(...groupedShips.values());
  }
  remainingPersonnel = Math.floor(remainingPersonnel / 1_000) * 1_000;
  const settlementCapacity = new Map<string, number>();
  for (const settlement of doc.settlements) {
    const plannedShipPersonnel = shipActions
      .filter((action) => action.settlementId === settlement.id)
      .reduce((sum, action) => sum + SHIPS[action.shipType].manpower * action.quantity, 0);
    const capacity = settlement.is_conquered || settlement.isBesieged ? 0 : Math.max(0, Math.min(
      settlement.trainingRemaining,
      settlement.militaryLimit - settlement.militaryUsed - plannedShipPersonnel
    ));
    settlementCapacity.set(settlement.id, Math.floor(capacity / 1_000) * 1_000);
  }

  const unlockedSpecials: readonly PurchasableUnitType[] = doc.specialUnitUnlocks ?? [];
  const baseUnitSet = new Set<PurchasableUnitType>(BASE_PURCHASABLE_UNITS);
  const unitCandidates = [...BASE_PURCHASABLE_UNITS, ...unlockedSpecials.filter((unitType) => !baseUnitSet.has(unitType))];
  const composition = currentArmyComposition(doc);
  const grouped = new Map<string, UnitAction>();
  while (remainingPersonnel >= 1_000 && remainingBudget > 0) {
    let selected: { settlement: CountryDocument["settlements"][number]; unitType: PurchasableUnitType; cost: number } | undefined;
    for (const unitType of orderedCompositionNeeds(composition, unitCandidates)) {
      const eligible = doc.settlements
        .filter((settlement) => (settlementCapacity.get(settlement.id) ?? 0) >= 1_000)
        .map((settlement) => ({
          settlement,
          unitType,
          cost: unitPurchaseCost(unitType, 1_000, settlement.effectiveResources, activePolicyKeys(settlement), doc.country.active_formable_key)
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
    current.quantity += 1_000;
    current.cost += cost;
    grouped.set(key, current);
    composition[unitType] = (composition[unitType] ?? 0) + 1_000;
    settlementCapacity.set(settlement.id, (settlementCapacity.get(settlement.id) ?? 0) - 1_000);
    localTreasury.set(settlement.id, (localTreasury.get(settlement.id) ?? 0) - cost);
    remainingPersonnel -= 1_000;
    remainingBudget -= cost;
  }

  const unitActions = [...grouped.values()].map((action) => {
    const settlement = doc.settlements.find((item) => item.id === action.settlementId)!;
    return { ...action, cost: unitPurchaseCost(action.unitType, action.quantity, settlement.effectiveResources, activePolicyKeys(settlement), doc.country.active_formable_key) };
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

async function eligibleCountryPlans(guildId: string, config: NpcAutoPurchaseConfig): Promise<NpcCountryPurchasePlan[]> {
  const countries = await gameService.listCountries(guildId);
  const overrides = await countryOverrides(guildId);
  const plans: NpcCountryPurchasePlan[] = [];
  for (const country of countries) {
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
    assertPercent(input.budgetPercent, "Bütçe yüzdesi");
    assertPercent(input.targetFillPercent, "Hedef doluluk");
    if (!Number.isSafeInteger(input.minimumReserve) || input.minimumReserve < 0) throw new GameError("Asgari hazine rezervi negatif olamaz.");
    if (!(input.doctrine in NPC_AUTO_PURCHASE_DOCTRINES)) throw new GameError("Geçersiz NPC doktrini.");
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
    if (input.doctrine && !(input.doctrine in NPC_AUTO_PURCHASE_DOCTRINES)) throw new GameError("Geçersiz NPC doktrini.");
    await pool.query(
      `INSERT INTO npc_auto_purchase_country_overrides(country_id,status,doctrine,updated_by,updated_at)
       VALUES($1,$2,$3,$4,NOW())
       ON CONFLICT(country_id) DO UPDATE SET status=EXCLUDED.status,doctrine=EXCLUDED.doctrine,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [input.countryId, input.status, input.doctrine, input.actorId]
    );
  },

  async preview(guildId: string): Promise<NpcCountryPurchasePlan[]> {
    const config = await this.config(guildId);
    const guild = await gameService.guildState(guildId);
    if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("NPC otomatik alım önizlemesi yalnızca Alım Turunda hazırlanabilir.");
    return eligibleCountryPlans(guildId, config);
  },

  async execute(guildId: string, actorId: string): Promise<NpcCountryPurchaseResult[]> {
    const lockClient = await pool.connect();
    const lockKey = "npc-auto-purchase:" + guildId;
    let locked = false;
    try {
      await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
      locked = true;
    const config = await this.config(guildId);
    if (!config.enabled) throw new GameError("NPC otomatik alım sistemi kapalı. Önce `/npc-devlet-oto-alim ayarla` ile etkinleştirin.");
    const guild = await gameService.guildState(guildId);
    if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("NPC otomatik alımı yalnızca Alım Turunda çalıştırılabilir.");
    const plans = await eligibleCountryPlans(guildId, config);
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
    } finally {
      if (locked) await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
      lockClient.release();
    }
  }
};
