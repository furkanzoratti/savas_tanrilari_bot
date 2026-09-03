import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { BUILD_DURATIONS, BUILDINGS, CITY_POLICIES, MAX_BUILDING_COST_DISCOUNT, MOBILIZATION_RULES, SHIPS, SIEGE_ASSETS, UNITS, buildingBaseCost, type CityPolicyKey } from "../domain/catalog.js";
import { buildingSlotLimit, calculatePopulationGain, calculateShipUpkeep, calculateUnitUpkeep, nextRuinStage } from "../domain/economy.js";
import { addIncomeBreakdowns, applyIncomePenalty, calculateCategorizedIncome, incomeTotal, populationTaxIncome, scaleIncome, type IncomeBreakdown } from "../domain/income.js";
import { createRecruitmentWaves, isAcquisitionTurn, militaryLimit, settlementMobilizationLimit, settlementTrainingCapacity } from "../domain/mobilization.js";
import { garrisonComposition, garrisonLevel } from "../domain/garrison.js";
import { currentRolePeriodRange, type RoleReportPeriod } from "../domain/role-periods.js";
import type { CultureGroup } from "../domain/cultures.js";
import type { CharacterRole, ForceType, Mobilization, RuinStage, ShipStatus, UnitStatus } from "../domain/types.js";
import { buildingCostMultiplier, buildingDurationReduction, shipCostMultiplier, siegeCostMultiplier, unitCostMultiplier, type ResourceType } from "../domain/resources.js";
import { settlementResourceAccess } from "./resource-service.js";
import { MERCENARY_COMPANIES, MERCENARY_CONTRACT_LIMITS, importedMercenarySchedule, mercenaryContractSchedule, mercenaryTerminationUpkeep, type MercenaryCompanyKey } from "../domain/mercenaries.js";
import { cancelActiveGarrisonReplenishment, completeDueGarrisonReplenishments, scheduleAllMissingGarrisons, scheduleMandatoryGarrisonReplenishment, type GarrisonReplenishmentReason } from "./garrison-service.js";
import { isSpecialUnitType, type SpecialUnitType } from "../domain/special-units.js";
import { FORMABLE_COUNTRIES, formableBuildingDiscount, formableModifiers, formableUnitDiscount, isFormableCountryKey, type FormableCountryKey } from "../domain/formable-countries.js";

export class GameError extends Error {}

interface GuildRow { discord_id: string; current_turn: number; turn_phase: string; acquisition_interval: number }
interface CountryRow { id: string; guild_id: string; name: string; treasury: number; mobilization: Mobilization; mobilization_started_turn: number | null; manpower_over_limit_since_turn: number | null; manpower_penalty_active: boolean; discord_role_id: string | null; status: "ACTIVE" | "YOK_EDİLDİ"; destroyed_turn: number | null; destroyed_reason: string | null; active_formable_key: FormableCountryKey | null }
interface SettlementRow {
  id: string; country_id: string; name: string; population: number; slave_population: number;
  base_income: number; tax_income: number; land_trade_income: number; sea_trade_income: number;
  base_population_growth: number; manual_flat_income: number;
  manual_income_percent: number; ruin_stage: RuinStage; resource_type: ResourceType; culture_group: CultureGroup;
  garrison_level: number; local_treasury: number; base_land_trade_income: number; is_conquered: boolean; conquered_turn: number | null;
  is_coastal: boolean; last_acquisition_income: number; curia_guard_granted: boolean;
  black_market_active: boolean; epidemic_active: boolean; unrest_active: boolean; rebellion_active: boolean;
}
interface BuildingRow { settlement_id: string; building_type: string; level: number; target_level: number | null; status: "ACTIVE" | "BUILDING"; started_turn: number | null; completion_turn: number | null }
interface SettlementIncomePenaltyRow {
  settlement_id: string;
  penalty_percent: number;
  remaining_acquisition_turns: number;
  reason: string;
  created_turn: number;
}

export type PendingPurchaseKind = "UNIT" | "SHIP" | "SIEGE" | "BUILDING";
export interface PendingPurchase {
  key: string;
  kind: PendingPurchaseKind;
  countryName: string;
  settlementName: string;
  itemName: string;
  quantity: number;
  refundableAmount: number;
  progressNote: string;
}

export interface PurchaseCancellationResult extends PendingPurchase {
  treasury: number;
}

export interface SettlementPolicyRow {
  id: string; settlement_id: string; policy_key: CityPolicyKey;
  slot: 1 | 2; status: "PENDING" | "ACTIVE"; activation_turn: number;
}
export interface CountryCharacter {
  id: string; country_id: string; name: string; role: CharacterRole; skill_bonus: number;
  assignment: "NONE" | "CURIA" | "AGORA"; trained_settlement_id: string | null;
  assigned_settlement_id: string | null; assigned_settlement_name: string | null;
  trained_settlement_name: string | null; trained_turn: number;
}
export interface AcademyTrainingSession {
  id: string; country_id: string; settlement_id: string; academy_level: number;
  acquisition_turn: number; roll_sides: 20 | 30 | 40; roll_value: number | null;
  excluded_role: CharacterRole | null; selected_role: CharacterRole | null;
  result_role: CharacterRole | null; skill_bonus: number;
  status: "PENDING_ROLL" | "AWAITING_NAME" | "COMPLETED" | "CANCELLED";
  initiated_by: string;
}

function activePolicyKeys(policies: readonly SettlementPolicyRow[]): CityPolicyKey[] {
  return policies.filter((policy) => policy.status === "ACTIVE").map((policy) => policy.policy_key);
}

function settlementStarvationBonus(buildings: Array<{ buildingType: string; level: number }>, policies: readonly CityPolicyKey[], formableKey?: FormableCountryKey | null): number {
  const farm = buildings.find((building) => building.buildingType === "farm")?.level ?? 0;
  const aqueduct = buildings.find((building) => building.buildingType === "aqueduct")?.level ?? 0;
  return Math.min(8, (farm >= 3 ? 3 : farm >= 2 ? 1 : 0) + (aqueduct >= 2 ? 2 : 0) + (policies.includes("GARRISON_REINFORCEMENT") ? 1 : 0) + (formableModifiers(formableKey).starvationBonus ?? 0));
}

function settlementUnrestChance(buildings: Array<{ buildingType: string; level: number }>, resources: readonly ResourceType[], policies: readonly CityPolicyKey[], formableKey?: FormableCountryKey | null): number {
  const lupanar = buildings.find((building) => building.buildingType === "lupanar")?.level ?? 0;
  const slaveCamp = buildings.find((building) => building.buildingType === "slave_camp")?.level ?? 0;
  const pantheon = buildings.find((building) => building.buildingType === "pantheon")?.level ?? 0;
  return Math.max(0, Math.min(100, lupanar * 10 + slaveCamp * 10 - (formableKey === "DACIA" && slaveCamp > 0 ? 5 : 0)
    + (policies.includes("STRICT_TAXATION") ? (["MEDIA", "PERSIS"].includes(formableKey ?? "") ? 7 : 10) : 0)
    - (pantheon > 0 ? 10 : 0)
    - (resources.includes("WINE") ? 10 : 0)
    - (resources.includes("AMBER") ? 10 : 0)));
}

function policyRecruitmentDiscount(policies: readonly CityPolicyKey[]): number {
  if (policies.includes("GARRISON_REINFORCEMENT") || policies.includes("CONSCRIPTION")) return 0.10;
  return policies.includes("WAR_PREPARATION") ? 0.05 : 0;
}

function applyFormablePopulationModifiers(baseGain: number, ruinStage: number, formableKey?: FormableCountryKey | null): number {
  const modifiers = formableModifiers(formableKey);
  const ruinRecoveryFactor = ruinStage === 2 && modifiers.ruinStageTwoIncomeMultiplier !== undefined
    ? modifiers.ruinStageTwoIncomeMultiplier / 0.50
    : 1;
  return Math.max(0, Math.floor(baseGain * ruinRecoveryFactor * (1 + (modifiers.populationGainPercent ?? 0))));
}

export function unitPurchaseCost(unitType: keyof typeof UNITS, quantity: number, resources: readonly ResourceType[], policies: readonly CityPolicyKey[], formableKey?: FormableCountryKey | null): number {
  const unit = UNITS[unitType];
  if (!unit) throw new GameError("Birim türü bulunamadı.");
  const combinedMultiplier = Math.max(0.50, unitCostMultiplier(unitType, resources) - policyRecruitmentDiscount(policies) - formableUnitDiscount(formableKey, unitType));
  return Math.ceil((quantity / 1_000) * unit.price * combinedMultiplier);
}

export function buildingPurchaseTerms(buildingType: string, targetLevel: number, resources: readonly ResourceType[], policies: readonly CityPolicyKey[], formableKey?: FormableCountryKey | null): { cost: number; duration: number } {
  const master = policies.includes("MASTER_ARCHITECTURE");
  const accelerated = policies.includes("ACCELERATED_CONSTRUCTION");
  const policyDiscount = master ? 0.10 : accelerated ? 0.05 : 0;
  const resourceDiscount = 1 - buildingCostMultiplier(buildingType, resources);
  const formableDiscount = formableBuildingDiscount(formableKey, buildingType);
  const multiplier = 1 - Math.min(MAX_BUILDING_COST_DISCOUNT, resourceDiscount + policyDiscount + formableDiscount);
  const durationReduction = buildingDurationReduction(buildingType, resources)
    + (master && targetLevel >= 2 ? 3 : accelerated ? 1 : 0)
    + (formableModifiers(formableKey).buildingDurationReduction ?? 0);
  return {
    cost: Math.ceil(buildingBaseCost(buildingType, targetLevel) * multiplier),
    duration: Math.max(1, BUILD_DURATIONS[targetLevel]! - durationReduction)
  };
}

export type MercenaryContractStatus = "PENDING" | "ACTIVE" | "UNPAID" | "ENDED" | "CANCELLED" | "DESTROYED";
export interface MercenaryContractDocument {
  id: string; company_key: MercenaryCompanyKey; companyName: string; country_id: string; settlement_id: string;
  settlement_name: string; status: MercenaryContractStatus; hired_turn: number; arrival_turn: number; end_turn: number | null;
  hire_cost: number; turn_upkeep: number; last_upkeep_turn: number | null; unpaid_since_turn: number | null;
  units: Array<{ unit_type: keyof typeof UNITS; initial_quantity: number; current_quantity: number }>;
  ships: Array<{ ship_type: keyof typeof SHIPS; initial_quantity: number; current_quantity: number }>;
  assets: Array<{ asset_type: keyof typeof SIEGE_ASSETS; initial_quantity: number; current_quantity: number }>;
}

export interface CountryDocument {
  guild: GuildRow;
  country: CountryRow;
  playerIds: string[];
  specialUnitUnlocks?: SpecialUnitType[];
  characters: CountryCharacter[];
  allies: Array<{ id: string; name: string }>;
  pacts: Array<{ id: string; name: string; purpose: string; founder_name: string }>;
  mercenaries: MercenaryContractDocument[];
  freePopulation: number;
  militaryUsed: number;
  militaryLimit: number;
  manpowerPenaltyActive: boolean;
  totalGrossIncome: number;
  totalPayableIncome: number;
  totalIncomeBreakdown: IncomeBreakdown;
  totalUpkeep: number;
  netIncome: number;
  tradeAgreements: Array<{ id: string; route: "LAND" | "SEA"; status: "PENDING" | "ACTIVE"; partner_name: string; proposer_settlement_name: string; receiver_settlement_name: string; proposer_resource: ResourceType; receiver_resource: ResourceType }>;
  settlements: Array<SettlementRow & {
    grossIncome: number;
    payableIncome: number;
    incomeBreakdown: IncomeBreakdown;
    buildingIncomeBonus: IncomeBreakdown;
    buildingUpkeep: number;
    unitUpkeep: number;
    shipUpkeep: number;
    mercenaryUpkeep: number;
    totalSettlementUpkeep: number;
    populationGain: number;
    militaryUsed: number;
    militaryLimit: number;
    trainingCapacity: number;
    trainingUsed: number;
    trainingRemaining: number;
    slotLimit: number;
    constructionLimit: number;
    incomePenalty?: SettlementIncomePenaltyRow | null;
    unrestRisk: number;
    starvationBonus: number;
    temporaryMilitia: number;
    assignedMerchant: boolean;
    merchantSkillBonus: number;
    policies: SettlementPolicyRow[];
    effectiveResources: ResourceType[];
    buildings: BuildingRow[];
    units: Array<{ unit_type: keyof typeof UNITS; quantity: number; status: UnitStatus; force_type: ForceType }>;
    ships: Array<{ ship_type: keyof typeof SHIPS; quantity: number; status: ShipStatus }>;
    siegeAssets: Array<{ asset_type: string; quantity: number; location_note: string | null }>;
    mercenaries: MercenaryContractDocument[];
    pendingRecruitment: Array<{ unit_type: keyof typeof UNITS; quantity: number; due_turn: number }>;
    pendingShips: Array<{ ship_type: keyof typeof SHIPS; quantity: number; completion_turn: number }>;
    pendingSiege: Array<{ asset_type: keyof typeof SIEGE_ASSETS; quantity: number; completion_turn: number }>;
    pendingGarrison?: Array<{ personnel_reserved: number; paid_amount: number; ordered_turn: number; completion_turn: number; reason: GarrisonReplenishmentReason }>;
  }>;
}

export interface TurnAdvanceResult {
  turn: number;
  acquisition: boolean;
  completedBuildings: number;
  recruitmentArrivals: number;
  completedShips: number;
  completedSiegeAssets: number;
  garrisonUpgrades: number;
  completedBuildingDetails: Array<{ settlementName: string; buildingName: string; level: number }>;
  recruitmentArrivalDetails: Array<{ settlementName: string; unitName: string; quantity: number }>;
  completedShipDetails: Array<{ settlementName: string; shipName: string; quantity: number }>;
  completedSiegeDetails: Array<{ settlementName: string; assetName: string; quantity: number }>;
  garrisonUpgradeDetails: string[];
  activatedPolicyDetails: Array<{ settlementName: string; policyName: string }>;
  unrestDetails: Array<{ settlementName: string; chance: number; roll: number }>;
  starvationDetails: Array<{ settlementName: string; remaining: number; capacity: number }>;
  garrisonReplenishmentStartedDetails: Array<{ settlementName: string; personnel: number; cost: number; completionTurn: number; reason: GarrisonReplenishmentReason }>;
  garrisonReplenishmentCompletedDetails: Array<{ settlementName: string; personnel: number }>;
  pantheonLoanDetails: Array<{ settlementName: string; amount: number; remaining: number }>;
  incomePenaltyDetails: Array<{ settlementName: string; percent: number; deductedAmount: number; remainingAcquisitionTurns: number; reason: string }>;
  mercenaryArrivalDetails: Array<{ countryName: string; settlementName: string; companyName: string; upkeep: number }>;
  mercenaryUpkeepDetails: Array<{ countryName: string; companyName: string; amount: number }>;
  mercenaryUnpaidDetails: Array<{ countryName: string; companyName: string; amount: number }>;
  mercenaryEndedDetails: Array<{ countryName: string; companyName: string; reason: string }>;
}

async function ensureGuild(client: DbClient, guildId: string): Promise<GuildRow> {
  await client.query("INSERT INTO guilds(discord_id) VALUES ($1) ON CONFLICT DO NOTHING", [guildId]);
  const result = await client.query<GuildRow>("SELECT * FROM guilds WHERE discord_id = $1", [guildId]);
  return result.rows[0]!;
}

async function getCountry(client: DbClient, countryId: string): Promise<CountryRow> {
  const result = await client.query<CountryRow>("SELECT * FROM countries WHERE id = $1", [countryId]);
  const country = result.rows[0];
  if (!country) throw new GameError("Ülke bulunamadı.");
  if (country.status !== "ACTIVE") throw new GameError("Bu ülke YOK EDİLDİ durumundadır ve oyun işlemi yapamaz.");
  return country;
}

async function getGuild(client: DbClient, guildId: string): Promise<GuildRow> {
  return ensureGuild(client, guildId);
}

async function syncCountryTreasury(client: DbClient, countryId: string): Promise<number> {
  const result = await client.query<{ treasury: number }>(
    `UPDATE countries
        SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1)
      WHERE id=$1 RETURNING treasury`,
    [countryId]
  );
  return Number(result.rows[0]?.treasury ?? 0);
}

async function adjustCountryLocalTreasuries(client: DbClient, countryId: string, amount: number): Promise<number> {
  const settlements = (await client.query<{ id: string; local_treasury: number }>(
    "SELECT id,local_treasury FROM settlements WHERE country_id=$1 ORDER BY local_treasury DESC,name,id FOR UPDATE",
    [countryId]
  )).rows;
  if (!settlements.length) {
    const changed = await client.query<{ treasury: number }>("UPDATE countries SET treasury=treasury+$1 WHERE id=$2 RETURNING treasury", [amount, countryId]);
    return Number(changed.rows[0]?.treasury ?? 0);
  }
  const currentTotal = settlements.reduce((sum, settlement) => sum + Number(settlement.local_treasury), 0);
  if (currentTotal + amount < 0) throw new GameError("Devlet hazinesi sıfırın altına düşemez.");
  if (amount >= 0) {
    await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2", [amount, settlements[0]!.id]);
  } else {
    let remaining = -amount;
    for (const settlement of settlements) {
      if (remaining <= 0) break;
      const deduction = Math.min(Math.max(0, Number(settlement.local_treasury)), remaining);
      if (deduction > 0) await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [deduction, settlement.id]);
      remaining -= deduction;
    }
  }
  return syncCountryTreasury(client, countryId);
}


export interface MercenaryUpkeepCollection {
  paid: Array<{ countryName: string; companyName: string; amount: number }>;
  unpaid: Array<{ countryName: string; companyName: string; amount: number }>;
}

async function collectMercenaryUpkeep(client: DbClient, guildId: string, turn: number): Promise<MercenaryUpkeepCollection> {
  const paid: MercenaryUpkeepCollection["paid"] = [];
  const unpaid: MercenaryUpkeepCollection["unpaid"] = [];
  const due = (await client.query<{
    id: string; country_id: string; country_name: string; company_key: MercenaryCompanyKey; turn_upkeep: number;
  }>(
    `SELECT mc.id,mc.country_id,c.name AS country_name,mc.company_key,mc.turn_upkeep
       FROM mercenary_contracts mc JOIN countries c ON c.id=mc.country_id
      WHERE mc.guild_id=$1 AND c.status='ACTIVE' AND mc.status IN ('ACTIVE','UNPAID')
        AND mc.arrival_turn<=$2
        AND COALESCE(mc.last_upkeep_turn,-1)<$2
        AND (mc.status='ACTIVE' OR mc.unpaid_since_turn=$2)
      ORDER BY c.name,mc.company_key FOR UPDATE OF mc`,
    [guildId, turn]
  )).rows;
  for (const contract of due) {
    const balances = (await client.query<{ local_treasury: number }>(
      "SELECT local_treasury FROM settlements WHERE country_id=$1 FOR UPDATE", [contract.country_id]
    )).rows;
    const available = balances.reduce((sum, row) => sum + Math.max(0, Number(row.local_treasury)), 0);
    const amount = Number(contract.turn_upkeep);
    const companyName = MERCENARY_COMPANIES[contract.company_key]?.name ?? contract.company_key;
    if (available >= amount) {
      await adjustCountryLocalTreasuries(client, contract.country_id, -amount);
      await client.query(
        "UPDATE mercenary_contracts SET status='ACTIVE',last_upkeep_turn=$1,unpaid_since_turn=NULL,updated_at=NOW() WHERE id=$2",
        [turn, contract.id]
      );
      await client.query(
        "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'MERCENARY_UPKEEP',$3,$4)",
        [contract.country_id, turn, -amount, companyName]
      );
      paid.push({ countryName: contract.country_name, companyName, amount });
    } else {
      await client.query(
        "UPDATE mercenary_contracts SET status='UNPAID',unpaid_since_turn=$1,updated_at=NOW() WHERE id=$2",
        [turn, contract.id]
      );
      unpaid.push({ countryName: contract.country_name, companyName, amount });
    }
  }
  return { paid, unpaid };
}

async function loadMercenaryContracts(client: DbClient, countryId: string): Promise<MercenaryContractDocument[]> {
  const contracts = (await client.query<Omit<MercenaryContractDocument, "companyName" | "units" | "ships" | "assets">>(
    `SELECT mc.id,mc.company_key,mc.country_id,mc.settlement_id,s.name AS settlement_name,mc.status,
            mc.hired_turn,mc.arrival_turn,mc.end_turn,mc.hire_cost,mc.turn_upkeep,mc.last_upkeep_turn,mc.unpaid_since_turn
       FROM mercenary_contracts mc JOIN settlements s ON s.id=mc.settlement_id
      WHERE mc.country_id=$1 AND mc.status IN ('PENDING','ACTIVE','UNPAID') ORDER BY mc.status,mc.arrival_turn,mc.company_key`, [countryId]
  )).rows;
  if (!contracts.length) return [];
  const ids = contracts.map((contract) => contract.id);
  const units = (await client.query<{ contract_id: string; unit_type: keyof typeof UNITS; initial_quantity: number; current_quantity: number }>(
    "SELECT * FROM mercenary_contract_units WHERE contract_id=ANY($1::uuid[]) ORDER BY unit_type", [ids]
  )).rows;
  const ships = (await client.query<{ contract_id: string; ship_type: keyof typeof SHIPS; initial_quantity: number; current_quantity: number }>(
    "SELECT * FROM mercenary_contract_ships WHERE contract_id=ANY($1::uuid[]) ORDER BY ship_type", [ids]
  )).rows;
  const assets = (await client.query<{ contract_id: string; asset_type: keyof typeof SIEGE_ASSETS; initial_quantity: number; current_quantity: number }>(
    "SELECT * FROM mercenary_contract_assets WHERE contract_id=ANY($1::uuid[]) ORDER BY asset_type", [ids]
  )).rows;
  return contracts.map((contract) => ({
    ...contract,
    companyName: MERCENARY_COMPANIES[contract.company_key]?.name ?? contract.company_key,
    units: units.filter((row) => row.contract_id === contract.id),
    ships: ships.filter((row) => row.contract_id === contract.id),
    assets: assets.filter((row) => row.contract_id === contract.id)
  }));
}

async function countryManpower(client: DbClient, countryId: string): Promise<{ population: number; used: number }> {
  const populationResult = await client.query<{ total: number }>(
    "SELECT COALESCE(SUM(population), 0)::bigint AS total FROM settlements WHERE country_id = $1 AND is_conquered=FALSE",
    [countryId]
  );
  const unitResult = await client.query<{ total: number }>(
    `SELECT COALESCE(SUM(u.quantity), 0)::bigint AS total
       FROM unit_stacks u JOIN settlements s ON s.id = u.settlement_id WHERE s.country_id = $1`,
    [countryId]
  );
  const pendingResult = await client.query<{ total: number }>(
    "SELECT COALESCE(SUM(remaining_quantity), 0)::bigint AS total FROM recruitment_orders WHERE country_id = $1 AND status = 'TRAINING'",
    [countryId]
  );
  const pendingGarrison = await client.query<{ total: number }>(
    "SELECT COALESCE(SUM(personnel_reserved),0)::bigint AS total FROM garrison_replenishment_orders WHERE country_id=$1 AND status='BUILDING'",
    [countryId]
  );
  const ships = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>(
    `SELECT n.ship_type, SUM(n.quantity)::integer AS quantity
       FROM naval_units n JOIN settlements s ON s.id = n.settlement_id
      WHERE s.country_id = $1 GROUP BY n.ship_type`, [countryId]
  );
  const pendingShips = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>(
    "SELECT ship_type, SUM(quantity)::integer AS quantity FROM naval_orders WHERE country_id = $1 AND status = 'BUILDING' GROUP BY ship_type",
    [countryId]
  );
  const shipManpower = [...ships.rows, ...pendingShips.rows]
    .reduce((sum, row) => sum + (SHIPS[row.ship_type]?.manpower ?? 0) * row.quantity, 0);
  return {
    population: populationResult.rows[0]?.total ?? 0,
    used: (unitResult.rows[0]?.total ?? 0) + (pendingResult.rows[0]?.total ?? 0) + (pendingGarrison.rows[0]?.total ?? 0) + shipManpower
  };
}

async function settlementManpower(client: DbClient, settlementId: string): Promise<number> {
  const units = await client.query<{ total: number }>("SELECT COALESCE(SUM(quantity),0)::bigint AS total FROM unit_stacks WHERE settlement_id=$1", [settlementId]);
  const pending = await client.query<{ total: number }>("SELECT COALESCE(SUM(remaining_quantity),0)::bigint AS total FROM recruitment_orders WHERE settlement_id=$1 AND status='TRAINING'", [settlementId]);
  const pendingGarrison = await client.query<{ total: number }>("SELECT COALESCE(SUM(personnel_reserved),0)::bigint AS total FROM garrison_replenishment_orders WHERE settlement_id=$1 AND status='BUILDING'", [settlementId]);
  const ships = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>("SELECT ship_type,SUM(quantity)::integer AS quantity FROM naval_units WHERE settlement_id=$1 GROUP BY ship_type", [settlementId]);
  const pendingShips = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>("SELECT ship_type,SUM(quantity)::integer AS quantity FROM naval_orders WHERE settlement_id=$1 AND status='BUILDING' GROUP BY ship_type", [settlementId]);
  const shipManpower = [...ships.rows, ...pendingShips.rows].reduce((sum, row) => sum + (SHIPS[row.ship_type]?.manpower ?? 0) * row.quantity, 0);
  return (units.rows[0]?.total ?? 0) + (pending.rows[0]?.total ?? 0) + (pendingGarrison.rows[0]?.total ?? 0) + shipManpower;
}

async function countryHasMaintenanceDebt(client: DbClient, countryId: string): Promise<boolean> {
  const result = await client.query("SELECT 1 FROM settlements WHERE country_id=$1 AND local_treasury<0 LIMIT 1", [countryId]);
  return Boolean(result.rowCount);
}

async function settlementIsBesieged(client: DbClient, settlementId: string): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM battles WHERE defender_settlement_id=$1 AND terrain='SIEGE' AND status NOT IN ('FINISHED','CANCELLED') LIMIT 1",
    [settlementId]
  );
  return Boolean(result.rowCount);
}

async function audit(client: DbClient, guildId: string, actorId: string, action: string, entityType: string, entityId: string | null, details: unknown): Promise<void> {
  await client.query(
    "INSERT INTO audit_logs(guild_id, actor_user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId, actorId, action, entityType, entityId, JSON.stringify(details)]
  );
}

async function activeTradeBonuses(client: DbClient, countryId: string): Promise<Map<string, { land: number; sea: number }>> {
  const result = await client.query<{ settlement_id: string; route: "LAND" | "SEA"; amount: number }>(
    `SELECT settlement_id,route,SUM(income_per_country)::integer AS amount FROM (
       SELECT proposer_settlement_id AS settlement_id,route,income_per_country
         FROM trade_agreements WHERE proposer_country_id=$1 AND status='ACTIVE'
       UNION ALL
       SELECT receiver_settlement_id AS settlement_id,route,income_per_country
         FROM trade_agreements WHERE receiver_country_id=$1 AND status='ACTIVE' AND receiver_settlement_id IS NOT NULL
     ) active_routes GROUP BY settlement_id,route`,
    [countryId]
  );
  const bonuses = new Map<string, { land: number; sea: number }>();
  for (const row of result.rows) {
    const current = bonuses.get(row.settlement_id) ?? { land: 0, sea: 0 };
    if (row.route === "LAND") current.land += row.amount;
    else current.sea += row.amount;
    bonuses.set(row.settlement_id, current);
  }
  return bonuses;
}

async function ensureStandardGarrison(
  client: DbClient,
  settlementId: string,
  population: number,
  currentLevel: number,
  force = false
): Promise<boolean> {
  const nextLevel = garrisonLevel(population);
  if (!force && nextLevel <= currentLevel) return false;
  const composition = garrisonComposition(population);
  const rows: Array<[keyof typeof UNITS, number]> = [
    ["light_infantry", composition.lightInfantry],
    ["spear", composition.spears],
    ["archer", composition.archers]
  ];
  for (const [unitType, quantity] of rows) {
    if (quantity <= 0) continue;
    await client.query(
      `INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
       VALUES($1,$2,$3,'GARRISON','GARRISON')
       ON CONFLICT(settlement_id,unit_type,status,force_type)
       DO UPDATE SET quantity=GREATEST(unit_stacks.quantity,EXCLUDED.quantity)`,
      [settlementId, unitType, quantity]
    );
  }
  await client.query("UPDATE settlements SET garrison_level=$1 WHERE id=$2", [nextLevel, settlementId]);
  return nextLevel > currentLevel;
}

export const gameService = {
  async guildState(guildId: string): Promise<GuildRow> {
    const client = await pool.connect();
    try { return await ensureGuild(client, guildId); } finally { client.release(); }
  },

  async ensureGuild(guildId: string): Promise<void> {
    const client = await pool.connect();
    try { await ensureGuild(client, guildId); } finally { client.release(); }
  },

  async countryForUser(guildId: string, userId: string): Promise<CountryRow | null> {
    const result = await pool.query<CountryRow>(
      `SELECT c.* FROM countries c
        JOIN country_members cm ON cm.country_id = c.id
       WHERE c.guild_id = $1 AND c.status='ACTIVE' AND cm.discord_user_id = $2
       ORDER BY c.name LIMIT 1`, [guildId, userId]
    );
    return result.rows[0] ?? null;
  },

  async countryByName(guildId: string, name: string): Promise<CountryRow | null> {
    const result = await pool.query<CountryRow>(
      "SELECT * FROM countries WHERE guild_id = $1 AND status='ACTIVE' AND lower(name) = lower($2) LIMIT 1", [guildId, name]
    );
    return result.rows[0] ?? null;
  },

  async listCountries(guildId: string): Promise<CountryRow[]> {
    const result = await pool.query<CountryRow>("SELECT * FROM countries WHERE guild_id = $1 AND status='ACTIVE' ORDER BY name", [guildId]);
    return result.rows;
  },

  async listDestroyedCountries(guildId: string): Promise<CountryRow[]> {
    const result = await pool.query<CountryRow>(
      "SELECT * FROM countries WHERE guild_id=$1 AND status='YOK_EDİLDİ' ORDER BY destroyed_turn DESC NULLS LAST,name",
      [guildId]
    );
    return result.rows;
  },

  async restoreCountry(input: { guildId: string; actorId: string; countryName: string }): Promise<CountryRow> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      const guild = await getGuild(client, input.guildId);
      const country = (await client.query<CountryRow>(
        "SELECT * FROM countries WHERE guild_id=$1 AND status='YOK_EDİLDİ' AND (id::text=$2 OR lower(name)=lower($2)) FOR UPDATE",
        [input.guildId, input.countryName.trim()]
      )).rows[0];
      if (!country) throw new GameError("YOK EDİLDİ durumunda belirtilen ülke bulunamadı.");
      const restored = (await client.query<CountryRow>(
        `UPDATE countries
            SET status='ACTIVE',destroyed_turn=NULL,destroyed_reason=NULL,destroyed_by=NULL,destroyed_at=NULL,discord_role_id=NULL
          WHERE id=$1 RETURNING *`,
        [country.id]
      )).rows[0]!;
      await audit(client, input.guildId, input.actorId, "COUNTRY_RESTORE", "country", country.id, {
        name: country.name,
        restoredTurn: guild.current_turn,
        previousDestroyedTurn: country.destroyed_turn,
        previousDestroyedReason: country.destroyed_reason
      });
      return restored;
    });
  },

  async formCountry(input: { guildId: string; actorId: string; currentCountryName: string; formableKeyInput: string }): Promise<{ countryId: string; previousName: string; formedName: string; formableKey: FormableCountryKey; discordRoleId: string | null; buffs: readonly string[] }> {
    if (!isFormableCountryKey(input.formableKeyInput)) throw new GameError("Geçersiz kurulabilir ülke seçimi.");
    const formableKey: FormableCountryKey = input.formableKeyInput;
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`formation:${input.guildId}`]);
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Ülke yalnızca Alım Turunun başında kurulabilir.");
      const country = (await client.query<CountryRow>("SELECT * FROM countries WHERE guild_id=$1 AND status='ACTIVE' AND lower(name)=lower($2) FOR UPDATE", [input.guildId, input.currentCountryName])).rows[0];
      if (!country) throw new GameError("Mevcut ülke bulunamadı.");
      const definition = FORMABLE_COUNTRIES[formableKey];
      if (country.active_formable_key === formableKey) throw new GameError(`Bu devlet zaten ${definition.name} kimliğini kullanıyor.`);
      const previousFormation = await client.query("SELECT 1 FROM country_formations WHERE country_id=$1 AND formable_key=$2", [country.id, formableKey]);
      if (previousFormation.rowCount) throw new GameError("Bir devlet daha önce terk ettiği kurulabilir ülke kimliğine geri dönemez.");
      const nameConflict = await client.query("SELECT 1 FROM countries WHERE guild_id=$1 AND id<>$2 AND lower(name)=lower($3)", [input.guildId, country.id, definition.name]);
      if (nameConflict.rowCount) throw new GameError(`Sunucuda ${definition.name} adlı başka bir devlet bulunuyor.`);
      const settlements = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE country_id=$1 FOR UPDATE", [country.id])).rows;
      if (!settlements.length) throw new GameError("Topraksız bir devlet kurulabilir ülkeye dönüşemez.");
      const unstable = settlements.find((settlement) => settlement.is_conquered || settlement.rebellion_active);
      if (unstable) throw new GameError(`**${unstable.name}** işgal/asimilasyon veya açık isyan durumunda. Formlama için bütün yerleşkeler istikrarlı olmalıdır.`);
      for (const settlement of settlements) {
        if (await settlementIsBesieged(client, settlement.id)) throw new GameError(`**${settlement.name}** kuşatma altında olduğu için ülke formlanamaz.`);
      }
      await client.query("UPDATE countries SET name=$1,active_formable_key=$2 WHERE id=$3", [definition.name, formableKey, country.id]);
      await client.query(`INSERT INTO country_formations(country_id,guild_id,previous_name,formable_key,formed_name,formed_turn,formed_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [country.id, input.guildId, country.name, formableKey, definition.name, guild.current_turn, input.actorId]);
      await audit(client, input.guildId, input.actorId, "COUNTRY_FORMED", "country", country.id, { previousName: country.name, formedName: definition.name, formableKey: formableKey, turn: guild.current_turn });
      return { countryId: country.id, previousName: country.name, formedName: definition.name, formableKey: formableKey, discordRoleId: country.discord_role_id, buffs: definition.buffs };
    });
  },
  async setCountryDiscordRole(guildId: string, actorId: string, countryId: string, roleId: string | null): Promise<void> {
    await withTransaction(async (client) => {
      const country = await getCountry(client, countryId);
      if (country.guild_id !== guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      await client.query("UPDATE countries SET discord_role_id=$1 WHERE id=$2", [roleId, countryId]);
      await audit(client, guildId, actorId, "COUNTRY_ROLE_SET", "country", countryId, { roleId });
    });
  },

  async listSettlements(countryId: string): Promise<SettlementRow[]> {
    const result = await pool.query<SettlementRow>("SELECT * FROM settlements WHERE country_id = $1 ORDER BY name", [countryId]);
    return result.rows;
  },

  async transferSettlementTreasury(input: {
    guildId: string; actorId: string; countryId: string;
    sourceSettlementId: string; targetSettlementId: string; amount: number;
  }): Promise<{
    sourceName: string; targetName: string; amount: number;
    sourceBalance: number; targetBalance: number; countryTreasury: number;
  }> {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new GameError("Taşınacak altın miktarı pozitif bir tam sayı olmalıdır.");
    }
    if (input.sourceSettlementId === input.targetSettlementId) {
      throw new GameError("Kaynak ve hedef şehir aynı olamaz.");
    }
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["country:" + input.countryId]);
      const guild = await getGuild(client, input.guildId);
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlements = (await client.query<SettlementRow>(
        "SELECT * FROM settlements WHERE id::text=ANY($1::text[]) ORDER BY id FOR UPDATE",
        [[input.sourceSettlementId, input.targetSettlementId]]
      )).rows;
      const source = settlements.find((settlement) => settlement.id === input.sourceSettlementId);
      const target = settlements.find((settlement) => settlement.id === input.targetSettlementId);
      if (!source || !target || source.country_id !== country.id || target.country_id !== country.id) {
        throw new GameError("Kaynak ve hedef şehirlerin ikisi de kendi ülkenize ait olmalıdır.");
      }
      const sourceTreasury = Number(source.local_treasury);
      const targetTreasury = Number(target.local_treasury);
      const maximum = Math.max(0, Math.floor(sourceTreasury * 0.50));
      if (input.amount > maximum) {
        throw new GameError("Kaynak şehrin mevcut hazinesinin en fazla %50'si taşınabilir. Güncel sınır: " + maximum.toLocaleString("tr-TR") + " Altın.");
      }
      const transferClaim = await client.query(
        `INSERT INTO settlement_treasury_transfers(
           guild_id,country_id,turn,source_settlement_id,target_settlement_id,amount,actor_user_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(guild_id,country_id,turn) DO NOTHING RETURNING id`,
        [input.guildId, country.id, guild.current_turn, source.id, target.id, input.amount, input.actorId]
      );
      if (!transferClaim.rowCount) {
        throw new GameError(`Bu devlet Tur ${guild.current_turn} içinde hazine taşıma hakkını zaten kullandı. Her devlet bu komutu tur başına yalnızca bir kez kullanabilir.`);
      }
      const sourceBalance = sourceTreasury - input.amount;
      const targetBalance = targetTreasury + input.amount;
      await client.query("UPDATE settlements SET local_treasury=$1 WHERE id=$2", [sourceBalance, source.id]);
      await client.query("UPDATE settlements SET local_treasury=$1 WHERE id=$2", [targetBalance, target.id]);
      const countryTreasury = await syncCountryTreasury(client, country.id);
      await client.query(
        "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES ($1,$2,'SETTLEMENT_TRANSFER_OUT',$3,$4),($1,$2,'SETTLEMENT_TRANSFER_IN',$5,$6)",
        [country.id, guild.current_turn, -input.amount, source.name + " -> " + target.name, input.amount, source.name + " -> " + target.name]
      );
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_TREASURY_TRANSFER", "country", country.id, {
        sourceSettlementId: source.id,
        targetSettlementId: target.id,
        amount: input.amount,
        maximum,
        sourceBalance,
        targetBalance
      });
      return { sourceName: source.name, targetName: target.name, amount: input.amount, sourceBalance, targetBalance, countryTreasury };
    });
  },

  async playerIds(countryId: string): Promise<string[]> {
    const result = await pool.query<{ discord_user_id: string }>("SELECT discord_user_id FROM country_members WHERE country_id=$1 ORDER BY discord_user_id", [countryId]);
    return result.rows.map((row) => row.discord_user_id);
  },
  async specialUnitUnlocks(countryId: string): Promise<SpecialUnitType[]> {
    const result = await pool.query<{ unit_type: SpecialUnitType }>(
      "SELECT unit_type FROM country_special_unit_unlocks WHERE country_id=$1 ORDER BY unit_type",
      [countryId]
    );
    return result.rows.map((row) => row.unit_type);
  },

  async setSpecialUnitUnlock(input: { guildId: string; actorId: string; countryId: string; unitType: SpecialUnitType; enabled: boolean }): Promise<void> {
    if (!isSpecialUnitType(input.unitType)) throw new GameError("Geçersiz özel birlik türü.");
    await withTransaction(async (client) => {
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      if (input.enabled) {
        await client.query(
          "INSERT INTO country_special_unit_unlocks(country_id,unit_type,granted_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [country.id, input.unitType, input.actorId]
        );
      } else {
        await client.query("DELETE FROM country_special_unit_unlocks WHERE country_id=$1 AND unit_type=$2", [country.id, input.unitType]);
      }
      await audit(client, input.guildId, input.actorId, input.enabled ? "SPECIAL_UNIT_UNLOCK" : "SPECIAL_UNIT_LOCK", "country", country.id, { unitType: input.unitType });
    });
  },

  async createCountry(guildId: string, actorId: string, name: string, treasury: number): Promise<CountryRow> {
    return withTransaction(async (client) => {
      await ensureGuild(client, guildId);
      const result = await client.query<CountryRow>(
        "INSERT INTO countries(guild_id, name, treasury) VALUES ($1,$2,$3) RETURNING *",
        [guildId, name.trim(), treasury]
      );
      const country = result.rows[0]!;
      await audit(client, guildId, actorId, "COUNTRY_CREATE", "country", country.id, { name, treasury });
      return country;
    });
  },

  async assignPlayer(guildId: string, actorId: string, countryId: string, userId: string): Promise<void> {
    await withTransaction(async (client) => {
      const country = await getCountry(client, countryId);
      if (country.guild_id !== guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      await client.query(
        "INSERT INTO country_members(country_id, discord_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [countryId, userId]
      );
      await audit(client, guildId, actorId, "PLAYER_ASSIGN", "country", countryId, { userId });
    });
  },

  async removePlayer(guildId: string, actorId: string, countryId: string, userId: string): Promise<void> {
    await withTransaction(async (client) => {
      const country = await getCountry(client, countryId);
      if (country.guild_id !== guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const removed = await client.query(
        "DELETE FROM country_members WHERE country_id=$1 AND discord_user_id=$2 RETURNING discord_user_id",
        [countryId, userId]
      );
      if (!removed.rowCount) throw new GameError("Bu oyuncu seçilen ülkeye atanmış değil.");
      await audit(client, guildId, actorId, "PLAYER_REMOVE", "country", countryId, { userId });
    });
  },
  async createSettlement(input: {
    guildId: string; actorId: string; countryId: string; name: string; population: number;
    slaves: number; totalIncome: number; basePopulationGrowth: number;
    resourceType: ResourceType; cultureGroup: CultureGroup; isCoastal?: boolean;
  }): Promise<SettlementRow> {
    const taxIncome = populationTaxIncome(input.population);
    if (input.totalIncome < taxIncome) throw new GameError(`Başlangıç geliri, nüfustan doğan ${taxIncome.toLocaleString("tr-TR")} Altın halk vergisinden düşük olamaz.`);
    const landTradeIncome = input.totalIncome - taxIncome;
    return withTransaction(async (client) => {
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const existingSettlementCount = Number((await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM settlements WHERE country_id=$1", [country.id])).rows[0]?.count ?? 0);
      const startingLocalTreasury = existingSettlementCount === 0 ? country.treasury : 0;
      const result = await client.query<SettlementRow>(
        `INSERT INTO settlements(
          country_id,name,population,slave_population,base_income,tax_income,land_trade_income,sea_trade_income,base_land_trade_income,base_population_growth,resource_type,culture_group,local_treasury,is_coastal
        ) VALUES ($1,$2,$3,$4,0,0,0,0,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [input.countryId, input.name.trim(), input.population, input.slaves, landTradeIncome, input.basePopulationGrowth, input.resourceType, input.cultureGroup, startingLocalTreasury, input.isCoastal ?? false]
      );
      const settlement = result.rows[0]!;
      await ensureStandardGarrison(client, settlement.id, settlement.population, settlement.garrison_level, true);
      settlement.garrison_level = garrisonLevel(settlement.population);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_CREATE", "settlement", settlement.id, input);
      return settlement;
    });
  },

  async setSettlementCulture(input: { guildId: string; actorId: string; countryId: string; settlementId: string; cultureGroup: CultureGroup }): Promise<void> {
    await withTransaction(async (client) => {
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const changed = await client.query("UPDATE settlements SET culture_group=$1 WHERE id=$2 AND country_id=$3 RETURNING id", [input.cultureGroup, input.settlementId, country.id]);
      if (!changed.rowCount) throw new GameError("Yerleşke bulunamadı.");
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_CULTURE_SET", "settlement", input.settlementId, { cultureGroup: input.cultureGroup });
    });
  },

  async assimilateSettlement(input: { guildId: string; actorId: string; countryId: string; settlementId: string }): Promise<void> {
    await withTransaction(async (client) => {
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const changed = await client.query(
        "UPDATE settlements SET is_conquered=FALSE,conquered_turn=NULL WHERE id=$1 AND country_id=$2 RETURNING id",
        [input.settlementId, country.id]
      );
      if (!changed.rowCount) throw new GameError("Yerleşke bulunamadı.");
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_ASSIMILATED", "settlement", input.settlementId, {});
    });
  },

  async destroyCountry(input: { guildId: string; actorId: string; countryId: string; reason: string }): Promise<{ name: string; turn: number; discordRoleId: string | null }> {
    const reason = input.reason.trim();
    if (reason.length < 2 || reason.length > 500) throw new GameError("Yok edilme açıklaması 2–500 karakter arasında olmalıdır.");
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const guild = await getGuild(client, input.guildId);
      const country = (await client.query<CountryRow>("SELECT * FROM countries WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.countryId, input.guildId])).rows[0];
      if (!country) throw new GameError("Ülke bulunamadı.");
      if (country.status !== "ACTIVE") throw new GameError("Bu ülke zaten YOK EDİLDİ durumunda.");
      const settlements = Number((await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM settlements WHERE country_id=$1", [country.id])).rows[0]?.count ?? 0);
      if (settlements > 0) throw new GameError(`Ülke yok edilmeden önce kalan ${settlements} yerleşkenin devredilmesi veya silinmesi gerekir.`);
      const activeWars = Number((await client.query<{ count: number }>(
        `SELECT COUNT(DISTINCT war.id)::integer AS count FROM state_wars war
          JOIN state_war_participants participant ON participant.war_id=war.id
          WHERE war.status='ACTIVE' AND participant.country_id=$1`, [country.id]
      )).rows[0]?.count ?? 0);
      if (activeWars > 0) throw new GameError(`Ülkenin ${activeWars} aktif resmî savaşı var. Önce /savas-sonlandir ile kapatılmalıdır.`);
      const activeBattles = Number((await client.query<{ count: number }>(
        `SELECT COUNT(DISTINCT battle.id)::integer AS count FROM battles battle
          WHERE battle.status NOT IN ('FINISHED','CANCELLED') AND (
            EXISTS (SELECT 1 FROM battle_sides side WHERE side.battle_id=battle.id AND side.country_id=$1)
            OR EXISTS (SELECT 1 FROM battle_side_participants participant WHERE participant.battle_id=battle.id AND participant.country_id=$1)
          )`, [country.id]
      )).rows[0]?.count ?? 0);
      if (activeBattles > 0) throw new GameError(`Ülkenin ${activeBattles} devam eden savaş ekranı var. Önce savaşlar sonuçlandırılmalıdır.`);
      const foundedPacts = Number((await client.query<{ count: number }>(
        "SELECT COUNT(*)::integer AS count FROM diplomatic_pacts WHERE founder_country_id=$1", [country.id]
      )).rows[0]?.count ?? 0);
      if (foundedPacts > 0) throw new GameError("Ülke " + foundedPacts + " paktın lideri. Önce liderlik devredilmeli veya pakt dağıtılmalıdır.");
      const contracts = Number((await client.query<{ count: number }>(
        "SELECT COUNT(*)::integer AS count FROM mercenary_contracts WHERE country_id=$1 AND status IN ('PENDING','ACTIVE','UNPAID')", [country.id]
      )).rows[0]?.count ?? 0);
      if (contracts > 0) throw new GameError(`Ülkenin ${contracts} canlı paralı asker sözleşmesi var. Önce sözleşmeler kapatılmalıdır.`);
      await client.query("UPDATE country_alliances SET status=CASE WHEN status='ACTIVE' THEN 'ENDED' ELSE 'CANCELLED' END,ended_at=NOW() WHERE status IN ('PENDING','ACTIVE') AND (proposer_country_id=$1 OR receiver_country_id=$1)", [country.id]);
      await client.query("UPDATE pact_invitations SET status='CANCELLED',responded_by=$2,responded_at=NOW() WHERE status='PENDING' AND (inviter_country_id=$1 OR receiver_country_id=$1)", [country.id, input.actorId]);
      await client.query("UPDATE trade_agreements SET status='ENDED',ended_at=NOW() WHERE status IN ('PENDING','ACTIVE') AND (proposer_country_id=$1 OR receiver_country_id=$1)", [country.id]);
      await client.query("UPDATE country_vassalages SET status='ENDED',ended_turn=$2,ended_by=$3,ended_at=NOW() WHERE status='ACTIVE' AND (overlord_country_id=$1 OR vassal_country_id=$1)", [country.id, guild.current_turn, input.actorId]);
      await client.query("DELETE FROM country_members WHERE country_id=$1", [country.id]);
      await client.query(
        "UPDATE countries SET status='YOK_EDİLDİ',destroyed_turn=$2,destroyed_reason=$3,destroyed_by=$4,destroyed_at=NOW(),discord_role_id=NULL WHERE id=$1",
        [country.id, guild.current_turn, reason, input.actorId]
      );
      await audit(client, input.guildId, input.actorId, "COUNTRY_DESTROY", "country", country.id, { name: country.name, turn: guild.current_turn, reason });
      return { name: country.name, turn: guild.current_turn, discordRoleId: country.discord_role_id };
    });
  },

  async deleteSettlement(input: { guildId: string; actorId: string; countryId: string; settlementId: string }): Promise<{ name: string }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      await client.query("DELETE FROM settlements WHERE id=$1", [settlement.id]);
      await syncCountryTreasury(client, country.id);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_DELETE", "settlement", settlement.id, { name: settlement.name, countryId: country.id });
      return { name: settlement.name };
    });
  },

  async reduceSettlementPopulation(input: { guildId: string; actorId: string; countryId: string; settlementId: string; populationType: "FREE" | "SLAVE"; amount: number }): Promise<{ remaining: number }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      if (!Number.isInteger(input.amount) || input.amount <= 0) throw new GameError("Silinecek nüfus miktarı pozitif bir tam sayı olmalıdır.");
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      const current = input.populationType === "FREE" ? settlement.population : settlement.slave_population;
      if (input.amount > current) throw new GameError(`Yerleşkede yalnızca ${current.toLocaleString("tr-TR")} ${input.populationType === "FREE" ? "özgür" : "köle"} nüfus bulunuyor.`);
      const column = input.populationType === "FREE" ? "population" : "slave_population";
      const remaining = current - input.amount;
      await client.query(`UPDATE settlements SET ${column}=$1 WHERE id=$2`, [remaining, settlement.id]);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_POPULATION_DELETE", "settlement", settlement.id, { populationType: input.populationType, amount: input.amount, remaining });
      return { remaining };
    });
  },

  async listMercenaryContracts(countryId: string): Promise<MercenaryContractDocument[]> {
    const client = await pool.connect();
    try { return await loadMercenaryContracts(client, countryId); }
    finally { client.release(); }
  },

  async availableMercenaryCompanyKeys(guildId: string): Promise<MercenaryCompanyKey[]> {
    const unavailable = new Set((await pool.query<{ company_key: MercenaryCompanyKey }>(
      "SELECT DISTINCT company_key FROM mercenary_contracts WHERE guild_id=$1 AND status IN ('PENDING','ACTIVE','UNPAID')",
      [guildId]
    )).rows.map((row) => row.company_key));
    return (Object.keys(MERCENARY_COMPANIES) as MercenaryCompanyKey[]).filter((companyKey) => !unavailable.has(companyKey));
  },

  async hireMercenary(input: { guildId: string; actorId: string; countryId: string; settlementId: string; companyKey: MercenaryCompanyKey }): Promise<{ contract: MercenaryContractDocument; cost: number }> {
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ulke bu sunucuya ait degil.");
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleske bulunamadi.");
      const company = MERCENARY_COMPANIES[input.companyKey];
      if (!company) throw new GameError("Parali asker sirketi bulunamadi.");
      if (await settlementIsBesieged(client, settlement.id)) throw new GameError("Kusatma altindaki yerleskeye parali asker kiralanamaz.");

      const unavailable = await client.query("SELECT 1 FROM mercenary_contracts WHERE guild_id=$1 AND company_key=$2 AND status IN ('PENDING','ACTIVE','UNPAID') FOR UPDATE", [input.guildId, input.companyKey]);
      if (unavailable.rowCount) throw new GameError("Bu parali asker grubu halen baska bir sozlesmeye bagli.");
      const currentContracts = await loadMercenaryContracts(client, country.id);
      const slotLimit = MERCENARY_CONTRACT_LIMITS[country.mobilization];
      if (currentContracts.length >= slotLimit) throw new GameError("Her devlet aynı anda en fazla 1 canlı paralı asker sözleşmesine sahip olabilir.");
      const hasGold = Boolean((await client.query("SELECT 1 FROM settlements WHERE country_id=$1 AND resource_type='GOLD' LIMIT 1", [country.id])).rowCount);
      const cost = Math.ceil(company.hireCost * (hasGold ? 0.90 : 1));
      await adjustCountryLocalTreasuries(client, country.id, -cost);
      const { arrivalTurn } = mercenaryContractSchedule(guild.current_turn);
      const inserted = (await client.query<{ id: string }>(
        `INSERT INTO mercenary_contracts(guild_id,company_key,country_id,settlement_id,status,hired_turn,arrival_turn,hire_cost,turn_upkeep,created_by)
         VALUES($1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9) RETURNING id`,
        [input.guildId,input.companyKey,country.id,settlement.id,guild.current_turn,arrivalTurn,cost,company.turnUpkeep,input.actorId]
      )).rows[0]!;
      for (const [unitType, quantity] of Object.entries(company.land ?? {})) {
        await client.query("INSERT INTO mercenary_contract_units(contract_id,unit_type,initial_quantity,current_quantity) VALUES($1,$2,$3,$3)", [inserted.id,unitType,quantity]);
      }
      for (const [shipType, quantity] of Object.entries(company.ships ?? {})) {
        await client.query("INSERT INTO mercenary_contract_ships(contract_id,ship_type,initial_quantity,current_quantity) VALUES($1,$2,$3,$3)", [inserted.id,shipType,quantity]);
      }
      for (const [assetType, quantity] of Object.entries(company.siege ?? {})) {
        await client.query("INSERT INTO mercenary_contract_assets(contract_id,asset_type,initial_quantity,current_quantity) VALUES($1,$2,$3,$3)", [inserted.id,assetType,quantity]);
      }
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'MERCENARY_HIRE',$3,$4)", [country.id,guild.current_turn,-cost,company.name]);
      await audit(client,input.guildId,input.actorId,"MERCENARY_HIRE","mercenary_contract",inserted.id,{companyKey:input.companyKey,cost,arrivalTurn,indefinite:true});
      return { contract: (await loadMercenaryContracts(client,country.id)).find((contract) => contract.id===inserted.id)!, cost };
    });
  },


  async importMercenary(input: { guildId: string; actorId: string; countryId: string; settlementId: string; companyKey: MercenaryCompanyKey }): Promise<MercenaryContractDocument> {
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      const company = MERCENARY_COMPANIES[input.companyKey];
      if (!company) throw new GameError("Paralı asker şirketi bulunamadı.");

      const unavailable = await client.query("SELECT 1 FROM mercenary_contracts WHERE guild_id=$1 AND company_key=$2 AND status IN ('PENDING','ACTIVE','UNPAID') FOR UPDATE", [input.guildId, input.companyKey]);
      if (unavailable.rowCount) throw new GameError("Bu paralı asker grubu halen başka bir sözleşmeye bağlı.");
      const currentContracts = await loadMercenaryContracts(client, country.id);
      const slotLimit = MERCENARY_CONTRACT_LIMITS[country.mobilization];
      if (currentContracts.length >= slotLimit) throw new GameError("Her devlet aynı anda en fazla 1 canlı paralı asker sözleşmesine sahip olabilir.");

      const { hiredTurn, arrivalTurn, firstUpkeepTurn } = importedMercenarySchedule(guild.current_turn);
      const inserted = (await client.query<{ id: string }>(
        `INSERT INTO mercenary_contracts(guild_id,company_key,country_id,settlement_id,status,hired_turn,arrival_turn,hire_cost,turn_upkeep,last_upkeep_turn,created_by)
         VALUES($1,$2,$3,$4,'ACTIVE',$5,$6,0,$7,$6,$8) RETURNING id`,
        [input.guildId, input.companyKey, country.id, settlement.id, hiredTurn, arrivalTurn, company.turnUpkeep, input.actorId]
      )).rows[0]!;
      for (const [unitType, quantity] of Object.entries(company.land ?? {})) {
        await client.query("INSERT INTO mercenary_contract_units(contract_id,unit_type,initial_quantity,current_quantity) VALUES($1,$2,$3,$3)", [inserted.id, unitType, quantity]);
      }
      for (const [shipType, quantity] of Object.entries(company.ships ?? {})) {
        await client.query("INSERT INTO mercenary_contract_ships(contract_id,ship_type,initial_quantity,current_quantity) VALUES($1,$2,$3,$3)", [inserted.id, shipType, quantity]);
      }
      for (const [assetType, quantity] of Object.entries(company.siege ?? {})) {
        await client.query("INSERT INTO mercenary_contract_assets(contract_id,asset_type,initial_quantity,current_quantity) VALUES($1,$2,$3,$3)", [inserted.id, assetType, quantity]);
      }
      await audit(client, input.guildId, input.actorId, "MERCENARY_IMPORT", "mercenary_contract", inserted.id, {
        companyKey: input.companyKey, cost: 0, arrivalTurn, indefinite: true, firstUpkeepTurn
      });
      return (await loadMercenaryContracts(client, country.id)).find((contract) => contract.id === inserted.id)!;
    });
  },


  async collectAllMercenaryUpkeep(input: { guildId: string; actorId: string }): Promise<{ turn: number } & MercenaryUpkeepCollection> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) {
        throw new GameError("Toplu paralı asker bakımı yalnızca Alım Turunda tahsil edilebilir.");
      }
      const result = await collectMercenaryUpkeep(client, input.guildId, guild.current_turn);
      await audit(client, input.guildId, input.actorId, "MERCENARY_UPKEEP_BULK", "guild", input.guildId, {
        turn: guild.current_turn, paid: result.paid, unpaid: result.unpaid
      });
      return { turn: guild.current_turn, ...result };
    });
  },

  async payMercenaryUpkeep(input: { guildId: string; actorId: string; countryId: string; companyKey: MercenaryCompanyKey }): Promise<number> {
    return withTransaction(async (client) => {
      const guild=await getGuild(client,input.guildId);
      const contract=(await client.query<{id:string;turn_upkeep:number;unpaid_since_turn:number|null}>("SELECT id,turn_upkeep,unpaid_since_turn FROM mercenary_contracts WHERE guild_id=$1 AND country_id=$2 AND company_key=$3 AND status='UNPAID' FOR UPDATE",[input.guildId,input.countryId,input.companyKey])).rows[0];
      if(!contract)throw new GameError("Odenmemis bakimi bulunan sozlesme yok.");
      const amount=Number(contract.turn_upkeep);
      await adjustCountryLocalTreasuries(client,input.countryId,-amount);
      await client.query("UPDATE mercenary_contracts SET status='ACTIVE',last_upkeep_turn=$1,unpaid_since_turn=NULL,updated_at=NOW() WHERE id=$2",[guild.current_turn,contract.id]);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'MERCENARY_UPKEEP',$3,$4)",[input.countryId,guild.current_turn,-amount,MERCENARY_COMPANIES[input.companyKey].name]);
      await audit(client,input.guildId,input.actorId,"MERCENARY_UPKEEP_PAY","mercenary_contract",contract.id,{amount});
      return amount;
    });
  },

  async endMercenary(input: { guildId: string; actorId: string; countryId: string; companyKey: MercenaryCompanyKey }): Promise<number> {
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      const contract = (await client.query<{
        id: string; status: MercenaryContractStatus; hired_turn: number;
        turn_upkeep: number; last_upkeep_turn: number | null;
      }>(
        "SELECT id,status,hired_turn,turn_upkeep,last_upkeep_turn FROM mercenary_contracts WHERE guild_id=$1 AND country_id=$2 AND company_key=$3 AND status IN ('PENDING','ACTIVE','UNPAID') FOR UPDATE",
        [input.guildId, input.countryId, input.companyKey]
      )).rows[0];
      if (!contract) throw new GameError("Etkin sözleşme bulunamadı.");
      const inBattle = await client.query(
        `SELECT 1 FROM battle_mercenary_assignments bma JOIN battles b ON b.id=bma.battle_id
          WHERE bma.contract_id=$1 AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,
        [contract.id]
      );
      if (inBattle.rowCount) throw new GameError("Etkin savaşa katılan şirketin sözleşmesi feshedilemez.");

      const prorated = mercenaryTerminationUpkeep({
        turnUpkeep: Number(contract.turn_upkeep), hiredTurn: contract.hired_turn,
        currentTurn: guild.current_turn, acquisitionInterval: guild.acquisition_interval,
        lastUpkeepTurn: contract.last_upkeep_turn, unpaid: contract.status === "UNPAID"
      });
      const compensation = prorated.amount;
      const chargedTurns = compensation ? prorated.chargedTurns : 0;
      if (compensation) await adjustCountryLocalTreasuries(client, input.countryId, -compensation);
      await client.query("UPDATE mercenary_contracts SET status=$1,updated_at=NOW() WHERE id=$2", [contract.status === "PENDING" ? "CANCELLED" : "ENDED", contract.id]);
      if (compensation) await client.query(
        "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'MERCENARY_TERMINATION',$3,$4)",
        [input.countryId, guild.current_turn, -compensation, `${MERCENARY_COMPANIES[input.companyKey].name} • ${chargedTurns}/${guild.acquisition_interval} tur bakım`]
      );
      await audit(client, input.guildId, input.actorId, "MERCENARY_END", "mercenary_contract", contract.id, { compensation, chargedTurns, acquisitionInterval: guild.acquisition_interval });
      return compensation;
    });
  },

  async moveMercenary(input: { guildId: string; actorId: string; countryId: string; companyKey: MercenaryCompanyKey; settlementId: string }): Promise<string> {
    return withTransaction(async (client) => {
      const contract=(await client.query<{id:string}>("SELECT id FROM mercenary_contracts WHERE guild_id=$1 AND country_id=$2 AND company_key=$3 AND status='ACTIVE' FOR UPDATE",[input.guildId,input.countryId,input.companyKey])).rows[0];
      if(!contract)throw new GameError("Hareket edebilen etkin sozlesme bulunamadi.");
      const settlement=(await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE",[input.settlementId,input.countryId])).rows[0];
      if(!settlement)throw new GameError("Hedef yerleske bulunamadi.");
      if(await settlementIsBesieged(client,settlement.id))throw new GameError("Kusatma altindaki yerleskeye tasinilamaz.");
      const company=MERCENARY_COMPANIES[input.companyKey];
      if(company.ships){
        const port=await client.query("SELECT 1 FROM buildings WHERE settlement_id=$1 AND building_type='port' AND status='ACTIVE' AND level>0",[settlement.id]);
        if(!settlement.is_coastal||!port.rowCount)throw new GameError("Kiralik filo yalnizca Liman bulunan kiyi yerleskesine tasinabilir.");
      }
      const inBattle=await client.query(`SELECT 1 FROM battle_mercenary_assignments bma JOIN battles b ON b.id=bma.battle_id WHERE bma.contract_id=$1 AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,[contract.id]);
      if(inBattle.rowCount)throw new GameError("Etkin savastaki sirket tasinamaz.");
      await client.query("UPDATE mercenary_contracts SET settlement_id=$1,updated_at=NOW() WHERE id=$2",[settlement.id,contract.id]);
      await audit(client,input.guildId,input.actorId,"MERCENARY_MOVE","mercenary_contract",contract.id,{settlementId:settlement.id});
      return settlement.name;
    });
  },

  async adjustMercenaryQuantity(input: { guildId: string; actorId: string; countryId: string; companyKey: MercenaryCompanyKey; kind: "UNIT"|"SHIP"|"ASSET"; itemType: string; quantity: number }): Promise<void> {
    await withTransaction(async (client) => {
      const contract=(await client.query<{id:string}>("SELECT id FROM mercenary_contracts WHERE guild_id=$1 AND country_id=$2 AND company_key=$3 AND status IN ('PENDING','ACTIVE','UNPAID') FOR UPDATE",[input.guildId,input.countryId,input.companyKey])).rows[0];
      if(!contract)throw new GameError("Etkin sozlesme bulunamadi.");
      const table=input.kind==="UNIT"?"mercenary_contract_units":input.kind==="SHIP"?"mercenary_contract_ships":"mercenary_contract_assets";
      const column=input.kind==="UNIT"?"unit_type":input.kind==="SHIP"?"ship_type":"asset_type";
      const valid=input.kind==="UNIT"?input.itemType in UNITS:input.kind==="SHIP"?input.itemType in SHIPS:input.itemType in SIEGE_ASSETS;
      if(!valid)throw new GameError("Gecersiz birlik, gemi veya alet turu.");
      await client.query(`INSERT INTO ${table}(contract_id,${column},initial_quantity,current_quantity) VALUES($1,$2,$3,$3)
        ON CONFLICT(contract_id,${column}) DO UPDATE SET current_quantity=EXCLUDED.current_quantity`,[contract.id,input.itemType,input.quantity]);
      await audit(client,input.guildId,input.actorId,"MERCENARY_ADJUST","mercenary_contract",contract.id,{kind:input.kind,itemType:input.itemType,quantity:input.quantity});
    });
  },

  async addMercenaryLoss(input: { guildId: string; actorId: string; countryId: string; companyKey: MercenaryCompanyKey; unitType: keyof typeof UNITS; quantity: number }): Promise<{ previous: number; remaining: number; destroyed: boolean }> {
    return withTransaction(async (client) => {
      if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new GameError("Kayıp miktarı pozitif bir tam sayı olmalıdır.");
      if (!(input.unitType in UNITS) || input.unitType === "observer" || input.unitType === "militia") throw new GameError("Geçersiz paralı asker birimi.");
      const contract = (await client.query<{ id: string }>(
        "SELECT id FROM mercenary_contracts WHERE guild_id=$1 AND country_id=$2 AND company_key=$3 AND status IN ('PENDING','ACTIVE','UNPAID') FOR UPDATE",
        [input.guildId, input.countryId, input.companyKey]
      )).rows[0];
      if (!contract) throw new GameError("Canlı paralı asker sözleşmesi bulunamadı.");
      const unit = (await client.query<{ current_quantity: number }>(
        "SELECT current_quantity FROM mercenary_contract_units WHERE contract_id=$1 AND unit_type=$2 FOR UPDATE",
        [contract.id, input.unitType]
      )).rows[0];
      if (!unit) throw new GameError("Bu şirketin kadrosunda seçilen birlik bulunmuyor.");
      const previous = Number(unit.current_quantity);
      if (input.quantity > previous) throw new GameError(`Şirkette bu birimden yalnızca ${previous.toLocaleString("tr-TR")} asker bulunuyor.`);
      const remaining = previous - input.quantity;
      await client.query(
        "UPDATE mercenary_contract_units SET current_quantity=$1 WHERE contract_id=$2 AND unit_type=$3",
        [remaining, contract.id, input.unitType]
      );
      const hasPersonnel = await client.query(
        `SELECT 1 FROM mercenary_contract_units WHERE contract_id=$1 AND current_quantity>0
         UNION ALL
         SELECT 1 FROM mercenary_contract_ships WHERE contract_id=$1 AND current_quantity>0
         LIMIT 1`,
        [contract.id]
      );
      const destroyed = !hasPersonnel.rowCount;
      if (destroyed) await client.query("UPDATE mercenary_contracts SET status='DESTROYED',updated_at=NOW() WHERE id=$1", [contract.id]);
      await audit(client, input.guildId, input.actorId, "MERCENARY_LOSS_ADD", "mercenary_contract", contract.id, {
        unitType: input.unitType, loss: input.quantity, previous, remaining, destroyed
      });
      return { previous, remaining, destroyed };
    });
  },

  async transferSettlement(input: { guildId: string; actorId: string; sourceCountryId: string; targetCountryId: string; settlementId: string; conqueredTurn?: number | null }): Promise<{ settlementName: string; sourceName: string; targetName: string; conqueredTurn: number; cancelledRecruitmentOrders: number; endedTrades: number; enslavedGarrison: number; removedArmyPersonnel: number; removedShips: number; removedSiegeAssets: number; destroyedMercenaryContracts: number; newGarrisonPersonnel: number; newGarrisonCost: number; newGarrisonCompletionTurn: number | null }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      if (input.sourceCountryId === input.targetCountryId) throw new GameError("Kaynak ve hedef ülke aynı olamaz.");
      for (const countryId of [input.sourceCountryId, input.targetCountryId].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${countryId}`]);
      for (const countryId of [input.sourceCountryId, input.targetCountryId].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`trade:${countryId}`]);
      const countries = (await client.query<CountryRow>("SELECT * FROM countries WHERE guild_id=$1 AND status='ACTIVE' AND id=ANY($2::uuid[]) FOR UPDATE", [input.guildId, [input.sourceCountryId, input.targetCountryId]])).rows;
      const source = countries.find((country) => country.id === input.sourceCountryId);
      const target = countries.find((country) => country.id === input.targetCountryId);
      if (!source || !target) throw new GameError("Kaynak veya hedef ülke bulunamadı.");
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, source.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke kaynak ülkeye bağlı değil veya bulunamadı.");
      const duplicate = await client.query("SELECT 1 FROM settlements WHERE country_id=$1 AND lower(name)=lower($2) AND id<>$3", [target.id, settlement.name, settlement.id]);
      if (duplicate.rowCount) throw new GameError("Hedef ülkede aynı ada sahip bir yerleşke bulunuyor.");
      const activeOrders = await client.query<{ id: string }>("SELECT id FROM recruitment_orders WHERE settlement_id=$1 AND status='TRAINING' FOR UPDATE", [settlement.id]);
      if (activeOrders.rows.length) {
        const orderIds = activeOrders.rows.map((row) => row.id);
        await client.query("DELETE FROM recruitment_waves WHERE order_id=ANY($1::uuid[]) AND processed_at IS NULL", [orderIds]);
        await client.query("UPDATE recruitment_orders SET status='CANCELLED',remaining_quantity=0 WHERE id=ANY($1::uuid[])", [orderIds]);
      }
      await client.query("DELETE FROM recruitment_usage WHERE settlement_id=$1", [settlement.id]);
      const trades = await client.query("UPDATE trade_agreements SET status='ENDED',ended_at=NOW() WHERE status IN ('PENDING','ACTIVE') AND (proposer_settlement_id=$1 OR receiver_settlement_id=$1) RETURNING id", [settlement.id]);
      const guild = await getGuild(client, input.guildId);
      const cancelledNaval = await client.query("UPDATE naval_orders SET status='CANCELLED' WHERE settlement_id=$1 AND status='BUILDING' RETURNING id", [settlement.id]);
      const conqueredTurn = input.conqueredTurn ?? guild.current_turn;
      if (!Number.isInteger(conqueredTurn) || conqueredTurn < 0 || conqueredTurn > guild.current_turn) {
        throw new GameError(`Fetih turu 0 ile mevcut Tur ${guild.current_turn} arasında bir tam sayı olmalıdır.`);
      }
      const cancelledSiege = await client.query("UPDATE siege_orders SET status='CANCELLED' WHERE settlement_id=$1 AND status='BUILDING' RETURNING id", [settlement.id]);
      await client.query("DELETE FROM settlement_policies WHERE settlement_id=$1", [settlement.id]);
      await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE assigned_settlement_id=$1", [settlement.id]);
      await client.query("UPDATE academy_training_sessions SET status='CANCELLED' WHERE settlement_id=$1 AND status IN ('PENDING_ROLL','AWAITING_NAME')", [settlement.id]);
      const cancelledGarrisonTrainees = await cancelActiveGarrisonReplenishment(client, settlement.id);
      const remainingGarrisonRows = (await client.query<{ quantity: number }>(
        "SELECT quantity FROM unit_stacks WHERE settlement_id=$1 AND force_type='GARRISON' FOR UPDATE",
        [settlement.id]
      )).rows;
      const remainingGarrison = remainingGarrisonRows.reduce((sum, row) => sum + Number(row.quantity), 0);
      const enslavedExistingGarrison = Math.min(Number(settlement.population), remainingGarrison);
      const enslavedGarrison = enslavedExistingGarrison + cancelledGarrisonTrainees;
      const removedStacks = (await client.query<{ quantity: number; force_type: "ARMY" | "GARRISON" }>(
        "DELETE FROM unit_stacks WHERE settlement_id=$1 RETURNING quantity,force_type", [settlement.id]
      )).rows;
      const removedArmyPersonnel = removedStacks
        .filter((row) => row.force_type === "ARMY")
        .reduce((sum, row) => sum + Number(row.quantity), 0);
      const removedShips = (await client.query<{ quantity: number }>(
        "DELETE FROM naval_units WHERE settlement_id=$1 RETURNING quantity", [settlement.id]
      )).rows.reduce((sum, row) => sum + Number(row.quantity), 0);
      const removedSiegeAssets = (await client.query<{ quantity: number }>(
        "DELETE FROM siege_assets WHERE settlement_id=$1 RETURNING quantity", [settlement.id]
      )).rows.reduce((sum, row) => sum + Number(row.quantity), 0);
      const mercenaryContracts = (await client.query<{ id: string }>(
        "SELECT id FROM mercenary_contracts WHERE settlement_id=$1 AND status IN ('PENDING','ACTIVE','UNPAID') FOR UPDATE", [settlement.id]
      )).rows;
      if (mercenaryContracts.length) {
        const contractIds = mercenaryContracts.map((contract) => contract.id);
        await client.query("UPDATE mercenary_contract_units SET current_quantity=0 WHERE contract_id=ANY($1::uuid[])", [contractIds]);
        await client.query("UPDATE mercenary_contract_ships SET current_quantity=0 WHERE contract_id=ANY($1::uuid[])", [contractIds]);
        await client.query("UPDATE mercenary_contract_assets SET current_quantity=0 WHERE contract_id=ANY($1::uuid[])", [contractIds]);
        await client.query("UPDATE mercenary_contracts SET status='DESTROYED',updated_at=NOW() WHERE id=ANY($1::uuid[])", [contractIds]);
      }
      await client.query(
        "UPDATE settlements SET country_id=$1,is_conquered=TRUE,conquered_turn=$2,garrison_level=0,population=GREATEST(0,population-$3),slave_population=slave_population+$4 WHERE id=$5",
        [target.id, conqueredTurn, enslavedExistingGarrison, enslavedGarrison, settlement.id]
      );
      const newGarrison = await scheduleMandatoryGarrisonReplenishment(client, { settlementId: settlement.id, currentTurn: guild.current_turn, reason: "CONQUEST" });
      await syncCountryTreasury(client, source.id);
      await syncCountryTreasury(client, target.id);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_TRANSFER", "settlement", settlement.id, {
        fromCountryId: source.id, toCountryId: target.id, cancelledRecruitmentOrders: activeOrders.rows.length, cancelledNavalOrders: cancelledNaval.rowCount ?? 0, cancelledSiegeOrders: cancelledSiege.rowCount ?? 0, endedTrades: trades.rowCount ?? 0, conqueredTurn,
        enslavedGarrison, removedArmyPersonnel, removedShips, removedSiegeAssets, destroyedMercenaryContracts: mercenaryContracts.length,
        newGarrisonPersonnel: newGarrison?.personnel ?? 0, newGarrisonCost: newGarrison?.cost ?? 0, newGarrisonCompletionTurn: newGarrison?.completionTurn ?? null
      });
      return {
        settlementName: settlement.name, sourceName: source.name, targetName: target.name,
        cancelledRecruitmentOrders: activeOrders.rows.length, endedTrades: trades.rowCount ?? 0, enslavedGarrison,
        conqueredTurn,
        removedArmyPersonnel, removedShips, removedSiegeAssets, destroyedMercenaryContracts: mercenaryContracts.length,
        newGarrisonPersonnel: newGarrison?.personnel ?? 0, newGarrisonCost: newGarrison?.cost ?? 0,
        newGarrisonCompletionTurn: newGarrison?.completionTurn ?? null
      };
    });
  },
  async document(countryId: string): Promise<CountryDocument> {
    const client = await pool.connect();
    try {
      const country = await getCountry(client, countryId);
      const guild = await getGuild(client, country.guild_id);
      const playerIds = (await client.query<{ discord_user_id: string }>("SELECT discord_user_id FROM country_members WHERE country_id=$1 ORDER BY discord_user_id", [countryId])).rows.map((row) => row.discord_user_id);
      const specialUnitUnlocks = (await client.query<{ unit_type: SpecialUnitType }>("SELECT unit_type FROM country_special_unit_unlocks WHERE country_id=$1 ORDER BY unit_type", [countryId])).rows.map((row) => row.unit_type);
      const settlements = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE country_id = $1 ORDER BY name", [countryId])).rows;
      const displayedCountry = { ...country, treasury: settlements.length ? settlements.reduce((sum, settlement) => sum + Number(settlement.local_treasury), 0) : country.treasury };
      const settlementIds = settlements.map((settlement) => settlement.id);
      const buildings = settlementIds.length ? (await client.query<BuildingRow>("SELECT * FROM buildings WHERE settlement_id = ANY($1::uuid[]) ORDER BY building_type", [settlementIds])).rows : [];
      const policies = settlementIds.length ? (await client.query<SettlementPolicyRow>("SELECT * FROM settlement_policies WHERE settlement_id=ANY($1::uuid[]) ORDER BY slot", [settlementIds])).rows : [];
      const incomePenalties = settlementIds.length ? (await client.query<SettlementIncomePenaltyRow>(
        "SELECT settlement_id,penalty_percent,remaining_acquisition_turns,reason,created_turn FROM settlement_income_penalties WHERE settlement_id=ANY($1::uuid[])",
        [settlementIds]
      )).rows : [];
      const characters = (await client.query<CountryCharacter>(
        `SELECT cc.*,assigned.name AS assigned_settlement_name,trained.name AS trained_settlement_name
           FROM country_characters cc
           LEFT JOIN settlements assigned ON assigned.id=cc.assigned_settlement_id
           LEFT JOIN settlements trained ON trained.id=cc.trained_settlement_id
          WHERE cc.country_id=$1 ORDER BY cc.role,cc.name`, [countryId]
      )).rows;
      const units = settlementIds.length ? (await client.query<{ settlement_id: string; unit_type: keyof typeof UNITS; quantity: number; status: UnitStatus; force_type: ForceType }>("SELECT * FROM unit_stacks WHERE settlement_id = ANY($1::uuid[]) ORDER BY force_type,unit_type", [settlementIds])).rows : [];
      const ships = settlementIds.length ? (await client.query<{ settlement_id: string; ship_type: keyof typeof SHIPS; quantity: number; status: ShipStatus }>("SELECT * FROM naval_units WHERE settlement_id = ANY($1::uuid[]) ORDER BY ship_type", [settlementIds])).rows : [];
      const assets = (await client.query<{ settlement_id: string | null; asset_type: string; quantity: number; location_note: string | null }>("SELECT * FROM siege_assets WHERE country_id = $1 ORDER BY asset_type", [countryId])).rows;
      const waves = (await client.query<{ settlement_id: string; unit_type: keyof typeof UNITS; due_turn: number; quantity: number }>(
        `SELECT ro.settlement_id,ro.unit_type,rw.due_turn,rw.quantity FROM recruitment_waves rw
          JOIN recruitment_orders ro ON ro.id=rw.order_id
         WHERE ro.country_id=$1 AND rw.processed_at IS NULL ORDER BY rw.due_turn`, [countryId]
      )).rows;
      const pendingShips = (await client.query<{ settlement_id: string; ship_type: keyof typeof SHIPS; quantity: number; completion_turn: number }>(
        "SELECT settlement_id,ship_type,quantity,completion_turn FROM naval_orders WHERE country_id=$1 AND status='BUILDING' ORDER BY completion_turn", [countryId]
      )).rows;
      const pendingSiege = (await client.query<{ settlement_id: string; asset_type: keyof typeof SIEGE_ASSETS; quantity: number; completion_turn: number }>(
        "SELECT settlement_id,asset_type,quantity,completion_turn FROM siege_orders WHERE country_id=$1 AND status='BUILDING' ORDER BY completion_turn", [countryId]
      )).rows;
      const pendingGarrisons = (await client.query<{ settlement_id: string; personnel_reserved: number; paid_amount: number; ordered_turn: number; completion_turn: number; reason: GarrisonReplenishmentReason }>(
        `SELECT settlement_id,personnel_reserved,paid_amount,ordered_turn,completion_turn,reason
           FROM garrison_replenishment_orders WHERE country_id=$1 AND status='BUILDING'
          ORDER BY completion_turn`, [countryId]
      )).rows;
      const recruitmentUsage = (await client.query<{ settlement_id: string; quantity: number }>(
        "SELECT settlement_id,quantity FROM recruitment_usage WHERE acquisition_turn=$1 AND settlement_id=ANY($2::uuid[])", [guild.current_turn, settlementIds]
      )).rows;
      const tradeAgreements = (await client.query<CountryDocument["tradeAgreements"][number]>(
        `SELECT ta.id,ta.route,ta.status,
          CASE WHEN ta.proposer_country_id=$1 THEN receiver.name ELSE proposer.name END AS partner_name,
          ps.name AS proposer_settlement_name,rs.name AS receiver_settlement_name,
          ps.resource_type AS proposer_resource,rs.resource_type AS receiver_resource
          FROM trade_agreements ta
          JOIN countries proposer ON proposer.id=ta.proposer_country_id
          JOIN countries receiver ON receiver.id=ta.receiver_country_id
          JOIN settlements ps ON ps.id=ta.proposer_settlement_id
          JOIN settlements rs ON rs.id=ta.receiver_settlement_id
         WHERE (ta.proposer_country_id=$1 OR ta.receiver_country_id=$1) AND ta.status IN ('PENDING','ACTIVE')
         ORDER BY ta.status,partner_name`, [countryId]
      )).rows;
      const allies = (await client.query<CountryDocument["allies"][number]>(
        `SELECT partner.id,partner.name FROM country_alliances alliance
          JOIN countries partner ON partner.id=CASE WHEN alliance.proposer_country_id=$1
            THEN alliance.receiver_country_id ELSE alliance.proposer_country_id END
         WHERE alliance.status='ACTIVE'
           AND (alliance.proposer_country_id=$1 OR alliance.receiver_country_id=$1)
         ORDER BY partner.name`, [countryId]
      )).rows;
      const pacts = (await client.query<CountryDocument["pacts"][number]>(
        `SELECT pact.id,pact.name,pact.purpose,founder.name AS founder_name
           FROM pact_memberships membership
           JOIN diplomatic_pacts pact ON pact.id=membership.pact_id
           JOIN countries founder ON founder.id=pact.founder_country_id
          WHERE membership.country_id=$1 ORDER BY pact.name`, [countryId]
      )).rows;
      const mercenaries = await loadMercenaryContracts(client, countryId);
      const tradeBonuses = await activeTradeBonuses(client, countryId);
      const resourceAccess = await settlementResourceAccess(client, countryId);
      const manpower = await countryManpower(client, countryId);

      let totalGrossBreakdown: IncomeBreakdown = { building: 0, tax: 0, landTrade: 0, seaTrade: 0 };
      let totalPayableBreakdown: IncomeBreakdown = { building: 0, tax: 0, landTrade: 0, seaTrade: 0 };
      let totalUpkeep = 0;
      const enriched = settlements.map((settlement) => {
        const settlementBuildings = buildings.filter((building) => building.settlement_id === settlement.id);
        const activeBuildings = settlementBuildings
          .filter((building) => building.status === "ACTIVE" && building.level > 0)
          .map((building) => ({ buildingType: building.building_type, level: building.level }));
        const settlementPolicies = policies.filter((policy) => policy.settlement_id === settlement.id);
        const activePolicies = activePolicyKeys(settlementPolicies);
        const assignedMerchant = characters.find((character) => character.assigned_settlement_id === settlement.id && character.assignment === "AGORA" && character.role === "MERCHANT");
        const agreementBonus = tradeBonuses.get(settlement.id) ?? { land: 0, sea: 0 };
            const effectiveResources = resourceAccess.get(settlement.id) ?? [settlement.resource_type];
        const economy = calculateCategorizedIncome({
          settlementIncome: 0,
          taxIncome: populationTaxIncome(settlement.population),
          landTradeIncome: settlement.base_land_trade_income,
          seaTradeIncome: 0,
          agreementLandIncome: agreementBonus.land,
          agreementSeaIncome: agreementBonus.sea,
          manualFlatIncome: settlement.manual_flat_income,
          manualIncomePercent: settlement.manual_income_percent,
          buildings: activeBuildings,
          ruinStage: settlement.ruin_stage,
          resources: effectiveResources,
          slavePopulation: settlement.slave_population,
          activePolicies,
          assignedMerchant: Boolean(assignedMerchant),
          merchantSkillBonus: assignedMerchant?.skill_bonus ?? 0,
          formableKey: country.active_formable_key
        });
        const incomePenalty = incomePenalties.find((penalty) => penalty.settlement_id === settlement.id) ?? null;
        const mobilizedIncome = scaleIncome(economy.payable, MOBILIZATION_RULES[country.mobilization].incomeMultiplier);
        const incomeBreakdown = applyIncomePenalty(mobilizedIncome, Number(incomePenalty?.penalty_percent ?? 0));
        const populationGain = applyFormablePopulationModifiers(calculatePopulationGain({
          basePopulationGrowth: settlement.base_population_growth,
          buildings: activeBuildings,
          ruinStage: settlement.ruin_stage,
          mobilization: country.mobilization,
          resources: effectiveResources
        }), settlement.ruin_stage, country.active_formable_key);
        const settlementUnits = units.filter((unit) => unit.settlement_id === settlement.id);
        const settlementShips = ships.filter((ship) => ship.settlement_id === settlement.id);
        const settlementMercenaries = mercenaries.filter((contract) => contract.settlement_id === settlement.id);
        const activeSettlementMercenaries = settlementMercenaries.filter((contract) => contract.status === "ACTIVE" || contract.status === "UNPAID");
        const unitUpkeep = settlementUnits.reduce((sum, unit) => sum + calculateUnitUpkeep(unit.unit_type, unit.quantity, unit.status, country.mobilization, effectiveResources, country.manpower_penalty_active), 0);
        const shipUpkeep = settlementShips.reduce((sum, ship) => sum + calculateShipUpkeep(ship.ship_type, ship.quantity, ship.status, country.mobilization, country.manpower_penalty_active), 0);
        const mercenaryUpkeep = activeSettlementMercenaries.reduce((sum, contract) => sum + contract.turn_upkeep, 0);
        const totalSettlementUpkeep = economy.buildingUpkeep + unitUpkeep + shipUpkeep + mercenaryUpkeep;
        const settlementMilitaryUsed = settlementUnits.reduce((sum, unit) => sum + unit.quantity, 0)
          + settlementShips.reduce((sum, ship) => sum + SHIPS[ship.ship_type].manpower * ship.quantity, 0)
          + waves.filter((wave) => wave.settlement_id === settlement.id).reduce((sum, wave) => sum + wave.quantity, 0)
          + pendingShips.filter((ship) => ship.settlement_id === settlement.id).reduce((sum, ship) => sum + SHIPS[ship.ship_type].manpower * ship.quantity, 0)
          + pendingGarrisons.filter((order) => order.settlement_id === settlement.id).reduce((sum, order) => sum + Number(order.personnel_reserved), 0);
        const trainingCapacity = settlement.is_conquered ? 0 : settlementTrainingCapacity(settlement.population, country.mobilization);
        const trainingUsed = recruitmentUsage.find((usage) => usage.settlement_id === settlement.id)?.quantity ?? 0;
        totalGrossBreakdown = addIncomeBreakdowns(totalGrossBreakdown, economy.gross);
        totalPayableBreakdown = addIncomeBreakdowns(totalPayableBreakdown, incomeBreakdown);
        totalUpkeep += totalSettlementUpkeep;
        return {
          ...settlement,
          grossIncome: incomeTotal(economy.gross),
          payableIncome: incomeTotal(incomeBreakdown),
          incomeBreakdown,
          buildingIncomeBonus: economy.buildingBonuses,
          buildingUpkeep: economy.buildingUpkeep,
          unitUpkeep,
          shipUpkeep,
          mercenaryUpkeep,
          totalSettlementUpkeep,
          populationGain,
          militaryUsed: settlementMilitaryUsed,
          militaryLimit: settlement.is_conquered ? 0 : settlementMobilizationLimit(settlement.population, country.mobilization),
          trainingCapacity,
          trainingUsed,
          trainingRemaining: Math.max(0, trainingCapacity - trainingUsed),
          slotLimit: buildingSlotLimit(settlement.population),
          constructionLimit: activePolicies.includes("MASTER_ARCHITECTURE") ? 3 : 2,
          incomePenalty,
          unrestRisk: settlementUnrestChance(activeBuildings, effectiveResources, activePolicies, country.active_formable_key),
          starvationBonus: settlementStarvationBonus(activeBuildings, activePolicies, country.active_formable_key),
          temporaryMilitia: activePolicies.includes("WAR_PREPARATION") ? (formableModifiers(country.active_formable_key).warPreparationMilitia ?? Math.floor(500 * (formableModifiers(country.active_formable_key).policyMilitiaMultiplier ?? 1))) : 0,
          assignedMerchant: Boolean(assignedMerchant),
          merchantSkillBonus: assignedMerchant?.skill_bonus ?? 0,
          policies: settlementPolicies,
          effectiveResources,
          buildings: settlementBuildings,
          units: settlementUnits,
          ships: settlementShips,
          siegeAssets: assets.filter((asset) => asset.settlement_id === settlement.id),
          mercenaries: settlementMercenaries,
          pendingRecruitment: waves.filter((wave) => wave.settlement_id === settlement.id),
          pendingShips: pendingShips.filter((ship) => ship.settlement_id === settlement.id),
          pendingSiege: pendingSiege.filter((order) => order.settlement_id === settlement.id),
          pendingGarrison: pendingGarrisons.filter((order) => order.settlement_id === settlement.id)
        };
      });
      const totalPayableIncome = incomeTotal(totalPayableBreakdown);
      return {
        guild,
        country: displayedCountry,
        playerIds,
        specialUnitUnlocks,
        characters,
        allies,
        pacts,
        mercenaries,
        freePopulation: manpower.population,
        militaryUsed: manpower.used,
        militaryLimit: militaryLimit(manpower.population, country.mobilization),
        manpowerPenaltyActive: country.manpower_penalty_active,
        totalGrossIncome: incomeTotal(totalGrossBreakdown),
        totalPayableIncome,
        totalIncomeBreakdown: totalPayableBreakdown,
        totalUpkeep,
        netIncome: totalPayableIncome - totalUpkeep,
        tradeAgreements,
        settlements: enriched
      };
    } finally {
      client.release();
    }
  },
  async listPendingPurchases(guildId: string, query = ""): Promise<PendingPurchase[]> {
    const [unitOrders, shipOrders, siegeOrders, buildingOrders] = await Promise.all([
      pool.query<{
        id: string; country_name: string; settlement_name: string; unit_type: keyof typeof UNITS;
        total_quantity: number; remaining_quantity: number; paid_amount: number; ordered_turn: number;
      }>(`SELECT ro.id,c.name AS country_name,s.name AS settlement_name,ro.unit_type,
                 ro.total_quantity,ro.remaining_quantity,ro.paid_amount,ro.ordered_turn
            FROM recruitment_orders ro
            JOIN countries c ON c.id=ro.country_id
            JOIN settlements s ON s.id=ro.settlement_id
           WHERE c.guild_id=$1 AND ro.status='TRAINING'
           ORDER BY c.name,s.name,ro.created_at`, [guildId]),
      pool.query<{
        id: string; country_name: string; settlement_name: string; ship_type: keyof typeof SHIPS;
        quantity: number; paid_amount: number; completion_turn: number;
      }>(`SELECT no.id,c.name AS country_name,s.name AS settlement_name,no.ship_type,
                 no.quantity,no.paid_amount,no.completion_turn
            FROM naval_orders no
            JOIN countries c ON c.id=no.country_id
            JOIN settlements s ON s.id=no.settlement_id
           WHERE c.guild_id=$1 AND no.status='BUILDING'
           ORDER BY c.name,s.name,no.created_at`, [guildId]),
      pool.query<{
        id: string; country_name: string; settlement_name: string; asset_type: keyof typeof SIEGE_ASSETS;
        quantity: number; paid_amount: number; completion_turn: number;
      }>(`SELECT so.id,c.name AS country_name,s.name AS settlement_name,so.asset_type,
                 so.quantity,so.paid_amount,so.completion_turn
            FROM siege_orders so
            JOIN countries c ON c.id=so.country_id
            JOIN settlements s ON s.id=so.settlement_id
           WHERE c.guild_id=$1 AND so.status='BUILDING'
           ORDER BY c.name,s.name,so.created_at`, [guildId]),
      pool.query<{
        settlement_id: string; country_id: string; country_name: string; settlement_name: string;
        building_type: string; level: number; target_level: number; started_turn: number; completion_turn: number;
      }>(`SELECT b.settlement_id,c.id AS country_id,c.name AS country_name,s.name AS settlement_name,
                 b.building_type,b.level,b.target_level,b.started_turn,b.completion_turn
            FROM buildings b
            JOIN settlements s ON s.id=b.settlement_id
            JOIN countries c ON c.id=s.country_id
           WHERE c.guild_id=$1 AND b.status='BUILDING'
           ORDER BY c.name,s.name,b.started_turn,b.building_type`, [guildId])
    ]);

    const purchases: PendingPurchase[] = [];
    for (const row of unitOrders.rows) {
      const total = Number(row.total_quantity);
      const remaining = Number(row.remaining_quantity);
      const paid = Number(row.paid_amount);
      const isObserver = row.unit_type === "observer";
      purchases.push({
        key: `UNIT|${row.id}`, kind: "UNIT", countryName: row.country_name,
        settlementName: row.settlement_name, itemName: UNITS[row.unit_type]?.name ?? row.unit_type,
        quantity: isObserver ? 1 : remaining, refundableAmount: Math.floor(paid * remaining / Math.max(1, total)),
        progressNote: remaining === total ? "Teslimat başlamadı" : `${remaining.toLocaleString("tr-TR")}/${total.toLocaleString("tr-TR")} personel bekliyor`
      });
    }
    for (const row of shipOrders.rows) {
      purchases.push({
        key: `SHIP|${row.id}`, kind: "SHIP", countryName: row.country_name,
        settlementName: row.settlement_name, itemName: SHIPS[row.ship_type]?.name ?? row.ship_type,
        quantity: Number(row.quantity), refundableAmount: Number(row.paid_amount),
        progressNote: `Tur ${row.completion_turn} tamamlanacak`
      });
    }
    for (const row of siegeOrders.rows) {
      purchases.push({
        key: `SIEGE|${row.id}`, kind: "SIEGE", countryName: row.country_name,
        settlementName: row.settlement_name, itemName: SIEGE_ASSETS[row.asset_type]?.name ?? row.asset_type,
        quantity: Number(row.quantity), refundableAmount: Number(row.paid_amount),
        progressNote: `Tur ${row.completion_turn} tamamlanacak`
      });
    }
    for (const row of buildingOrders.rows) {
      const definition = BUILDINGS[row.building_type];
      const description = `${row.settlement_name}: ${definition?.name ?? row.building_type} Sv${row.target_level}`;
      const payment = await pool.query<{ amount: number }>(
        `SELECT amount FROM transactions
          WHERE country_id=$1 AND turn=$2 AND kind='BUILDING_PURCHASE' AND amount<0 AND description=$3
          ORDER BY created_at DESC LIMIT 1`,
        [row.country_id, row.started_turn, description]
      );
      purchases.push({
        key: `BUILDING|${row.settlement_id}|${row.building_type}`, kind: "BUILDING",
        countryName: row.country_name, settlementName: row.settlement_name,
        itemName: `${definition?.name ?? row.building_type} Sv${row.target_level}`,
        quantity: 1, refundableAmount: Math.max(0, -Number(payment.rows[0]?.amount ?? 0)),
        progressNote: `Tur ${row.completion_turn} tamamlanacak`
      });
    }

    const needle = query.toLocaleLowerCase("tr-TR").trim();
    return purchases
      .filter((purchase) => !needle || [
        purchase.countryName, purchase.settlementName, purchase.itemName, purchase.kind
      ].some((value) => value.toLocaleLowerCase("tr-TR").includes(needle)))
      .sort((left, right) => `${left.countryName}|${left.settlementName}|${left.itemName}`
        .localeCompare(`${right.countryName}|${right.settlementName}|${right.itemName}`, "tr-TR"))
      .slice(0, 25);
  },

  async cancelPendingPurchase(input: {
    guildId: string; actorId: string; purchaseKey: string;
  }): Promise<PurchaseCancellationResult> {
    const [kind, id, extra] = input.purchaseKey.split("|");
    if (!["UNIT", "SHIP", "SIEGE", "BUILDING"].includes(kind ?? "")) {
      throw new GameError("Geçersiz alım kaydı.");
    }
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!id || !uuidPattern.test(id)) throw new GameError("Geçersiz alım kimliği.");

    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      let countryId = "";
      let settlementId = "";
      let entityId = id;
      let refund = 0;
      let purchase: PendingPurchase;

      if (kind === "UNIT") {
        const result = await client.query<{
          id: string; country_id: string; settlement_id: string; country_name: string; settlement_name: string;
          unit_type: keyof typeof UNITS; total_quantity: number; remaining_quantity: number; paid_amount: number; ordered_turn: number;
        }>(`SELECT ro.id,ro.country_id,ro.settlement_id,c.name AS country_name,s.name AS settlement_name,
                   ro.unit_type,ro.total_quantity,ro.remaining_quantity,ro.paid_amount,ro.ordered_turn
              FROM recruitment_orders ro
              JOIN countries c ON c.id=ro.country_id
              JOIN settlements s ON s.id=ro.settlement_id
             WHERE ro.id=$1 AND c.guild_id=$2 AND ro.status='TRAINING'
             FOR UPDATE OF ro,c,s`, [id, input.guildId]);
        const row = result.rows[0];
        if (!row) throw new GameError("Bu asker alımı bulunamadı veya artık tamamlanmış/iptal edilmiş.");
        const total = Number(row.total_quantity);
        const remaining = Number(row.remaining_quantity);
        refund = Math.floor(Number(row.paid_amount) * remaining / Math.max(1, total));
        countryId = row.country_id;
        settlementId = row.settlement_id;
        await client.query("DELETE FROM recruitment_waves WHERE order_id=$1 AND processed_at IS NULL", [row.id]);
        await client.query("UPDATE recruitment_orders SET status='CANCELLED',remaining_quantity=0 WHERE id=$1", [row.id]);
        await client.query(
          `UPDATE recruitment_usage
              SET quantity=GREATEST(0,quantity-$1)
            WHERE settlement_id=$2 AND acquisition_turn=$3`,
          [remaining, row.settlement_id, row.ordered_turn]
        );
        const isObserver = row.unit_type === "observer";
        purchase = {
          key: input.purchaseKey, kind: "UNIT", countryName: row.country_name,
          settlementName: row.settlement_name, itemName: UNITS[row.unit_type]?.name ?? row.unit_type,
          quantity: isObserver ? 1 : remaining, refundableAmount: refund,
          progressNote: remaining === total ? "Siparişin tamamı iptal edildi" : `Teslim edilmemiş ${remaining.toLocaleString("tr-TR")}/${total.toLocaleString("tr-TR")} personel iptal edildi`
        };
      } else if (kind === "SHIP") {
        const result = await client.query<{
          id: string; country_id: string; settlement_id: string; country_name: string; settlement_name: string;
          ship_type: keyof typeof SHIPS; quantity: number; paid_amount: number; completion_turn: number;
        }>(`SELECT no.id,no.country_id,no.settlement_id,c.name AS country_name,s.name AS settlement_name,
                   no.ship_type,no.quantity,no.paid_amount,no.completion_turn
              FROM naval_orders no
              JOIN countries c ON c.id=no.country_id
              JOIN settlements s ON s.id=no.settlement_id
             WHERE no.id=$1 AND c.guild_id=$2 AND no.status='BUILDING'
             FOR UPDATE OF no,c,s`, [id, input.guildId]);
        const row = result.rows[0];
        if (!row) throw new GameError("Bu gemi alımı bulunamadı veya artık tamamlanmış/iptal edilmiş.");
        countryId = row.country_id;
        settlementId = row.settlement_id;
        refund = Number(row.paid_amount);
        await client.query("UPDATE naval_orders SET status='CANCELLED' WHERE id=$1", [row.id]);
        purchase = {
          key: input.purchaseKey, kind: "SHIP", countryName: row.country_name,
          settlementName: row.settlement_name, itemName: SHIPS[row.ship_type]?.name ?? row.ship_type,
          quantity: Number(row.quantity), refundableAmount: refund, progressNote: "Gemi üretim emri iptal edildi"
        };
      } else if (kind === "SIEGE") {
        const result = await client.query<{
          id: string; country_id: string; settlement_id: string; country_name: string; settlement_name: string;
          asset_type: keyof typeof SIEGE_ASSETS; quantity: number; paid_amount: number; completion_turn: number;
        }>(`SELECT so.id,so.country_id,so.settlement_id,c.name AS country_name,s.name AS settlement_name,
                   so.asset_type,so.quantity,so.paid_amount,so.completion_turn
              FROM siege_orders so
              JOIN countries c ON c.id=so.country_id
              JOIN settlements s ON s.id=so.settlement_id
             WHERE so.id=$1 AND c.guild_id=$2 AND so.status='BUILDING'
             FOR UPDATE OF so,c,s`, [id, input.guildId]);
        const row = result.rows[0];
        if (!row) throw new GameError("Bu kuşatma aleti alımı bulunamadı veya artık tamamlanmış/iptal edilmiş.");
        countryId = row.country_id;
        settlementId = row.settlement_id;
        refund = Number(row.paid_amount);
        await client.query("UPDATE siege_orders SET status='CANCELLED' WHERE id=$1", [row.id]);
        purchase = {
          key: input.purchaseKey, kind: "SIEGE", countryName: row.country_name,
          settlementName: row.settlement_name, itemName: SIEGE_ASSETS[row.asset_type]?.name ?? row.asset_type,
          quantity: Number(row.quantity), refundableAmount: refund, progressNote: "Kuşatma aleti üretim emri iptal edildi"
        };
      } else {
        if (!extra || !BUILDINGS[extra]) throw new GameError("Geçersiz bina alımı.");
        const result = await client.query<{
          country_id: string; country_name: string; settlement_id: string; settlement_name: string;
          building_type: string; level: number; target_level: number; started_turn: number;
        }>(`SELECT c.id AS country_id,c.name AS country_name,s.id AS settlement_id,s.name AS settlement_name,
                   b.building_type,b.level,b.target_level,b.started_turn
              FROM buildings b
              JOIN settlements s ON s.id=b.settlement_id
              JOIN countries c ON c.id=s.country_id
             WHERE b.settlement_id=$1 AND b.building_type=$2 AND b.status='BUILDING' AND c.guild_id=$3
             FOR UPDATE OF b,c,s`, [id, extra, input.guildId]);
        const row = result.rows[0];
        if (!row) throw new GameError("Bu bina alımı bulunamadı veya artık tamamlanmış/iptal edilmiş.");
        const definition = BUILDINGS[row.building_type]!;
        const description = `${row.settlement_name}: ${definition.name} Sv${row.target_level}`;
        const payment = await client.query<{ amount: number }>(
          `SELECT amount FROM transactions
            WHERE country_id=$1 AND turn=$2 AND kind='BUILDING_PURCHASE' AND amount<0 AND description=$3
            ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [row.country_id, row.started_turn, description]
        );
        refund = Math.max(0, -Number(payment.rows[0]?.amount ?? 0));
        if (refund <= 0) throw new GameError("Bina alımının özgün ödeme kaydı bulunamadı; güvenli iade yapılamadı.");
        countryId = row.country_id;
        settlementId = row.settlement_id;
        entityId = row.settlement_id;
        if (Number(row.level) <= 0) {
          await client.query("DELETE FROM buildings WHERE settlement_id=$1 AND building_type=$2", [row.settlement_id, row.building_type]);
        } else {
          await client.query(
            "UPDATE buildings SET status='ACTIVE',target_level=NULL,started_turn=NULL,completion_turn=NULL WHERE settlement_id=$1 AND building_type=$2",
            [row.settlement_id, row.building_type]
          );
        }
        purchase = {
          key: input.purchaseKey, kind: "BUILDING", countryName: row.country_name,
          settlementName: row.settlement_name, itemName: `${definition.name} Sv${row.target_level}`,
          quantity: 1, refundableAmount: refund, progressNote: "Bina inşaatı/seviye yükseltmesi iptal edildi"
        };
      }

      if (refund <= 0) throw new GameError("Bu alım için iade edilebilir ödeme kalmamış.");
      await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2", [refund, settlementId]);
      const treasury = await syncCountryTreasury(client, countryId);
      await client.query(
        "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'PURCHASE_REFUND',$3,$4)",
        [countryId, guild.current_turn, refund, `${purchase.settlementName}: ${purchase.itemName} yönetici iptali ve iadesi`]
      );
      await audit(client, input.guildId, input.actorId, "ADMIN_PURCHASE_CANCEL", "purchase", entityId, {
        purchaseKey: input.purchaseKey, kind: purchase.kind, settlementId,
        itemName: purchase.itemName, quantity: purchase.quantity, refund
      });
      return { ...purchase, refundableAmount: refund, treasury };
    });
  },

  async purchaseBuilding(input: { guildId: string; actorId: string; countryId: string; settlementId: string; buildingType: string }): Promise<{ targetLevel: number; completionTurn: number; cost: number }> {
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Bina alımı yalnızca Alım Turunda yapılabilir.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      const settlementResult = await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, input.countryId]);
      const settlement = settlementResult.rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      const definition = BUILDINGS[input.buildingType];
      if (!definition) throw new GameError("Bina türü bulunamadı.");
      const activePolicies = activePolicyKeys((await client.query<SettlementPolicyRow>("SELECT * FROM settlement_policies WHERE settlement_id=$1 AND status='ACTIVE'", [settlement.id])).rows);
      const constructionLimit = activePolicies.includes("MASTER_ARCHITECTURE") ? 3 : 2;
      const activeConstruction = await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM buildings WHERE settlement_id=$1 AND status='BUILDING'", [settlement.id]);
      if ((activeConstruction.rows[0]?.count ?? 0) >= constructionLimit) throw new GameError(`Bu yerleşkede aynı anda en fazla ${constructionLimit} inşaat devam edebilir.`);
      const existing = await client.query<BuildingRow>("SELECT * FROM buildings WHERE settlement_id=$1 AND building_type=$2 FOR UPDATE", [settlement.id, input.buildingType]);
      if (existing.rows[0]?.status === "BUILDING") throw new GameError("Bu binanın inşaatı veya seviye yükseltmesi zaten devam ediyor.");
      const currentLevel = existing.rows[0]?.level ?? 0;
      const targetLevel = currentLevel + 1;
      if (targetLevel > definition.maxLevel) throw new GameError("Bu bina azami seviyede.");
      if (input.buildingType === "port" && !settlement.is_coastal) throw new GameError("Liman yalnızca kıyı yerleşkelerinde inşa edilebilir.");
      if (input.buildingType === "shipyard") {
        const port = await client.query("SELECT 1 FROM buildings WHERE settlement_id=$1 AND building_type='port' AND status='ACTIVE' AND level>=1", [settlement.id]);
        if (!port.rowCount) throw new GameError("Tersane için önce Liman gereklidir.");
      }
      if (currentLevel === 0) {
        const slots = await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM buildings WHERE settlement_id=$1 AND (level>0 OR status='BUILDING')", [settlement.id]);
        if ((slots.rows[0]?.count ?? 0) >= buildingSlotLimit(settlement.population)) throw new GameError("Yerleşkenin boş bina slotu yok.");
      }
      const effectiveResources = (await settlementResourceAccess(client, country.id)).get(settlement.id) ?? [settlement.resource_type];
      const terms = buildingPurchaseTerms(input.buildingType, targetLevel, effectiveResources, activePolicies, country.active_formable_key);
      const cost = terms.cost;
      if (settlement.local_treasury < cost) throw new GameError("Yerel hazinede yeterli altın yok.");
      const completionTurn = guild.current_turn + terms.duration;
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [cost, settlement.id]);
      await syncCountryTreasury(client, country.id);
      await client.query(
        `INSERT INTO buildings(settlement_id,building_type,level,target_level,status,started_turn,completion_turn)
         VALUES ($1,$2,0,$3,'BUILDING',$4,$5)
         ON CONFLICT(settlement_id,building_type) DO UPDATE SET target_level=$3,status='BUILDING',started_turn=$4,completion_turn=$5`,
        [settlement.id, input.buildingType, targetLevel, guild.current_turn, completionTurn]
      );
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'BUILDING_PURCHASE',$3,$4)", [country.id, guild.current_turn, -cost, `${settlement.name}: ${definition.name} Sv${targetLevel}`]);
      await audit(client, input.guildId, input.actorId, "BUILDING_PURCHASE", "settlement", settlement.id, { buildingType: input.buildingType, targetLevel, cost, completionTurn });
      return { targetLevel, completionTurn, cost };
    });
  },

  async setMobilization(input: { guildId: string; actorId: string; countryId: string; mobilization: Mobilization }): Promise<void> {
    await withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      if (guild.turn_phase !== "OPEN") throw new GameError("Seferberlik yalnızca hareketler açıkken ilan edilebilir veya değiştirilebilir.");
      const country = await getCountry(client, input.countryId);
      const ranks: Record<Mobilization, number> = { PEACE: 0, PARTIAL: 1, GENERAL: 2 };
      if (ranks[input.mobilization] < ranks[country.mobilization]) {
        if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Seferberlik seviyesi yalnızca Alım Turunda düşürülebilir.");
        if (country.mobilization === "GENERAL" && country.mobilization_started_turn !== null && guild.current_turn - country.mobilization_started_turn < guild.acquisition_interval) {
          throw new GameError("Genel Seferberlik en az bir tam Alım Dönemi sürmelidir.");
        }
        const manpower = await countryManpower(client, country.id);
        if (manpower.used > militaryLimit(manpower.population, input.mobilization)) throw new GameError("Mevcut personel yeni seferberlik sınırının üzerinde.");
      }
      await client.query("UPDATE countries SET mobilization=$1,mobilization_started_turn=$2 WHERE id=$3", [input.mobilization, guild.current_turn, country.id]);
      await audit(client, input.guildId, input.actorId, "MOBILIZATION_SET", "country", country.id, { from: country.mobilization, to: input.mobilization });
    });
  },

  async purchaseUnits(input: { guildId: string; actorId: string; countryId: string; settlementId: string; unitType: keyof typeof UNITS; quantity: number }): Promise<{ cost: number; waves: Array<{ dueTurn: number; quantity: number }> }> {
    if (input.unitType === "observer") throw new GameError("Gözcü Birliği için ayrı Gözcü Alımı kullanılmalıdır.");
    if (input.unitType === "militia") throw new GameError("Milis marketten satın alınamaz; yalnızca şehir politikalarıyla oluşturulabilir.");
    if (input.quantity < 100 || input.quantity % 100 !== 0) throw new GameError("Asker alımı en az 100 kişi ve 100'ün katları hâlinde yapılmalıdır.");
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Asker alımı yalnızca Alım Turunda yapılabilir.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      if (settlement.is_conquered) throw new GameError("Fethedilmiş yerleşke asimile edilmeden asker yetiştiremez.");
      if (await settlementIsBesieged(client, settlement.id)) throw new GameError("Kuşatma altındaki yerleşke yeni asker emri veremez.");
      if (await countryHasMaintenanceDebt(client, country.id)) throw new GameError("Ödenmemiş bakım açığı giderilmeden yeni asker emri verilemez.");
      const unit = UNITS[input.unitType];
      if (!unit) throw new GameError("Birim türü bulunamadı.");
      if (isSpecialUnitType(input.unitType)) {
        const unlocked = await client.query(
          "SELECT 1 FROM country_special_unit_unlocks WHERE country_id=$1 AND unit_type=$2",
          [country.id, input.unitType]
        );
        if (!unlocked.rowCount) throw new GameError(`${unit.name}, bu ülke için açılmış bir özel birlik değildir.`);

      }

      const localUsed = await settlementManpower(client, settlement.id);
      const localLimit = settlementMobilizationLimit(settlement.population, country.mobilization);
      const remainingCapacity = Math.max(0, localLimit - localUsed);
      if (input.quantity > remainingCapacity) throw new GameError(`Yerleşkenin Ordu Limitinde yalnızca ${remainingCapacity.toLocaleString("tr-TR")} kişilik yer bulunuyor.`);
      const trainingCapacity = settlementTrainingCapacity(settlement.population, country.mobilization);
      const usage = (await client.query<{ quantity: number }>("SELECT quantity FROM recruitment_usage WHERE settlement_id=$1 AND acquisition_turn=$2 FOR UPDATE", [settlement.id, guild.current_turn])).rows[0]?.quantity ?? 0;
      const trainingRemaining = Math.max(0, trainingCapacity - usage);
      if (input.quantity > trainingRemaining) throw new GameError(`Bu Alım Turunda Eğitim Kapasitesinde yalnızca ${trainingRemaining.toLocaleString("tr-TR")} kişilik yer bulunuyor.`);

      const manpower = await countryManpower(client, country.id);
      const limit = militaryLimit(manpower.population, country.mobilization);
      if (manpower.used > limit) throw new GameError("Devlet askerî personel sınırının üzerindeyken yeni asker alamaz.");
      if (manpower.used + input.quantity > limit) throw new GameError(`Askerî personel sınırında yalnızca ${Math.max(0, limit - manpower.used).toLocaleString("tr-TR")} kişilik yer var.`);

      const effectiveResources = (await settlementResourceAccess(client, country.id)).get(settlement.id) ?? [settlement.resource_type];
      const activePolicies = activePolicyKeys((await client.query<SettlementPolicyRow>("SELECT * FROM settlement_policies WHERE settlement_id=$1 AND status='ACTIVE'", [settlement.id])).rows);
      const cost = unitPurchaseCost(input.unitType, input.quantity, effectiveResources, activePolicies, country.active_formable_key);
      if (settlement.local_treasury < cost) throw new GameError("Yerel hazinede yeterli altın yok.");
      const waves = createRecruitmentWaves(input.quantity, country.mobilization, guild.current_turn);
      const order = await client.query<{ id: string }>(
        `INSERT INTO recruitment_orders(country_id,settlement_id,unit_type,total_quantity,remaining_quantity,paid_amount,ordered_turn)
         VALUES($1,$2,$3,$4,$4,$5,$6) RETURNING id`, [country.id, settlement.id, input.unitType, input.quantity, cost, guild.current_turn]
      );
      for (const wave of waves) await client.query("INSERT INTO recruitment_waves(order_id,due_turn,quantity) VALUES($1,$2,$3)", [order.rows[0]!.id, wave.dueTurn, wave.quantity]);
      await client.query(`INSERT INTO recruitment_usage(settlement_id,acquisition_turn,quantity) VALUES($1,$2,$3)
        ON CONFLICT(settlement_id,acquisition_turn) DO UPDATE SET quantity=recruitment_usage.quantity+EXCLUDED.quantity`, [settlement.id, guild.current_turn, input.quantity]);
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [cost, settlement.id]);
      await syncCountryTreasury(client, country.id);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'UNIT_PURCHASE',$3,$4)", [country.id, guild.current_turn, -cost, `${settlement.name}: ${input.quantity} ${unit.name}`]);
      await audit(client, input.guildId, input.actorId, "UNIT_PURCHASE", "settlement", settlement.id, { unitType: input.unitType, quantity: input.quantity, cost, waves, trainingCapacity });
      return { cost, waves };
    });
  },

  async purchaseObserver(input: { guildId: string; actorId: string; countryId: string; settlementId: string }): Promise<{ cost: number; dueTurn: number }> {
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Gözcü alımı yalnızca Alım Turunda yapılabilir.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      if (settlement.is_conquered) throw new GameError("Fethedilmiş yerleşke asimile edilmeden Gözcü Birliği yetiştiremez.");
      if (await settlementIsBesieged(client, settlement.id)) throw new GameError("Kuşatma altındaki yerleşke Gözcü Birliği yetiştiremez.");
      if (await countryHasMaintenanceDebt(client, country.id)) throw new GameError("Ödenmemiş bakım açığı giderilmeden Gözcü Birliği alınamaz.");
      const existing = await client.query(
        `SELECT 1 FROM unit_stacks WHERE settlement_id=$1 AND unit_type='observer' AND quantity>0
         UNION ALL
         SELECT 1 FROM recruitment_orders WHERE settlement_id=$1 AND unit_type='observer' AND status='TRAINING' LIMIT 1`, [settlement.id]
      );
      if (existing.rowCount) throw new GameError("Bu yerleşkede zaten bir Gözcü Birliği var veya eğitiliyor.");

      const personLoad = formableModifiers(country.active_formable_key).observerManpower ?? 200;
      const localUsed = await settlementManpower(client, settlement.id);
      const localLimit = settlementMobilizationLimit(settlement.population, country.mobilization);
      if (localUsed + personLoad > localLimit) throw new GameError("Yerleşkenin Ordu Limitinde Gözcü Birliği için yer yok.");
      const trainingCapacity = settlementTrainingCapacity(settlement.population, country.mobilization);
      const usage = (await client.query<{ quantity: number }>("SELECT quantity FROM recruitment_usage WHERE settlement_id=$1 AND acquisition_turn=$2 FOR UPDATE", [settlement.id, guild.current_turn])).rows[0]?.quantity ?? 0;
      if (usage + personLoad > trainingCapacity) throw new GameError("Bu Alım Turundaki Eğitim Kapasitesi Gözcü Birliği için yeterli değil.");
      const manpower = await countryManpower(client, country.id);
      const limit = militaryLimit(manpower.population, country.mobilization);
      if (manpower.used + personLoad > limit) throw new GameError("Askerî personel sınırında Gözcü Birliği için yer yok.");

      const cost = UNITS.observer.price;
      if (settlement.local_treasury < cost) throw new GameError("Yerel hazinede yeterli altın yok.");
      const dueTurn = guild.current_turn + 1;
      const order = await client.query<{ id: string }>(
        `INSERT INTO recruitment_orders(country_id,settlement_id,unit_type,total_quantity,remaining_quantity,paid_amount,ordered_turn)
         VALUES($1,$2,'observer',$3,$3,$4,$5) RETURNING id`, [country.id, settlement.id, personLoad, cost, guild.current_turn]
      );
      await client.query("INSERT INTO recruitment_waves(order_id,due_turn,quantity) VALUES($1,$2,$3)", [order.rows[0]!.id, dueTurn, personLoad]);
      await client.query(`INSERT INTO recruitment_usage(settlement_id,acquisition_turn,quantity) VALUES($1,$2,$3)
        ON CONFLICT(settlement_id,acquisition_turn) DO UPDATE SET quantity=recruitment_usage.quantity+EXCLUDED.quantity`, [settlement.id, guild.current_turn, personLoad]);
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [cost, settlement.id]);
      await syncCountryTreasury(client, country.id);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,\'OBSERVER_PURCHASE\',$3,$4)", [country.id, guild.current_turn, -cost, `${settlement.name}: 1 Gözcü Birliği`]);
      await audit(client, input.guildId, input.actorId, "OBSERVER_PURCHASE", "settlement", settlement.id, { cost, personLoad, dueTurn });
      return { cost, dueTurn };
    });
  },

  async purchaseSiegeAsset(input: { guildId: string; actorId: string; countryId: string; settlementId: string; assetType: keyof typeof SIEGE_ASSETS; quantity: number }): Promise<{ cost: number; completionTurn: number; slots: number }> {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new GameError("Kuşatma aleti miktarı pozitif bir tam sayı olmalıdır.");
    if (input.assetType === "ladder_group" || input.assetType === "ram") throw new GameError("Merdiven ve Koçbaşı yalnızca aktif kuşatma sırasında anlık alınır.");
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Atölye üretimi yalnızca Alım Turunda başlatılabilir.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      if (await settlementIsBesieged(client, settlement.id)) throw new GameError("Kuşatma altındaki yerleşke yeni kuşatma aleti üretim emri veremez.");
      if (await countryHasMaintenanceDebt(client, country.id)) throw new GameError("Ödenmemiş bakım açığı giderilmeden kuşatma aleti üretilemez.");
      const workshop = (await client.query<{ level: number }>("SELECT level FROM buildings WHERE settlement_id=$1 AND building_type='engineering' AND status IN ('ACTIVE','BUILDING')", [settlement.id])).rows[0]?.level ?? 0;
      const asset = SIEGE_ASSETS[input.assetType];
      if (!asset) throw new GameError("Kuşatma aleti bulunamadı.");
      if (workshop < asset.workshop) throw new GameError(`${asset.name} için Mühendislik Atölyesi Sv${asset.workshop} gerekir.`);

      const slotPerUnit = input.assetType === "siege_tower" ? 2 : 1;
      const slots = slotPerUnit * input.quantity;
      const usedSlots = (await client.query<{ total: number }>("SELECT COALESCE(SUM(workshop_slots),0)::integer AS total FROM siege_orders WHERE settlement_id=$1 AND ordered_turn=$2 AND status<>'CANCELLED'", [settlement.id, guild.current_turn])).rows[0]?.total ?? 0;
      if (usedSlots + slots > workshop) throw new GameError(`Atölyenin bu Alım Turunda ${Math.max(0, workshop - usedSlots)} üretim slotu kaldı.`);
      if (input.assetType === "wall_ballista") {
        const ready = (await client.query<{ total: number }>("SELECT COALESCE(SUM(quantity),0)::integer AS total FROM siege_assets WHERE settlement_id=$1 AND asset_type='wall_ballista'", [settlement.id])).rows[0]?.total ?? 0;
        const pending = (await client.query<{ total: number }>("SELECT COALESCE(SUM(quantity),0)::integer AS total FROM siege_orders WHERE settlement_id=$1 AND asset_type='wall_ballista' AND status='BUILDING'", [settlement.id])).rows[0]?.total ?? 0;
        if (ready + pending + input.quantity > 4) throw new GameError("Bir şehirde en fazla 4 Hafif Sur Balistası bulunabilir.");
      }

      const resources = (await settlementResourceAccess(client, country.id)).get(settlement.id) ?? [settlement.resource_type];
      const cost = Math.ceil(asset.price * input.quantity * Math.max(0.5, siegeCostMultiplier(input.assetType, resources) - (formableModifiers(country.active_formable_key).siegeAssetDiscount ?? 0)));
      if (settlement.local_treasury < cost) throw new GameError("Yerel hazinede yeterli altın yok.");
      const completionTurn = guild.current_turn + asset.buildTurns;
      await client.query(
        `INSERT INTO siege_orders(country_id,settlement_id,asset_type,quantity,paid_amount,workshop_slots,ordered_turn,completion_turn,engineering_enhanced)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [country.id, settlement.id, input.assetType, input.quantity, cost, slots, guild.current_turn, completionTurn, workshop >= 3 && ["ballista", "catapult"].includes(input.assetType)]
      );
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [cost, settlement.id]);
      await syncCountryTreasury(client, country.id);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'SIEGE_PURCHASE',$3,$4)", [country.id, guild.current_turn, -cost, `${settlement.name}: ${input.quantity} ${asset.name}`]);
      await audit(client, input.guildId, input.actorId, "SIEGE_PURCHASE", "settlement", settlement.id, { assetType: input.assetType, quantity: input.quantity, cost, completionTurn, slots });
      return { cost, completionTurn, slots };
    });
  },

  async disbandUnits(input: {
    guildId: string; actorId: string; countryId: string; settlementId: string;
    unitType: keyof typeof UNITS; status: UnitStatus; quantity: number;
  }): Promise<{ remaining: number }> {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new GameError("Terhis edilecek asker sayısı pozitif bir tam sayı olmalıdır.");
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const stack = (await client.query<{ id: string; quantity: number }>(
        `SELECT u.id,u.quantity FROM unit_stacks u
          JOIN settlements s ON s.id=u.settlement_id
         WHERE u.settlement_id=$1 AND s.country_id=$2 AND u.unit_type=$3 AND u.status=$4 AND u.force_type='ARMY' FOR UPDATE`,
        [input.settlementId, input.countryId, input.unitType, input.status]
      )).rows[0];
      if (!stack) throw new GameError("Seçilen yerleşkede bu birlik bulunamadı.");
      if (input.quantity > stack.quantity) throw new GameError(`En fazla ${stack.quantity.toLocaleString("tr-TR")} asker terhis edilebilir.`);
      const remaining = stack.quantity - input.quantity;
      if (remaining === 0) await client.query("DELETE FROM unit_stacks WHERE id=$1", [stack.id]);
      else await client.query("UPDATE unit_stacks SET quantity=$1 WHERE id=$2", [remaining, stack.id]);
      await audit(client, input.guildId, input.actorId, "UNIT_DISBAND", "unit_stack", stack.id, {
        settlementId: input.settlementId, unitType: input.unitType, status: input.status,
        quantity: input.quantity, remaining
      });
      return { remaining };
    });
  },
  async purchaseShips(input: { guildId: string; actorId: string; countryId: string; settlementId: string; shipType: keyof typeof SHIPS; quantity: number }): Promise<{ cost: number; completionTurn: number }> {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new GameError("Gemi miktarı pozitif bir tam sayı olmalıdır.");
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Gemi alımı yalnızca Alım Turunda yapılabilir.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      if (settlement.is_conquered) throw new GameError("Fethedilmiş yerleşke asimile edilmeden gemi üretemez.");
      if (await settlementIsBesieged(client, settlement.id)) throw new GameError("Kuşatma altındaki yerleşke yeni gemi emri veremez.");
      if (await countryHasMaintenanceDebt(client, country.id)) throw new GameError("Ödenmemiş bakım açığı giderilmeden yeni gemi emri verilemez.");
      const shipyard = await client.query<{ level: number }>("SELECT level FROM buildings WHERE settlement_id=$1 AND building_type='shipyard' AND status='ACTIVE'", [settlement.id]);
      const shipyardLevel = shipyard.rows[0]?.level ?? 0;
      if (shipyardLevel === 0) throw new GameError("Bu yerleşkede aktif Tersane yok.");
      if (input.shipType === "quinquereme" && shipyardLevel < 2) throw new GameError("Quinquereme için Tersane Sv2 gerekir.");
      const ship = SHIPS[input.shipType];
      const pointCost: Record<keyof typeof SHIPS, number> = { kerkouros: 1, trireme: 2, quinquereme: 4 };
      const basePointCapacity = shipyardLevel === 1 ? 5 : shipyardLevel === 2 ? 10 : 15;
      const shipyardBonus = formableModifiers(country.active_formable_key).shipyardPointBonus ?? {};
      const bonusPoints = (shipyardBonus.kerkouros ?? 0) + (shipyardBonus.trireme ?? 0) * 2 + (shipyardBonus.quinquereme ?? 0) * 4;
      const pontusBonusPoints = country.active_formable_key === "PONTUS" ? (shipyardLevel >= 3 ? 4 : shipyardLevel >= 2 ? 2 : 0) : 0;
      const pointCapacity = basePointCapacity + bonusPoints + pontusBonusPoints;
      const existingOrders = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>("SELECT ship_type,quantity FROM naval_orders WHERE settlement_id=$1 AND ordered_turn=$2 AND status<>'CANCELLED'", [settlement.id, guild.current_turn]);
      const usedPoints = existingOrders.rows.reduce((sum, row) => sum + row.quantity * pointCost[row.ship_type], 0);
      const requestedPoints = input.quantity * pointCost[input.shipType];
      if (usedPoints + requestedPoints > pointCapacity) throw new GameError(`Tersanenin bu Alım Turunda ${Math.max(0, pointCapacity - usedPoints)} üretim puanı kaldı.`);
      const manpower = await countryManpower(client, country.id);
      const personNeed = ship.manpower * input.quantity;
      const limit = militaryLimit(manpower.population, country.mobilization);
      if (manpower.used > limit) throw new GameError("Devlet askerî personel sınırının üzerindeyken yeni gemi üretemez.");
      if (manpower.used + personNeed > limit) throw new GameError("Gemi mürettebatı askerî personel sınırını aşıyor.");
      const effectiveResources = (await settlementResourceAccess(client, country.id)).get(settlement.id) ?? [settlement.resource_type];
      const cost = Math.ceil(ship.price * input.quantity * Math.max(0.5, shipCostMultiplier(effectiveResources) - (formableModifiers(country.active_formable_key).shipDiscount ?? 0)));
      if (settlement.local_treasury < cost) throw new GameError("Yerel hazinede yeterli altın yok.");
      const completionTurn = guild.current_turn + ship.buildTurns;
      await client.query(`INSERT INTO naval_orders(country_id,settlement_id,ship_type,quantity,paid_amount,ordered_turn,completion_turn) VALUES($1,$2,$3,$4,$5,$6,$7)`, [country.id, settlement.id, input.shipType, input.quantity, cost, guild.current_turn, completionTurn]);
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [cost, settlement.id]);
      await syncCountryTreasury(client, country.id);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'SHIP_PURCHASE',$3,$4)", [country.id, guild.current_turn, -cost, `${settlement.name}: ${input.quantity} ${ship.name}`]);
      await audit(client, input.guildId, input.actorId, "SHIP_PURCHASE", "settlement", settlement.id, { shipType: input.shipType, quantity: input.quantity, cost, completionTurn });
      return { cost, completionTurn };
    });
  },

  async setSettlementResource(input: { guildId: string; actorId: string; countryId: string; settlementId: string; resourceType: ResourceType }): Promise<void> {
    await withTransaction(async (client) => {
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const changed = await client.query("UPDATE settlements SET resource_type=$1 WHERE id=$2 AND country_id=$3 RETURNING id", [input.resourceType, input.settlementId, input.countryId]);
      if (!changed.rowCount) throw new GameError("Yerleşke bulunamadı.");
      await audit(client, input.guildId, input.actorId, "RESOURCE_SET", "settlement", input.settlementId, { resourceType: input.resourceType });
    });
  },

  async setRuin(input: { guildId: string; actorId: string; settlementId: string; ruined: boolean }): Promise<void> {
    await withTransaction(async (client) => {
      const settlement = (await client.query<SettlementRow>(`SELECT s.* FROM settlements s JOIN countries c ON c.id=s.country_id WHERE s.id=$1 AND c.guild_id=$2`, [input.settlementId, input.guildId])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      await client.query("UPDATE settlements SET ruin_stage=$1 WHERE id=$2", [input.ruined ? 1 : 0, settlement.id]);
      await audit(client, input.guildId, input.actorId, "RUIN_SET", "settlement", settlement.id, { ruined: input.ruined });
    });
  },

  async setSettlementIncomePenalty(input: {
    guildId: string; actorId: string; countryId: string; settlementId: string;
    percent: number; acquisitionTurns: number; reason: string;
  }): Promise<{ nextAcquisitionTurn: number }> {
    if (!Number.isSafeInteger(input.percent) || input.percent < 1 || input.percent > 100) {
      throw new GameError("Gelir cezası yüzdesi 1 ile 100 arasında olmalıdır.");
    }
    if (!Number.isSafeInteger(input.acquisitionTurns) || input.acquisitionTurns < 1 || input.acquisitionTurns > 100) {
      throw new GameError("Süre 1 ile 100 Alım Turu arasında olmalıdır.");
    }
    const reason = input.reason.trim();
    if (!reason || reason.length > 500) throw new GameError("Neden 1 ile 500 karakter arasında olmalıdır.");
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlement = (await client.query<SettlementRow>(
        "SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE",
        [input.settlementId, country.id]
      )).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      await client.query(
        `INSERT INTO settlement_income_penalties(
           settlement_id,penalty_percent,remaining_acquisition_turns,reason,created_turn,created_by
         ) VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(settlement_id) DO UPDATE SET
           penalty_percent=EXCLUDED.penalty_percent,
           remaining_acquisition_turns=EXCLUDED.remaining_acquisition_turns,
           reason=EXCLUDED.reason,
           created_turn=EXCLUDED.created_turn,
           created_by=EXCLUDED.created_by,
           updated_at=NOW()`,
        [settlement.id, input.percent, input.acquisitionTurns, reason, guild.current_turn, input.actorId]
      );
      const remainder = guild.current_turn % guild.acquisition_interval;
      const nextAcquisitionTurn = guild.current_turn + (remainder === 0 ? guild.acquisition_interval : guild.acquisition_interval - remainder);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_INCOME_PENALTY_SET", "settlement", settlement.id, {
        percent: input.percent, acquisitionTurns: input.acquisitionTurns, reason, nextAcquisitionTurn
      });
      return { nextAcquisitionTurn };
    });
  },

  async clearSettlementIncomePenalty(input: {
    guildId: string; actorId: string; countryId: string; settlementId: string;
  }): Promise<{ percent: number; remainingAcquisitionTurns: number }> {
    return withTransaction(async (client) => {
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlement = (await client.query<SettlementRow>(
        "SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE",
        [input.settlementId, country.id]
      )).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      const removed = (await client.query<SettlementIncomePenaltyRow>(
        "DELETE FROM settlement_income_penalties WHERE settlement_id=$1 RETURNING settlement_id,penalty_percent,remaining_acquisition_turns,reason,created_turn",
        [settlement.id]
      )).rows[0];
      if (!removed) throw new GameError("Bu yerleşkede etkin süreli gelir cezası bulunmuyor.");
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_INCOME_PENALTY_CLEAR", "settlement", settlement.id, {
        percent: Number(removed.penalty_percent), remainingAcquisitionTurns: Number(removed.remaining_acquisition_turns)
      });
      return { percent: Number(removed.penalty_percent), remainingAcquisitionTurns: Number(removed.remaining_acquisition_turns) };
    });
  },

  async adjustSettlementTreasury(input: { guildId: string; actorId: string; countryId: string; settlementId: string; amount: number; reason: string }): Promise<{ balance: number }> {
    return withTransaction(async (client) => {
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      const balance = settlement.local_treasury + input.amount;
      if (balance < 0) throw new GameError("Yerleşke hazinesi sıfırın altına düşemez.");
      await client.query("UPDATE settlements SET local_treasury=$1 WHERE id=$2", [balance, settlement.id]);
      await syncCountryTreasury(client, country.id);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_TREASURY_ADJUST", "settlement", settlement.id, { amount: input.amount, reason: input.reason, balance });
      return { balance };
    });
  },

  async adjustTreasury(input: { guildId: string; actorId: string; countryId: string; amount: number; reason: string }): Promise<void> {
    await withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      const country = await getCountry(client, input.countryId);
      await adjustCountryLocalTreasuries(client, country.id, input.amount);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'ADMIN_ADJUSTMENT',$3,$4)", [country.id, guild.current_turn, input.amount, input.reason]);
      await audit(client, input.guildId, input.actorId, "TREASURY_ADJUST", "country", country.id, { amount: input.amount, reason: input.reason });
    });
  },

  async advanceTurn(guildId: string, actorId: string): Promise<TurnAdvanceResult> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${guildId}`]);
      const guild = await getGuild(client, guildId);
      const newTurn = guild.current_turn + 1;
      const acquisition = isAcquisitionTurn(newTurn, guild.acquisition_interval);
      const eventKey = `TURN_ADVANCE:${newTurn}`;
      const claimed = await client.query("INSERT INTO processed_events(guild_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_key", [guildId, eventKey]);
      if (!claimed.rowCount) throw new GameError("Bu tur daha önce işlenmiş.");

      const mercenaryArrivalDetails: Array<{ countryName: string; settlementName: string; companyName: string; upkeep: number }> = [];
      const mercenaryUpkeepDetails: Array<{ countryName: string; companyName: string; amount: number }> = [];
      const mercenaryUnpaidDetails: Array<{ countryName: string; companyName: string; amount: number }> = [];
      const mercenaryEndedDetails: Array<{ countryName: string; companyName: string; reason: string }> = [];

      const arrived = await client.query<{ id: string; country_id: string; country_name: string; settlement_name: string; company_key: MercenaryCompanyKey; turn_upkeep: number }>(
        `UPDATE mercenary_contracts mc
            SET status='ACTIVE',updated_at=NOW()
           FROM countries c,settlements s
          WHERE mc.country_id=c.id AND mc.settlement_id=s.id AND mc.guild_id=$1
            AND mc.status='PENDING' AND mc.arrival_turn<=$2
            AND NOT EXISTS (SELECT 1 FROM battles b WHERE b.defender_settlement_id=mc.settlement_id AND b.terrain='SIEGE' AND b.status NOT IN ('FINISHED','CANCELLED'))
          RETURNING mc.id,mc.country_id,c.name AS country_name,s.name AS settlement_name,mc.company_key,mc.turn_upkeep`,
        [guildId,newTurn]
      );
      for (const row of arrived.rows) mercenaryArrivalDetails.push({
        countryName: row.country_name, settlementName: row.settlement_name,
        companyName: MERCENARY_COMPANIES[row.company_key]?.name ?? row.company_key, upkeep: Number(row.turn_upkeep)
      });


      const activatedPolicies = await client.query<{ id: string; settlement_id: string; settlement_name: string; policy_key: CityPolicyKey; country_id: string; active_formable_key: FormableCountryKey | null }>(
        `UPDATE settlement_policies sp SET status='ACTIVE'
          FROM settlements s JOIN countries c ON c.id=s.country_id
         WHERE sp.settlement_id=s.id AND c.guild_id=$1 AND sp.status='PENDING' AND sp.activation_turn<=$2
         RETURNING sp.id,sp.settlement_id,s.name AS settlement_name,sp.policy_key,s.country_id,c.active_formable_key`, [guildId, newTurn]
      );
      for (const policy of activatedPolicies.rows.filter((item) => item.policy_key === "CONSCRIPTION")) {
        const modifiers = formableModifiers(policy.active_formable_key);
        const populationCost = policy.active_formable_key === "GERMANIC_UNION" ? 4_000 : 5_000;
        const militiaQuantity = Math.floor(5_000 * (modifiers.policyMilitiaMultiplier ?? 1));
        const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 FOR UPDATE", [policy.settlement_id])).rows[0];
        const battle = (await client.query<{ id: string }>("SELECT b.id FROM battles b JOIN battle_sides bs ON bs.battle_id=b.id WHERE bs.country_id=$1 AND b.status NOT IN ('FINISHED','CANCELLED') ORDER BY b.created_at DESC LIMIT 1", [policy.country_id])).rows[0];
        if (!settlement || !battle || settlement.population < populationCost) {
          await client.query("DELETE FROM settlement_policies WHERE id=$1", [policy.id]);
          continue;
        }
        const once = await client.query("INSERT INTO settlement_conscriptions(settlement_id,battle_id,created_turn) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING battle_id", [settlement.id, battle.id, newTurn]);
        if (!once.rowCount) continue;
        await client.query("UPDATE settlements SET population=population-$1 WHERE id=$2", [populationCost, settlement.id]);
        await client.query(`INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
          VALUES($1,'militia',$2,'GARRISON','ARMY')
          ON CONFLICT(settlement_id,unit_type,status,force_type) DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity`, [settlement.id, militiaQuantity]);
      }

      const starvationUpdates = await client.query<{ settlement_name: string; starvation_remaining: number; starvation_capacity: number }>(
        `UPDATE battles b SET starvation_remaining=GREATEST(0,b.starvation_remaining-1),last_starvation_turn=$2
          FROM settlements s
         WHERE b.defender_settlement_id=s.id AND b.guild_id=$1 AND b.terrain='SIEGE'
           AND b.status NOT IN ('DRAFT','FINISHED','CANCELLED')
           AND b.starvation_remaining IS NOT NULL AND COALESCE(b.last_starvation_turn,0)<$2
         RETURNING s.name AS settlement_name,b.starvation_remaining,b.starvation_capacity`, [guildId, newTurn]
      );

      const completedBuildings = await client.query<{ settlement_name: string; building_type: string; level: number }>(
        `UPDATE buildings b SET level=b.target_level,target_level=NULL,status='ACTIVE',started_turn=NULL,completion_turn=NULL
          FROM settlements s JOIN countries c ON c.id=s.country_id
         WHERE b.settlement_id=s.id AND c.guild_id=$1 AND b.status='BUILDING' AND b.completion_turn<=$2
         RETURNING s.name AS settlement_name,b.building_type,b.level`, [guildId, newTurn]
      );
      const dueWaves = await client.query<{ id: string; order_id: string; settlement_id: string; settlement_name: string; unit_type: keyof typeof UNITS; quantity: number }>(
        `SELECT rw.id,rw.order_id,ro.settlement_id,s.name AS settlement_name,ro.unit_type,rw.quantity FROM recruitment_waves rw
          JOIN recruitment_orders ro ON ro.id=rw.order_id JOIN countries c ON c.id=ro.country_id JOIN settlements s ON s.id=ro.settlement_id
         WHERE c.guild_id=$1 AND rw.processed_at IS NULL AND rw.due_turn<=$2
           AND NOT EXISTS (SELECT 1 FROM battles b WHERE b.defender_settlement_id=s.id AND b.terrain='SIEGE' AND b.status NOT IN ('FINISHED','CANCELLED'))
         FOR UPDATE OF rw`, [guildId, newTurn]
      );
      for (const wave of dueWaves.rows) {
        await client.query(`INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type) VALUES($1,$2,$3,'GARRISON','ARMY') ON CONFLICT(settlement_id,unit_type,status,force_type) DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity`, [wave.settlement_id, wave.unit_type, wave.quantity]);
        await client.query("UPDATE recruitment_waves SET processed_at=NOW() WHERE id=$1", [wave.id]);
        await client.query("UPDATE recruitment_orders SET remaining_quantity=remaining_quantity-$1 WHERE id=$2", [wave.quantity, wave.order_id]);
      }
      await client.query("UPDATE recruitment_orders SET status='COMPLETED' WHERE status='TRAINING' AND remaining_quantity=0");

      const dueShips = await client.query<{ id: string; settlement_id: string; settlement_name: string; ship_type: keyof typeof SHIPS; quantity: number }>(
        `SELECT no.id,no.settlement_id,s.name AS settlement_name,no.ship_type,no.quantity FROM naval_orders no JOIN countries c ON c.id=no.country_id JOIN settlements s ON s.id=no.settlement_id
         WHERE c.guild_id=$1 AND no.status='BUILDING' AND no.completion_turn<=$2
           AND NOT EXISTS (SELECT 1 FROM battles b WHERE b.defender_settlement_id=s.id AND b.terrain='SIEGE' AND b.status NOT IN ('FINISHED','CANCELLED'))
         FOR UPDATE OF no`, [guildId, newTurn]
      );
      for (const order of dueShips.rows) {
        await client.query(`INSERT INTO naval_units(settlement_id,ship_type,quantity,status) VALUES($1,$2,$3,'RESERVE') ON CONFLICT(settlement_id,ship_type,status) DO UPDATE SET quantity=naval_units.quantity+EXCLUDED.quantity`, [order.settlement_id, order.ship_type, order.quantity]);
        await client.query("UPDATE naval_orders SET status='COMPLETED' WHERE id=$1", [order.id]);
      }

      const dueSiege = await client.query<{ id: string; country_id: string; settlement_id: string; settlement_name: string; asset_type: keyof typeof SIEGE_ASSETS; quantity: number; engineering_enhanced: boolean }>(
        `SELECT so.id,so.country_id,so.settlement_id,s.name AS settlement_name,so.asset_type,so.quantity,so.engineering_enhanced
           FROM siege_orders so JOIN countries c ON c.id=so.country_id JOIN settlements s ON s.id=so.settlement_id
          WHERE c.guild_id=$1 AND so.status='BUILDING' AND so.completion_turn<=$2
            AND NOT EXISTS (SELECT 1 FROM battles b WHERE b.defender_settlement_id=s.id AND b.terrain='SIEGE' AND b.status NOT IN ('FINISHED','CANCELLED'))
          FOR UPDATE OF so`, [guildId, newTurn]
      );
      for (const order of dueSiege.rows) {
        await client.query(
          `INSERT INTO siege_assets(settlement_id,country_id,asset_type,quantity,location_note,enhanced_quantity)
           VALUES($1,$2,$3,$4,NULL,$5)
           ON CONFLICT (country_id,settlement_id,asset_type,location_note)
           DO UPDATE SET quantity=siege_assets.quantity+EXCLUDED.quantity,enhanced_quantity=siege_assets.enhanced_quantity+EXCLUDED.enhanced_quantity`,
          [order.settlement_id, order.country_id, order.asset_type, order.quantity, order.engineering_enhanced ? order.quantity : 0]
        );
        await client.query("UPDATE siege_orders SET status='COMPLETED' WHERE id=$1", [order.id]);
      }

      const completedBuildingDetails = completedBuildings.rows.map((row) => ({ settlementName: row.settlement_name, buildingName: BUILDINGS[row.building_type]?.name ?? row.building_type, level: row.level }));
      const recruitmentArrivalMap = new Map<string, { settlementName: string; unitName: string; quantity: number }>();
      for (const row of dueWaves.rows) {
        const key = `${row.settlement_id}:${row.unit_type}`;
        const current = recruitmentArrivalMap.get(key) ?? { settlementName: row.settlement_name, unitName: row.unit_type === "observer" ? "Gözcü personeli" : UNITS[row.unit_type]?.name ?? row.unit_type, quantity: 0 };
        current.quantity += row.quantity;
        recruitmentArrivalMap.set(key, current);
      }
      const recruitmentArrivalDetails = [...recruitmentArrivalMap.values()];
      const completedShipDetails = dueShips.rows.map((row) => ({ settlementName: row.settlement_name, shipName: SHIPS[row.ship_type]?.name ?? row.ship_type, quantity: row.quantity }));
      const completedSiegeDetails = dueSiege.rows.map((row) => ({ settlementName: row.settlement_name, assetName: SIEGE_ASSETS[row.asset_type]?.name ?? row.asset_type, quantity: row.quantity }));
      const completedGarrisons = await completeDueGarrisonReplenishments(client, guildId, newTurn);
      const garrisonUpgrades = completedGarrisons.length;
      const garrisonUpgradeDetails = completedGarrisons.map((order) => order.settlementName);
      const garrisonReplenishmentCompletedDetails = completedGarrisons.map((order) => ({ settlementName: order.settlementName, personnel: order.personnel }));
      const activatedPolicyDetails = activatedPolicies.rows.map((item) => ({ settlementName: item.settlement_name, policyName: CITY_POLICIES[item.policy_key].label }));
      const starvationDetails = starvationUpdates.rows.map((item) => ({ settlementName: item.settlement_name, remaining: item.starvation_remaining, capacity: item.starvation_capacity }));
      const unrestDetails: Array<{ settlementName: string; chance: number; roll: number }> = [];
      const pantheonLoanDetails: Array<{ settlementName: string; amount: number; remaining: number }> = [];
      const incomePenaltyDetails: Array<{ settlementName: string; percent: number; deductedAmount: number; remainingAcquisitionTurns: number; reason: string }> = [];
      const manpowerCountries = (await client.query<CountryRow>("SELECT * FROM countries WHERE guild_id=$1 AND status='ACTIVE' FOR UPDATE", [guildId])).rows;
      for (const country of manpowerCountries) {
        const manpower = await countryManpower(client, country.id);
        const overLimit = manpower.used > militaryLimit(manpower.population, country.mobilization);
        if (!overLimit) {
          await client.query("UPDATE countries SET manpower_over_limit_since_turn=NULL,manpower_penalty_active=FALSE WHERE id=$1", [country.id]);
        } else if (country.manpower_over_limit_since_turn === null) {
          await client.query("UPDATE countries SET manpower_over_limit_since_turn=$1 WHERE id=$2", [newTurn, country.id]);
        } else {
          const since = country.manpower_over_limit_since_turn;
          const remainder = since % guild.acquisition_interval;
          const graceAcquisitionTurn = since + (remainder === 0 ? guild.acquisition_interval : guild.acquisition_interval - remainder);
          if (acquisition && newTurn > graceAcquisitionTurn) {
            await client.query("UPDATE countries SET manpower_penalty_active=TRUE WHERE id=$1", [country.id]);
          }
        }
      }
      if (acquisition) {
        const countries = (await client.query<CountryRow>("SELECT * FROM countries WHERE guild_id=$1 AND status='ACTIVE' FOR UPDATE", [guildId])).rows;
        for (const country of countries) {
          const settlements = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE country_id=$1 FOR UPDATE", [country.id])).rows;
          const tradeBonuses = await activeTradeBonuses(client, country.id);
          const resourceAccess = await settlementResourceAccess(client, country.id);
          let incomeBreakdown: IncomeBreakdown = { building: 0, tax: 0, landTrade: 0, seaTrade: 0 };
          let upkeep = 0;
          for (const settlement of settlements) {
            const buildings = (await client.query<BuildingRow>("SELECT * FROM buildings WHERE settlement_id=$1", [settlement.id])).rows;
            const active = buildings.filter((b) => b.status === "ACTIVE" && b.level > 0).map((b) => ({ buildingType: b.building_type, level: b.level }));
            const activePolicies = activePolicyKeys((await client.query<SettlementPolicyRow>("SELECT * FROM settlement_policies WHERE settlement_id=$1 AND status='ACTIVE'", [settlement.id])).rows);
            const assignedMerchant = (await client.query<{ skill_bonus: number }>("SELECT skill_bonus FROM country_characters WHERE assigned_settlement_id=$1 AND assignment='AGORA' AND role='MERCHANT' LIMIT 1", [settlement.id])).rows[0];
            const agreementBonus = tradeBonuses.get(settlement.id) ?? { land: 0, sea: 0 };
            const effectiveResources = resourceAccess.get(settlement.id) ?? [settlement.resource_type];
            const economy = calculateCategorizedIncome({
              settlementIncome: 0,
              taxIncome: populationTaxIncome(settlement.population),
              landTradeIncome: settlement.base_land_trade_income,
              seaTradeIncome: 0,
              agreementLandIncome: agreementBonus.land,
              agreementSeaIncome: agreementBonus.sea,
              manualFlatIncome: settlement.manual_flat_income,
              manualIncomePercent: settlement.manual_income_percent,
              buildings: active,
              ruinStage: settlement.ruin_stage,
              resources: effectiveResources,
              slavePopulation: settlement.slave_population,
              activePolicies,
              assignedMerchant: Boolean(assignedMerchant),
              merchantSkillBonus: assignedMerchant?.skill_bonus ?? 0,
              formableKey: country.active_formable_key
            });
            const popGain = applyFormablePopulationModifiers(calculatePopulationGain({ basePopulationGrowth: settlement.base_population_growth, buildings: active, ruinStage: settlement.ruin_stage, mobilization: country.mobilization, resources: effectiveResources }), settlement.ruin_stage, country.active_formable_key);
            const incomePenalty = (await client.query<SettlementIncomePenaltyRow>(
              "SELECT settlement_id,penalty_percent,remaining_acquisition_turns,reason,created_turn FROM settlement_income_penalties WHERE settlement_id=$1 FOR UPDATE",
              [settlement.id]
            )).rows[0];
            const mobilizedIncome = scaleIncome(economy.payable, MOBILIZATION_RULES[country.mobilization].incomeMultiplier);
            const adjustedSettlementIncome = applyIncomePenalty(mobilizedIncome, Number(incomePenalty?.penalty_percent ?? 0));
            const settlementUnits = (await client.query<{ unit_type: keyof typeof UNITS; quantity: number; status: UnitStatus }>("SELECT unit_type,quantity,status FROM unit_stacks WHERE settlement_id=$1", [settlement.id])).rows;
            const settlementShips = (await client.query<{ ship_type: keyof typeof SHIPS; quantity: number; status: ShipStatus }>("SELECT ship_type,quantity,status FROM naval_units WHERE settlement_id=$1", [settlement.id])).rows;
            const settlementUpkeep = economy.buildingUpkeep
              + settlementUnits.reduce((sum, unit) => sum + calculateUnitUpkeep(unit.unit_type, unit.quantity, unit.status, country.mobilization, effectiveResources, country.manpower_penalty_active), 0)
              + settlementShips.reduce((sum, ship) => sum + calculateShipUpkeep(ship.ship_type, ship.quantity, ship.status, country.mobilization, country.manpower_penalty_active), 0);
            const settlementGross = incomeTotal(adjustedSettlementIncome);
            const settlementNet = settlementGross - settlementUpkeep;
            incomeBreakdown = addIncomeBreakdowns(incomeBreakdown, adjustedSettlementIncome);
            upkeep += settlementUpkeep;
            const nextPopulation = settlement.population + popGain;
            await client.query("UPDATE settlements SET population=$1,ruin_stage=$2,local_treasury=local_treasury+$3,last_acquisition_income=$4 WHERE id=$5", [nextPopulation, nextRuinStage(settlement.ruin_stage), settlementNet, settlementGross, settlement.id]);
            if (incomePenalty) {
              const remainingAcquisitionTurns = Number(incomePenalty.remaining_acquisition_turns) - 1;
              if (remainingAcquisitionTurns <= 0) {
                await client.query("DELETE FROM settlement_income_penalties WHERE settlement_id=$1", [settlement.id]);
              } else {
                await client.query(
                  "UPDATE settlement_income_penalties SET remaining_acquisition_turns=$1,updated_at=NOW() WHERE settlement_id=$2",
                  [remainingAcquisitionTurns, settlement.id]
                );
              }
              incomePenaltyDetails.push({
                settlementName: settlement.name,
                percent: Number(incomePenalty.penalty_percent),
                deductedAmount: Math.max(0, incomeTotal(mobilizedIncome) - settlementGross),
                remainingAcquisitionTurns,
                reason: incomePenalty.reason
              });
            }
          }
          const dueLoan = (await client.query<{ id: string; settlement_id: string; settlement_name: string; remaining_amount: number; local_treasury: number }>(
            `SELECT pl.id,pl.settlement_id,s.name AS settlement_name,pl.remaining_amount,s.local_treasury
               FROM pantheon_loans pl JOIN settlements s ON s.id=pl.settlement_id
              WHERE pl.country_id=$1 AND pl.status='ACTIVE' AND pl.due_turn<=$2 FOR UPDATE OF pl,s`, [country.id, newTurn])).rows[0];
          if (dueLoan) {
            const payment = Math.min(Math.max(0, Number(dueLoan.local_treasury)), Number(dueLoan.remaining_amount));
            const remaining = Number(dueLoan.remaining_amount) - payment;
            if (payment > 0) await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [payment, dueLoan.settlement_id]);
            await client.query("UPDATE pantheon_loans SET remaining_amount=$1,status=$2 WHERE id=$3", [remaining, remaining ? "ACTIVE" : "REPAID", dueLoan.id]);
            pantheonLoanDetails.push({ settlementName: dueLoan.settlement_name, amount: payment, remaining });
          }
          const adjustedIncome = incomeTotal(incomeBreakdown);
          const net = adjustedIncome - upkeep;
          await syncCountryTreasury(client, country.id);
          await client.query(
            "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'ACQUISITION_TURN',$3,$4)",
            [country.id, newTurn, net, `Binalar ${incomeBreakdown.building}; halk vergisi ${incomeBreakdown.tax}; kara ticareti ${incomeBreakdown.landTrade}; deniz ticareti ${incomeBreakdown.seaTrade}; bakım ${upkeep}`]
          );
        }
      }

      if (acquisition) {
        // Alım Turlarında gelir ve normal giderler yerel hazinelere önce işlenir;
        // paralı asker bakımı ancak güncel bakiyeler oluştuktan sonra tahsil edilir.
        const mercenaryUpkeep = await collectMercenaryUpkeep(client, guildId, newTurn);
        mercenaryUpkeepDetails.push(...mercenaryUpkeep.paid);
        mercenaryUnpaidDetails.push(...mercenaryUpkeep.unpaid);
      }

      const startedGarrisons = await scheduleAllMissingGarrisons(client, guildId, newTurn);
      const garrisonReplenishmentStartedDetails = startedGarrisons.map((order) => ({ settlementName: order.settlementName, personnel: order.personnel, cost: order.cost, completionTurn: order.completionTurn, reason: order.reason }));
      await client.query("UPDATE guilds SET current_turn=$1,turn_phase='OPEN',updated_at=NOW() WHERE discord_id=$2", [newTurn, guildId]);
      await audit(client, guildId, actorId, "TURN_ADVANCE", "guild", guildId, {
        from: guild.current_turn, to: newTurn, acquisition, garrisonUpgrades, startedGarrisons: garrisonReplenishmentStartedDetails, incomePenaltyDetails,
        mercenaryArrivals: mercenaryArrivalDetails.length, mercenaryUpkeep: mercenaryUpkeepDetails,
        mercenaryUnpaid: mercenaryUnpaidDetails, mercenaryEnded: mercenaryEndedDetails
      });
      return {
        turn: newTurn, acquisition,
        completedBuildings: completedBuildings.rowCount ?? 0,
        recruitmentArrivals: dueWaves.rows.reduce((sum, row) => sum + row.quantity, 0),
        completedShips: dueShips.rows.reduce((sum, row) => sum + row.quantity, 0),
        completedSiegeAssets: dueSiege.rows.reduce((sum, row) => sum + row.quantity, 0),
        garrisonUpgrades,
        completedBuildingDetails,
        recruitmentArrivalDetails,
        completedShipDetails,
        completedSiegeDetails,
        garrisonUpgradeDetails,
        activatedPolicyDetails,
        unrestDetails,
        starvationDetails,
        pantheonLoanDetails,
        garrisonReplenishmentStartedDetails,
        garrisonReplenishmentCompletedDetails,
        incomePenaltyDetails,
        mercenaryArrivalDetails,
        mercenaryUpkeepDetails,
        mercenaryUnpaidDetails,
        mercenaryEndedDetails
      };
    });
  },

  async setTurnPhase(guildId: string, actorId: string, phase: "OPEN" | "CLOSED" | "RESOLVING"): Promise<void> {
    await withTransaction(async (client) => {
      await ensureGuild(client, guildId);
      await client.query("UPDATE guilds SET turn_phase=$1,updated_at=NOW() WHERE discord_id=$2", [phase, guildId]);
      await audit(client, guildId, actorId, "TURN_PHASE", "guild", guildId, { phase });
    });
  },

  async resetGame(guildId: string, actorId: string): Promise<{ deletedCountries: number }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${guildId}`]);
      await ensureGuild(client, guildId);
      await client.query("DELETE FROM battles WHERE guild_id=$1", [guildId]);
      await client.query("DELETE FROM settlement_event_draws WHERE guild_id=$1", [guildId]);
      const deleted = await client.query("DELETE FROM countries WHERE guild_id=$1 RETURNING id", [guildId]);
      await client.query("DELETE FROM processed_events WHERE guild_id=$1", [guildId]);
      await client.query("UPDATE guilds SET current_turn=0,turn_phase='CLOSED',updated_at=NOW() WHERE discord_id=$1", [guildId]);
      await audit(client, guildId, actorId, "GAME_RESET", "guild", guildId, { deletedCountries: deleted.rowCount ?? 0 });
      return { deletedCountries: deleted.rowCount ?? 0 };
    });
  },

  async addRoleChannel(guildId: string, channelId: string): Promise<void> {
    await pool.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [guildId]);
    await pool.query("INSERT INTO role_channels(guild_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [guildId, channelId]);
  },

  async removeRoleChannel(guildId: string, channelId: string): Promise<void> {
    await pool.query("DELETE FROM role_channels WHERE guild_id=$1 AND channel_id=$2", [guildId, channelId]);
  },

  async recordRoleMessage(input: { messageId: string; guildId: string; channelId: string; userId: string; wordCount: number; createdAt: Date }): Promise<void> {
    const enabled = await pool.query("SELECT 1 FROM role_channels WHERE guild_id=$1 AND channel_id=$2", [input.guildId, input.channelId]);
    if (!enabled.rowCount) return;
    await pool.query(
      `INSERT INTO role_messages(message_id,guild_id,channel_id,discord_user_id,word_count,message_date,created_at)
       VALUES($1,$2,$3,$4,$5,($6::timestamptz)::date,$6::timestamptz) ON CONFLICT DO NOTHING`,
      [input.messageId, input.guildId, input.channelId, input.userId, input.wordCount, input.createdAt]
    );
  },

  async leaderboard(guildId: string, period: RoleReportPeriod, timezone = "Europe/Istanbul"): Promise<Array<{ discord_user_id: string; words: number; messages: number }>> {
    const range = currentRolePeriodRange(period, new Date(), timezone);
    const result = await pool.query<{ discord_user_id: string; words: number; messages: number }>(
      `SELECT discord_user_id,SUM(word_count)::integer AS words,COUNT(*)::integer AS messages
         FROM role_messages WHERE guild_id=$1 AND message_date >= $2::date AND message_date < $3::date
        GROUP BY discord_user_id ORDER BY words DESC, messages DESC LIMIT 15`,
      [guildId, range.startDate, range.endDateExclusive]
    );
    return result.rows;
  }
};
