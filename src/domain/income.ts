import { BUILDINGS, MAX_SETTLEMENT_PERCENT_BONUS, type CityPolicyKey } from "./catalog.js";
import { ruinIncomeMultiplier, type ActiveBuilding } from "./economy.js";
import type { ResourceType } from "./resources.js";
import { formableModifiers, type FormableCountryKey } from "./formable-countries.js";

export type IncomeCategory = "building" | "tax" | "landTrade" | "seaTrade";

export interface IncomeBreakdown {
  building: number;
  tax: number;
  landTrade: number;
  seaTrade: number;
}

const zeroBreakdown = (): IncomeBreakdown => ({ building: 0, tax: 0, landTrade: 0, seaTrade: 0 });

export function addIncomeBreakdowns(left: IncomeBreakdown, right: IncomeBreakdown): IncomeBreakdown {
  return {
    building: left.building + right.building,
    tax: left.tax + right.tax,
    landTrade: left.landTrade + right.landTrade,
    seaTrade: left.seaTrade + right.seaTrade
  };
}

export function incomeTotal(value: IncomeBreakdown): number {
  return value.building + value.tax + value.landTrade + value.seaTrade;
}

export function scaleIncome(value: IncomeBreakdown, multiplier: number): IncomeBreakdown {
  return {
    building: Math.floor(value.building * multiplier),
    tax: Math.floor(value.tax * multiplier),
    landTrade: Math.floor(value.landTrade * multiplier),
    seaTrade: Math.floor(value.seaTrade * multiplier)
  };
}

export function applyIncomePenalty(value: IncomeBreakdown, penaltyPercent: number): IncomeBreakdown {
  const normalizedPercent = Math.max(0, Math.min(100, penaltyPercent));
  return scaleIncome(value, (100 - normalizedPercent) / 100);
}

export function populationTaxIncome(population: number): number {
  return Math.max(0, Math.floor(population * 0.03));
}

export function calculateCategorizedIncome(input: {
  settlementIncome: number;
  taxIncome: number;
  landTradeIncome: number;
  seaTradeIncome: number;
  agreementLandIncome?: number;
  agreementSeaIncome?: number;
  manualFlatIncome: number;
  manualIncomePercent: number;
  buildings: ActiveBuilding[];
  ruinStage: 0 | 1 | 2;
  resources?: readonly ResourceType[];
  slavePopulation?: number;
  activePolicies?: readonly CityPolicyKey[];
  assignedMerchant?: boolean;
  formableKey?: FormableCountryKey | null;
}): { gross: IncomeBreakdown; payable: IncomeBreakdown; buildingUpkeep: number; buildingBonuses: IncomeBreakdown } {
  const resources = input.resources ?? [];
  const policies = new Set(input.activePolicies ?? []);
  const formable = formableModifiers(input.formableKey);
  const gross: IncomeBreakdown = {
    building: Math.max(0, input.manualFlatIncome),
    tax: Math.max(0, Math.floor(input.taxIncome * (policies.has("STRICT_TAXATION") ? 1.20 : 1))),
    landTrade: Math.max(0, input.settlementIncome + input.landTradeIncome + (input.agreementLandIncome ?? 0)),
    seaTrade: Math.max(0, input.seaTradeIncome + (input.agreementSeaIncome ?? 0))
  };
  let globalIncomePercent = input.manualIncomePercent;
  let seaIncomePercent = 0;
  let buildingUpkeep = 0;
  if (policies.has("MARKET_FAIRS")) gross.building += 250;
  if (policies.has("INFRASTRUCTURE_ROADS")) gross.building += Math.min(600, input.buildings.length * 100);

  for (const building of input.buildings) {
    const effect = BUILDINGS[building.buildingType]?.levels[building.level];
    if (!effect) continue;
    buildingUpkeep += building.buildingType === "academy" && formable.academyUpkeep !== undefined ? formable.academyUpkeep : effect.upkeep ?? 0;
    const silkMultiplier = resources.includes("SILK") && ["agora", "trade_guild"].includes(building.buildingType) ? 1.10 : 1;
    const formableBuildingMultiplier = 1 + (formable.buildingIncomePercent?.[building.buildingType] ?? 0);
    const flatIncome = Math.floor((effect.flatIncome ?? 0) * silkMultiplier * formableBuildingMultiplier);
    if (building.buildingType === "port") gross.seaTrade += flatIncome + (formable.portFlatIncome ?? 0);
    else gross.building += flatIncome + (building.buildingType === "curia" ? formable.curiaFlatIncome ?? 0 : 0);
    let buildingIncomePercent = (effect.incomePercent ?? 0) * silkMultiplier;
    if (building.buildingType === "trade_guild" && policies.has("MARKET_FAIRS")) buildingIncomePercent += 0.02;
    if (["trade_guild", "lupanar"].includes(building.buildingType) && policies.has("MERCHANT_LICENSE")) buildingIncomePercent += 0.05;
    if (resources.includes("WINE") && building.buildingType === "lupanar") buildingIncomePercent += 0.05;
    globalIncomePercent += buildingIncomePercent;
    seaIncomePercent += effect.seaIncomePercent ?? 0;
    if (building.buildingType === "slave_camp") {
      const rates = formable.slaveCampRates ?? [0.15, 0.30, 0.50];
      gross.building += Math.floor(Math.max(0, input.slavePopulation ?? 0) * (rates[building.level - 1] ?? 0));
    }
    if (building.buildingType === "agora" && building.level >= 2 && input.assignedMerchant) globalIncomePercent += formable.academyMerchantAgoraBonus ?? 0.10;
    if (resources.includes("GLASS") && ["healer", "aqueduct"].includes(building.buildingType)) gross.building += 100;
    if (resources.includes("AMBER") && building.buildingType === "pantheon") gross.building += 300;
  }

  if (seaIncomePercent > 0) gross.seaTrade += Math.floor(gross.seaTrade * seaIncomePercent);
  const resourceMultiplier = (resources.includes("GOLD") ? 1.10 : 1) * (resources.includes("SPICES") ? 1.20 : 1);
  const totalPercent = Math.max(0, Math.min(MAX_SETTLEMENT_PERCENT_BONUS, globalIncomePercent + resourceMultiplier - 1 + (formable.incomePercent ?? 0)));
  const incomeBeforePercentages = incomeTotal(gross);
  gross.building += Math.floor(incomeBeforePercentages * totalPercent + 1e-9);

  const buildingBonuses = zeroBreakdown();
  buildingBonuses.building = gross.building;
  const ruinMultiplier = input.ruinStage === 2 && formable.ruinStageTwoIncomeMultiplier !== undefined ? formable.ruinStageTwoIncomeMultiplier : ruinIncomeMultiplier(input.ruinStage);
  const payable = scaleIncome(gross, ruinMultiplier);
  return { gross, payable, buildingUpkeep, buildingBonuses };
}
