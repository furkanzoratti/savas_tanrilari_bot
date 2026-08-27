import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { BUILD_DURATIONS, BUILDINGS, CITY_POLICIES, MAX_BUILDING_COST_DISCOUNT, MOBILIZATION_RULES, SHIPS, SIEGE_ASSETS, UNITS, buildingBaseCost, type CityPolicyKey } from "../domain/catalog.js";
import { buildingSlotLimit, calculatePopulationGain, calculateShipUpkeep, calculateUnitUpkeep, nextRuinStage } from "../domain/economy.js";
import { addIncomeBreakdowns, calculateCategorizedIncome, incomeTotal, populationTaxIncome, scaleIncome, type IncomeBreakdown } from "../domain/income.js";
import { createRecruitmentWaves, isAcquisitionTurn, militaryLimit, settlementMobilizationLimit, settlementTrainingCapacity } from "../domain/mobilization.js";
import { garrisonComposition, garrisonLevel } from "../domain/garrison.js";
import type { CultureGroup } from "../domain/cultures.js";
import type { CharacterRole, ForceType, Mobilization, RuinStage, ShipStatus, UnitStatus } from "../domain/types.js";
import { buildingCostMultiplier, buildingDurationReduction, shipCostMultiplier, siegeCostMultiplier, unitCostMultiplier, type ResourceType } from "../domain/resources.js";
import { settlementResourceAccess } from "./resource-service.js";

export class GameError extends Error {}

interface GuildRow { discord_id: string; current_turn: number; turn_phase: string; acquisition_interval: number }
interface CountryRow { id: string; guild_id: string; name: string; treasury: number; mobilization: Mobilization; mobilization_started_turn: number | null; manpower_over_limit_since_turn: number | null; manpower_penalty_active: boolean; discord_role_id: string | null }
interface SettlementRow {
  id: string; country_id: string; name: string; population: number; slave_population: number;
  base_income: number; tax_income: number; land_trade_income: number; sea_trade_income: number;
  base_population_growth: number; manual_flat_income: number;
  manual_income_percent: number; ruin_stage: RuinStage; resource_type: ResourceType; culture_group: CultureGroup;
  garrison_level: number; local_treasury: number; base_land_trade_income: number; is_conquered: boolean; conquered_turn: number | null;
  is_coastal: boolean; last_acquisition_income: number; curia_guard_granted: boolean;
  black_market_active: boolean; epidemic_active: boolean; unrest_active: boolean; rebellion_active: boolean;
}
interface BuildingRow { settlement_id: string; building_type: string; level: number; target_level: number | null; status: "ACTIVE" | "BUILDING"; completion_turn: number | null }

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
  acquisition_turn: number; roll_sides: 20 | 30; roll_value: number | null;
  excluded_role: CharacterRole | null; selected_role: CharacterRole | null;
  result_role: CharacterRole | null; skill_bonus: number;
  status: "PENDING_ROLL" | "AWAITING_NAME" | "COMPLETED" | "CANCELLED";
  initiated_by: string;
}

function activePolicyKeys(policies: readonly SettlementPolicyRow[]): CityPolicyKey[] {
  return policies.filter((policy) => policy.status === "ACTIVE").map((policy) => policy.policy_key);
}

function settlementStarvationBonus(buildings: Array<{ buildingType: string; level: number }>, policies: readonly CityPolicyKey[]): number {
  const farm = buildings.find((building) => building.buildingType === "farm")?.level ?? 0;
  const aqueduct = buildings.find((building) => building.buildingType === "aqueduct")?.level ?? 0;
  return Math.min(5, (farm >= 3 ? 3 : farm >= 2 ? 1 : 0) + (aqueduct >= 2 ? 2 : 0) + (policies.includes("GARRISON_REINFORCEMENT") ? 1 : 0));
}

function settlementUnrestChance(buildings: Array<{ buildingType: string; level: number }>, resources: readonly ResourceType[], policies: readonly CityPolicyKey[]): number {
  const lupanar = buildings.find((building) => building.buildingType === "lupanar")?.level ?? 0;
  const slaveCamp = buildings.find((building) => building.buildingType === "slave_camp")?.level ?? 0;
  const pantheon = buildings.find((building) => building.buildingType === "pantheon")?.level ?? 0;
  return Math.max(0, Math.min(100, lupanar * 10 + slaveCamp * 10
    + (policies.includes("STRICT_TAXATION") ? 10 : 0)
    - (pantheon > 0 ? 10 : 0)
    - (resources.includes("WINE") ? 10 : 0)
    - (resources.includes("AMBER") ? 10 : 0)));
}

function policyRecruitmentDiscount(policies: readonly CityPolicyKey[]): number {
  if (policies.includes("GARRISON_REINFORCEMENT") || policies.includes("CONSCRIPTION")) return 0.10;
  return policies.includes("WAR_PREPARATION") ? 0.05 : 0;
}

export function buildingPurchaseTerms(buildingType: string, targetLevel: number, resources: readonly ResourceType[], policies: readonly CityPolicyKey[]): { cost: number; duration: number } {
  const master = policies.includes("MASTER_ARCHITECTURE");
  const accelerated = policies.includes("ACCELERATED_CONSTRUCTION");
  const policyDiscount = master ? 0.10 : accelerated ? 0.05 : 0;
  const resourceDiscount = 1 - buildingCostMultiplier(buildingType, resources);
  const multiplier = 1 - Math.min(MAX_BUILDING_COST_DISCOUNT, resourceDiscount + policyDiscount);
  const durationReduction = buildingDurationReduction(buildingType, resources)
    + (master && targetLevel >= 2 ? 3 : accelerated ? 1 : 0);
  return {
    cost: Math.ceil(buildingBaseCost(buildingType, targetLevel) * multiplier),
    duration: Math.max(1, BUILD_DURATIONS[targetLevel]! - durationReduction)
  };
}

export interface CountryDocument {
  guild: GuildRow;
  country: CountryRow;
  playerIds: string[];
  characters: CountryCharacter[];
  allies: Array<{ id: string; name: string }>;
  pacts: Array<{ id: string; name: string; purpose: string; founder_name: string }>;
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
    totalSettlementUpkeep: number;
    populationGain: number;
    militaryUsed: number;
    militaryLimit: number;
    trainingCapacity: number;
    trainingUsed: number;
    trainingRemaining: number;
    slotLimit: number;
    constructionLimit: number;
    unrestRisk: number;
    starvationBonus: number;
    temporaryMilitia: number;
    assignedMerchant: boolean;
    policies: SettlementPolicyRow[];
    effectiveResources: ResourceType[];
    buildings: BuildingRow[];
    units: Array<{ unit_type: keyof typeof UNITS; quantity: number; status: UnitStatus; force_type: ForceType }>;
    ships: Array<{ ship_type: keyof typeof SHIPS; quantity: number; status: ShipStatus }>;
    siegeAssets: Array<{ asset_type: string; quantity: number; location_note: string | null }>;
    pendingRecruitment: Array<{ unit_type: keyof typeof UNITS; quantity: number; due_turn: number }>;
    pendingShips: Array<{ ship_type: keyof typeof SHIPS; quantity: number; completion_turn: number }>;
    pendingSiege: Array<{ asset_type: keyof typeof SIEGE_ASSETS; quantity: number; completion_turn: number }>;
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
  pantheonLoanDetails: Array<{ settlementName: string; amount: number; remaining: number }>;
}

async function ensureGuild(client: DbClient, guildId: string): Promise<GuildRow> {
  await client.query("INSERT INTO guilds(discord_id) VALUES ($1) ON CONFLICT DO NOTHING", [guildId]);
  const result = await client.query<GuildRow>("SELECT * FROM guilds WHERE discord_id = $1", [guildId]);
  return result.rows[0]!;
}

async function getCountry(client: DbClient, countryId: string): Promise<CountryRow> {
  const result = await client.query<CountryRow>("SELECT * FROM countries WHERE id = $1", [countryId]);
  if (!result.rows[0]) throw new GameError("Ülke bulunamadı.");
  return result.rows[0];
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
    used: (unitResult.rows[0]?.total ?? 0) + (pendingResult.rows[0]?.total ?? 0) + shipManpower
  };
}

async function settlementManpower(client: DbClient, settlementId: string): Promise<number> {
  const units = await client.query<{ total: number }>("SELECT COALESCE(SUM(quantity),0)::bigint AS total FROM unit_stacks WHERE settlement_id=$1", [settlementId]);
  const pending = await client.query<{ total: number }>("SELECT COALESCE(SUM(remaining_quantity),0)::bigint AS total FROM recruitment_orders WHERE settlement_id=$1 AND status='TRAINING'", [settlementId]);
  const ships = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>("SELECT ship_type,SUM(quantity)::integer AS quantity FROM naval_units WHERE settlement_id=$1 GROUP BY ship_type", [settlementId]);
  const pendingShips = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>("SELECT ship_type,SUM(quantity)::integer AS quantity FROM naval_orders WHERE settlement_id=$1 AND status='BUILDING' GROUP BY ship_type", [settlementId]);
  const shipManpower = [...ships.rows, ...pendingShips.rows].reduce((sum, row) => sum + (SHIPS[row.ship_type]?.manpower ?? 0) * row.quantity, 0);
  return (units.rows[0]?.total ?? 0) + (pending.rows[0]?.total ?? 0) + shipManpower;
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
       WHERE c.guild_id = $1 AND cm.discord_user_id = $2
       ORDER BY c.name LIMIT 1`, [guildId, userId]
    );
    return result.rows[0] ?? null;
  },

  async countryByName(guildId: string, name: string): Promise<CountryRow | null> {
    const result = await pool.query<CountryRow>(
      "SELECT * FROM countries WHERE guild_id = $1 AND lower(name) = lower($2) LIMIT 1", [guildId, name]
    );
    return result.rows[0] ?? null;
  },

  async listCountries(guildId: string): Promise<CountryRow[]> {
    const result = await pool.query<CountryRow>("SELECT * FROM countries WHERE guild_id = $1 ORDER BY name", [guildId]);
    return result.rows;
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

  async playerIds(countryId: string): Promise<string[]> {
    const result = await pool.query<{ discord_user_id: string }>("SELECT discord_user_id FROM country_members WHERE country_id=$1 ORDER BY discord_user_id", [countryId]);
    return result.rows.map((row) => row.discord_user_id);
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

  async deleteCountry(input: { guildId: string; actorId: string; countryId: string }): Promise<{ name: string; settlements: number; battles: number; discordRoleId: string | null }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = (await client.query<CountryRow>("SELECT * FROM countries WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.countryId, input.guildId])).rows[0];
      if (!country) throw new GameError("Ülke bulunamadı.");
      const settlements = Number((await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM settlements WHERE country_id=$1", [country.id])).rows[0]?.count ?? 0);
      const battles = await client.query<{ id: string }>("SELECT DISTINCT battle_id AS id FROM battle_sides WHERE country_id=$1", [country.id]);
      if (battles.rows.length) await client.query("DELETE FROM battles WHERE id=ANY($1::uuid[])", [battles.rows.map((row) => row.id)]);
      await client.query("DELETE FROM countries WHERE id=$1", [country.id]);
      await audit(client, input.guildId, input.actorId, "COUNTRY_DELETE", "country", country.id, { name: country.name, settlements, battles: battles.rows.length });
      return { name: country.name, settlements, battles: battles.rows.length, discordRoleId: country.discord_role_id };
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

  async transferSettlement(input: { guildId: string; actorId: string; sourceCountryId: string; targetCountryId: string; settlementId: string }): Promise<{ settlementName: string; sourceName: string; targetName: string; cancelledRecruitmentOrders: number; endedTrades: number }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      if (input.sourceCountryId === input.targetCountryId) throw new GameError("Kaynak ve hedef ülke aynı olamaz.");
      for (const countryId of [input.sourceCountryId, input.targetCountryId].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${countryId}`]);
      for (const countryId of [input.sourceCountryId, input.targetCountryId].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`trade:${countryId}`]);
      const countries = (await client.query<CountryRow>("SELECT * FROM countries WHERE guild_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [input.guildId, [input.sourceCountryId, input.targetCountryId]])).rows;
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
      const cancelledSiege = await client.query("UPDATE siege_orders SET status='CANCELLED' WHERE settlement_id=$1 AND status='BUILDING' RETURNING id", [settlement.id]);
      await client.query("DELETE FROM settlement_policies WHERE settlement_id=$1", [settlement.id]);
      await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE assigned_settlement_id=$1", [settlement.id]);
      await client.query("UPDATE academy_training_sessions SET status='CANCELLED' WHERE settlement_id=$1 AND status IN ('PENDING_ROLL','AWAITING_NAME')", [settlement.id]);
      await client.query("UPDATE settlements SET country_id=$1,is_conquered=TRUE,conquered_turn=$2 WHERE id=$3", [target.id, guild.current_turn, settlement.id]);
      await client.query("UPDATE siege_assets SET country_id=$1 WHERE settlement_id=$2", [target.id, settlement.id]);
      await syncCountryTreasury(client, source.id);
      await syncCountryTreasury(client, target.id);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_TRANSFER", "settlement", settlement.id, {
        fromCountryId: source.id, toCountryId: target.id, cancelledRecruitmentOrders: activeOrders.rows.length, cancelledNavalOrders: cancelledNaval.rowCount ?? 0, cancelledSiegeOrders: cancelledSiege.rowCount ?? 0, endedTrades: trades.rowCount ?? 0, conqueredTurn: guild.current_turn
      });
      return { settlementName: settlement.name, sourceName: source.name, targetName: target.name, cancelledRecruitmentOrders: activeOrders.rows.length, endedTrades: trades.rowCount ?? 0 };
    });
  },
  async document(countryId: string): Promise<CountryDocument> {
    const client = await pool.connect();
    try {
      const country = await getCountry(client, countryId);
      const guild = await getGuild(client, country.guild_id);
      const playerIds = (await client.query<{ discord_user_id: string }>("SELECT discord_user_id FROM country_members WHERE country_id=$1 ORDER BY discord_user_id", [countryId])).rows.map((row) => row.discord_user_id);
      const settlements = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE country_id = $1 ORDER BY name", [countryId])).rows;
      const displayedCountry = { ...country, treasury: settlements.length ? settlements.reduce((sum, settlement) => sum + Number(settlement.local_treasury), 0) : country.treasury };
      const settlementIds = settlements.map((settlement) => settlement.id);
      const buildings = settlementIds.length ? (await client.query<BuildingRow>("SELECT * FROM buildings WHERE settlement_id = ANY($1::uuid[]) ORDER BY building_type", [settlementIds])).rows : [];
      const policies = settlementIds.length ? (await client.query<SettlementPolicyRow>("SELECT * FROM settlement_policies WHERE settlement_id=ANY($1::uuid[]) ORDER BY slot", [settlementIds])).rows : [];
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
        const assignedMerchant = characters.some((character) => character.assigned_settlement_id === settlement.id && character.assignment === "AGORA" && character.role === "MERCHANT");
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
          assignedMerchant
        });
        const incomeBreakdown = scaleIncome(economy.payable, MOBILIZATION_RULES[country.mobilization].incomeMultiplier);
        const populationGain = calculatePopulationGain({
          basePopulationGrowth: settlement.base_population_growth,
          buildings: activeBuildings,
          ruinStage: settlement.ruin_stage,
          mobilization: country.mobilization,
          resources: effectiveResources
        });
        const settlementUnits = units.filter((unit) => unit.settlement_id === settlement.id);
        const settlementShips = ships.filter((ship) => ship.settlement_id === settlement.id);
        const unitUpkeep = settlementUnits.reduce((sum, unit) => sum + calculateUnitUpkeep(unit.unit_type, unit.quantity, unit.status, country.mobilization, effectiveResources, country.manpower_penalty_active), 0);
        const shipUpkeep = settlementShips.reduce((sum, ship) => sum + calculateShipUpkeep(ship.ship_type, ship.quantity, ship.status, country.mobilization, country.manpower_penalty_active), 0);
        const totalSettlementUpkeep = economy.buildingUpkeep + unitUpkeep + shipUpkeep;
        const settlementMilitaryUsed = settlementUnits.reduce((sum, unit) => sum + unit.quantity, 0)
          + settlementShips.reduce((sum, ship) => sum + SHIPS[ship.ship_type].manpower * ship.quantity, 0)
          + waves.filter((wave) => wave.settlement_id === settlement.id).reduce((sum, wave) => sum + wave.quantity, 0)
          + pendingShips.filter((ship) => ship.settlement_id === settlement.id).reduce((sum, ship) => sum + SHIPS[ship.ship_type].manpower * ship.quantity, 0);
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
          totalSettlementUpkeep,
          populationGain,
          militaryUsed: settlementMilitaryUsed,
          militaryLimit: settlement.is_conquered ? 0 : settlementMobilizationLimit(settlement.population, country.mobilization),
          trainingCapacity,
          trainingUsed,
          trainingRemaining: Math.max(0, trainingCapacity - trainingUsed),
          slotLimit: buildingSlotLimit(settlement.population),
          constructionLimit: activePolicies.includes("MASTER_ARCHITECTURE") ? 3 : 2,
          unrestRisk: settlementUnrestChance(activeBuildings, effectiveResources, activePolicies),
          starvationBonus: settlementStarvationBonus(activeBuildings, activePolicies),
          temporaryMilitia: activePolicies.includes("WAR_PREPARATION") ? 500 : 0,
          assignedMerchant,
          policies: settlementPolicies,
          effectiveResources,
          buildings: settlementBuildings,
          units: settlementUnits,
          ships: settlementShips,
          siegeAssets: assets.filter((asset) => asset.settlement_id === settlement.id),
          pendingRecruitment: waves.filter((wave) => wave.settlement_id === settlement.id),
          pendingShips: pendingShips.filter((ship) => ship.settlement_id === settlement.id),
          pendingSiege: pendingSiege.filter((order) => order.settlement_id === settlement.id)
        };
      });
      const totalPayableIncome = incomeTotal(totalPayableBreakdown);
      return {
        guild,
        country: displayedCountry,
        playerIds,
        characters,
        allies,
        pacts,
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
      const terms = buildingPurchaseTerms(input.buildingType, targetLevel, effectiveResources, activePolicies);
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
    if (input.quantity < 1_000 || input.quantity % 1_000 !== 0) throw new GameError("Asker alımı en az 1.000 kişi ve 1.000'in katları hâlinde yapılmalıdır.");
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
      const combinedMultiplier = Math.max(0.50, unitCostMultiplier(input.unitType, effectiveResources) - policyRecruitmentDiscount(activePolicies));
      const cost = Math.ceil((input.quantity / 1_000) * unit.price * combinedMultiplier);
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

      const personLoad = 200;
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
      const workshop = (await client.query<{ level: number }>("SELECT level FROM buildings WHERE settlement_id=$1 AND building_type='engineering' AND status='ACTIVE'", [settlement.id])).rows[0]?.level ?? 0;
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
      const cost = Math.ceil(asset.price * input.quantity * siegeCostMultiplier(input.assetType, resources));
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
      const pointCapacity = shipyardLevel === 1 ? 5 : shipyardLevel === 2 ? 10 : 15;
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
      const cost = Math.ceil(ship.price * input.quantity * shipCostMultiplier(effectiveResources));
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
      const eventKey = `TURN_ADVANCE:${newTurn}`;
      const claimed = await client.query("INSERT INTO processed_events(guild_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_key", [guildId, eventKey]);
      if (!claimed.rowCount) throw new GameError("Bu tur daha önce işlenmiş.");

      const activatedPolicies = await client.query<{ id: string; settlement_id: string; settlement_name: string; policy_key: CityPolicyKey; country_id: string }>(
        `UPDATE settlement_policies sp SET status='ACTIVE'
          FROM settlements s JOIN countries c ON c.id=s.country_id
         WHERE sp.settlement_id=s.id AND c.guild_id=$1 AND sp.status='PENDING' AND sp.activation_turn<=$2
         RETURNING sp.id,sp.settlement_id,s.name AS settlement_name,sp.policy_key,s.country_id`, [guildId, newTurn]
      );
      for (const policy of activatedPolicies.rows.filter((item) => item.policy_key === "CONSCRIPTION")) {
        const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 FOR UPDATE", [policy.settlement_id])).rows[0];
        const battle = (await client.query<{ id: string }>("SELECT b.id FROM battles b JOIN battle_sides bs ON bs.battle_id=b.id WHERE bs.country_id=$1 AND b.status NOT IN ('FINISHED','CANCELLED') ORDER BY b.created_at DESC LIMIT 1", [policy.country_id])).rows[0];
        if (!settlement || !battle || settlement.population < 5_000) {
          await client.query("DELETE FROM settlement_policies WHERE id=$1", [policy.id]);
          continue;
        }
        const once = await client.query("INSERT INTO settlement_conscriptions(settlement_id,battle_id,created_turn) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING battle_id", [settlement.id, battle.id, newTurn]);
        if (!once.rowCount) continue;
        await client.query("UPDATE settlements SET population=population-5000 WHERE id=$1", [settlement.id]);
        await client.query(`INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
          VALUES($1,'militia',5000,'GARRISON','ARMY')
          ON CONFLICT(settlement_id,unit_type,status,force_type) DO UPDATE SET quantity=unit_stacks.quantity+5000`, [settlement.id]);
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
      let garrisonUpgrades = 0;
      const garrisonUpgradeDetails: string[] = [];
      const activatedPolicyDetails = activatedPolicies.rows.map((item) => ({ settlementName: item.settlement_name, policyName: CITY_POLICIES[item.policy_key].label }));
      const starvationDetails = starvationUpdates.rows.map((item) => ({ settlementName: item.settlement_name, remaining: item.starvation_remaining, capacity: item.starvation_capacity }));
      const unrestDetails: Array<{ settlementName: string; chance: number; roll: number }> = [];
      const pantheonLoanDetails: Array<{ settlementName: string; amount: number; remaining: number }> = [];
      const acquisition = isAcquisitionTurn(newTurn, guild.acquisition_interval);
      const manpowerCountries = (await client.query<CountryRow>("SELECT * FROM countries WHERE guild_id=$1 FOR UPDATE", [guildId])).rows;
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
        const countries = (await client.query<CountryRow>("SELECT * FROM countries WHERE guild_id=$1 FOR UPDATE", [guildId])).rows;
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
            const assignedMerchant = Boolean((await client.query("SELECT 1 FROM country_characters WHERE assigned_settlement_id=$1 AND assignment='AGORA' AND role='MERCHANT' LIMIT 1", [settlement.id])).rowCount);
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
              assignedMerchant
            });
            const popGain = calculatePopulationGain({ basePopulationGrowth: settlement.base_population_growth, buildings: active, ruinStage: settlement.ruin_stage, mobilization: country.mobilization, resources: effectiveResources });
            const adjustedSettlementIncome = scaleIncome(economy.payable, MOBILIZATION_RULES[country.mobilization].incomeMultiplier);
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
            // Yerleşke olayları yalnızca yöneticinin ağırlıklı olay seçiminden sonra uygulanır.
            if (await ensureStandardGarrison(client, settlement.id, nextPopulation, settlement.garrison_level)) {
              garrisonUpgrades += 1;
              garrisonUpgradeDetails.push(settlement.name);
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

      await client.query("UPDATE guilds SET current_turn=$1,turn_phase='OPEN',updated_at=NOW() WHERE discord_id=$2", [newTurn, guildId]);
      await audit(client, guildId, actorId, "TURN_ADVANCE", "guild", guildId, { from: guild.current_turn, to: newTurn, acquisition, garrisonUpgrades });
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
        pantheonLoanDetails
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

  async leaderboard(guildId: string, period: "daily" | "weekly"): Promise<Array<{ discord_user_id: string; words: number; messages: number }>> {
    const interval = period === "daily" ? "1 day" : "7 days";
    const result = await pool.query<{ discord_user_id: string; words: number; messages: number }>(
      `SELECT discord_user_id,SUM(word_count)::integer AS words,COUNT(*)::integer AS messages
         FROM role_messages WHERE guild_id=$1 AND created_at >= NOW() - $2::interval
        GROUP BY discord_user_id ORDER BY words DESC LIMIT 15`, [guildId, interval]
    );
    return result.rows;
  }
};
