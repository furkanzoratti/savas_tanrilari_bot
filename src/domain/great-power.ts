import { BUILDINGS, SHIPS, UNITS } from "./catalog.js";
import type { BuildingCategory } from "./types.js";

export const GREAT_POWER_REPORT_HOUR = 17;
export const GREAT_POWER_LIMIT = 10;

export const UNIT_POWER: Record<keyof typeof UNITS, number> = {
  militia: 0.40,
  light_infantry: 1.00,
  observer: 1.00,
  slinger: 1.30,
  spear: 1.60,
  archer: 2.00,
  light_cavalry: 2.40,
  heavy_infantry: 2.60,
  heavy_cavalry: 3.30,
  hoplite: 2.50,
  briton_longbow: 2.60,
  camel_cavalry: 2.80,
  legionary: 3.00,
  horse_archer: 3.20,
  persian_immortal: 3.10,
  carthaginian_war_elephant: 4.40,
  iberian_caetrati: 2.10,
  germanic_shock_warrior: 2.80
};

export const SHIP_POWER: Record<keyof typeof SHIPS, number> = {
  kerkouros: 400,
  trireme: 900,
  quinquereme: 2_000
};

export const BUILDING_POWER: Record<BuildingCategory, Record<number, number>> = {
  PUBLIC_INFRASTRUCTURE: { 1: 250, 2: 750, 3: 1_500 },
  FLAT_ECONOMY: { 1: 500, 2: 1_500, 3: 3_000 },
  PERCENT_ECONOMY: { 1: 750, 2: 2_250, 3: 4_500 },
  MILITARY_NAVAL: { 1: 500, 2: 1_500, 3: 3_250 }
};

const ASSIMILATED_SETTLEMENT_POWER = 5_000;
const TRAINING_MULTIPLIER = 0.50;
const MERCENARY_MULTIPLIER = 0.60;
const TEMPORARY_MILITIA_MULTIPLIER = 0.25;
const STANDARD_GARRISON_AVERAGE_POWER = 1.44;

interface PowerUnit { unit_type: string; quantity: number }
interface PowerShip { ship_type: string; quantity: number }
interface PowerBuilding { building_type: string; level: number; status: string }
interface PowerMercenary {
  status: string;
  units: PowerUnit[];
  ships: PowerShip[];
}

export interface GreatPowerSettlementInput {
  is_conquered: boolean;
  temporaryMilitia: number;
  buildings: PowerBuilding[];
  units: PowerUnit[];
  ships: PowerShip[];
  pendingRecruitment: PowerUnit[];
  pendingGarrison: Array<{ personnel_reserved: number }>;
  mercenaries: PowerMercenary[];
}

export interface GreatPowerInput {
  payableIncome: number;
  settlements: GreatPowerSettlementInput[];
}

export interface GreatPowerBreakdown {
  land: number;
  economy: number;
  settlements: number;
  navy: number;
  buildings: number;
  total: number;
}

function unitPower(unitType: string, quantity: number): number {
  const weight = UNIT_POWER[unitType as keyof typeof UNITS] ?? 0;
  return Math.max(0, Number(quantity)) * weight;
}

function shipPower(shipType: string, quantity: number): number {
  const weight = SHIP_POWER[shipType as keyof typeof SHIPS] ?? 0;
  return Math.max(0, Number(quantity)) * weight;
}

export function calculateGreatPower(input: GreatPowerInput): GreatPowerBreakdown {
  let land = 0;
  let navy = 0;
  let buildingScore = 0;
  let assimilatedSettlements = 0;

  for (const settlement of input.settlements) {
    if (!settlement.is_conquered) assimilatedSettlements += 1;

    land += settlement.units.reduce((sum, unit) => sum + unitPower(unit.unit_type, unit.quantity), 0);
    land += settlement.pendingRecruitment.reduce((sum, unit) => sum + unitPower(unit.unit_type, unit.quantity) * TRAINING_MULTIPLIER, 0);
    land += settlement.pendingGarrison.reduce((sum, order) => sum + Math.max(0, Number(order.personnel_reserved)) * STANDARD_GARRISON_AVERAGE_POWER * TRAINING_MULTIPLIER, 0);
    land += Math.max(0, Number(settlement.temporaryMilitia)) * UNIT_POWER.militia * TEMPORARY_MILITIA_MULTIPLIER;

    navy += settlement.ships.reduce((sum, ship) => sum + shipPower(ship.ship_type, ship.quantity), 0);

    for (const mercenary of settlement.mercenaries) {
      if (mercenary.status !== "ACTIVE") continue;
      land += mercenary.units.reduce((sum, unit) => sum + unitPower(unit.unit_type, unit.quantity) * MERCENARY_MULTIPLIER, 0);
      navy += mercenary.ships.reduce((sum, ship) => sum + shipPower(ship.ship_type, ship.quantity) * MERCENARY_MULTIPLIER, 0);
    }

    for (const building of settlement.buildings) {
      if (building.status !== "ACTIVE" || building.level <= 0) continue;
      const definition = BUILDINGS[building.building_type];
      if (!definition) continue;
      buildingScore += BUILDING_POWER[definition.category][building.level] ?? 0;
    }
  }

  const rounded: GreatPowerBreakdown = {
    land: Math.round(land),
    economy: Math.round(Math.max(0, Number(input.payableIncome))),
    settlements: assimilatedSettlements * ASSIMILATED_SETTLEMENT_POWER,
    navy: Math.round(navy),
    buildings: Math.round(buildingScore),
    total: 0
  };
  rounded.total = rounded.land + rounded.economy + rounded.settlements + rounded.navy + rounded.buildings;
  return rounded;
}

function localClock(now: Date, timezone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  return { date: `${read("year")}-${read("month")}-${read("day")}`, hour: Number(read("hour")) };
}

export function currentGreatPowerReportDate(now: Date, timezone: string): string | null {
  const clock = localClock(now, timezone);
  return clock.hour >= GREAT_POWER_REPORT_HOUR ? clock.date : null;
}

export function currentLocalDate(now: Date, timezone: string): string {
  return localClock(now, timezone).date;
}
