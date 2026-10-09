import { UNIT_POWER } from "./great-power.js";

export type RebelFactionType = "POPULAR" | "SEPARATIST" | "RELIGIOUS" | "SLAVE";

export type RebelSiegeAssetType = "ladder_group" | "ram" | "mantlet" | "ballista" | "catapult" | "siege_tower";
export type RebelSiegeTrain = Partial<Record<RebelSiegeAssetType, number>>;

export const REBEL_FACTION_LABELS: Record<RebelFactionType, string> = {
  POPULAR: "Halk Ayaklanması",
  SEPARATIST: "Bağımsızlık Yanlıları",
  RELIGIOUS: "Dinî İsyancılar",
  SLAVE: "Köle İsyanı"
};

export interface StabilityFactor { label: string; adjustment: number }

export interface RebellionPressureInput {
  prosperity: number;
  unrestActive: boolean;
  conquered: boolean;
  foreignCulture: boolean;
  activeMissionary: boolean;
  strictTaxation: boolean;
  epidemicActive: boolean;
  famineActive: boolean;
  besieged: boolean;
  ruinStage: number;
  slaveCampLevel: number;
  slaveRatio: number;
  recentRaid: boolean;
  warExhaustion: number;
  curiaLevel: number;
  innsBathsLevel: number;
  hasPantheon: boolean;
  hasAmber?: boolean;
  stabilityRiskReduction?: number;
  stabilityRiskReductionLabel?: string;
}

export interface RebellionPressureAssessment {
  factors: StabilityFactor[];
  risk: number;
  eligible: boolean;
  scores: Record<RebelFactionType, number>;
  recommendedFaction: RebelFactionType;
}

export function prosperityTier(prosperity: number): { label: string; incomeMultiplier: number; populationMultiplier: number; unrestAdjustment: number } {
  const value = Math.max(0, Math.min(100, Math.floor(prosperity)));
  if (value === 100) return { label: "Altın Çağ", incomeMultiplier: 1.10, populationMultiplier: 1.10, unrestAdjustment: -10 };
  if (value >= 75) return { label: "Müreffeh", incomeMultiplier: 1.05, populationMultiplier: 1.05, unrestAdjustment: -5 };
  if (value >= 50) return { label: "İstikrarlı", incomeMultiplier: 1, populationMultiplier: 1, unrestAdjustment: 0 };
  if (value >= 25) return { label: "Kırılgan", incomeMultiplier: 0.90, populationMultiplier: 0.90, unrestAdjustment: 5 };
  return { label: "Çöküntü", incomeMultiplier: 0.80, populationMultiplier: 0.80, unrestAdjustment: 10 };
}

export function rebellionRisk(factors: readonly StabilityFactor[]): number {
  return Math.max(0, Math.min(75, factors.reduce((sum, factor) => sum + factor.adjustment, 0)));
}

export function assessRebellionPressure(input: RebellionPressureInput): RebellionPressureAssessment {
  const factors: StabilityFactor[] = [{ label: "Temel gerilim", adjustment: 5 }];
  const add = (label: string, adjustment: number): void => { if (adjustment) factors.push({ label, adjustment }); };
  add("Aktif huzursuzluk", input.unrestActive ? 15 : 0);
  add("Fethedilmiş yerleşke", input.conquered ? 15 : 0);
  add("Yabancı kültür", input.foreignCulture ? 10 : 0);
  add("Misyoner faaliyeti", input.activeMissionary ? 15 : 0);
  add("Vergi sıkılaştırması", input.strictTaxation ? 10 : 0);
  add("Salgın", input.epidemicActive ? 10 : 0);
  add("Kıtlık", input.famineActive ? 15 : 0);
  add("Kuşatma", input.besieged ? 10 : 0);
  add("Haraplık", input.ruinStage === 2 ? 10 : input.ruinStage === 1 ? 5 : 0);
  add("Köle kampı", Math.max(0, input.slaveCampLevel) * 6);
  add("Köle nüfusu", input.slaveRatio >= 0.25 ? 15 : input.slaveRatio >= 0.15 ? 8 : 0);
  add("Yakın yağma", input.recentRaid ? 10 : 0);
  add("Savaş yorgunluğu", Math.min(15, Math.floor(Math.max(0, input.warExhaustion) / 10)));
  add(`Refah: ${prosperityTier(input.prosperity).label}`, prosperityTier(input.prosperity).unrestAdjustment);
  add("Curia", -Math.max(0, input.curiaLevel) * 2);
  add("Hanlar ve Hamamlar", -(input.innsBathsLevel >= 3 ? 10 : input.innsBathsLevel === 2 ? 6 : input.innsBathsLevel === 1 ? 3 : 0));
  add("Panteon", input.hasPantheon ? -10 : 0);
  add("Kehribar", input.hasAmber ? -10 : 0);
  add(input.stabilityRiskReductionLabel?.trim()||"Ülke etkisi",-Math.max(0,Math.floor(input.stabilityRiskReduction??0)));

  const scores: Record<RebelFactionType, number> = {
    POPULAR: 5 + (input.unrestActive ? 15 : 0) + (input.strictTaxation ? 10 : 0),
    SEPARATIST: (input.conquered ? 25 : 0) + (input.foreignCulture ? 20 : 0),
    RELIGIOUS: input.activeMissionary ? 35 : 0,
    SLAVE: Math.round(Math.max(0, input.slaveRatio) * 100) + Math.max(0, input.slaveCampLevel) * 8
  };
  const eligible = input.unrestActive || input.conquered || input.foreignCulture || input.activeMissionary || input.besieged ||
    input.epidemicActive || input.famineActive || input.slaveRatio >= 0.15 || input.recentRaid || input.warExhaustion >= 20;
  return { factors, risk: rebellionRisk(factors), eligible, scores, recommendedFaction: chooseRebelFaction(scores) };
}

export function projectRebellionTurn(input: {
  before: number;
  active: boolean;
  immune: boolean;
  pressure: Pick<RebellionPressureAssessment, "eligible" | "risk">;
}): { onSuccess: number; onFailure: number; expected: number; successChance: number } {
  if (input.active) return { onSuccess: 100, onFailure: 100, expected: 100, successChance: 0 };
  const successChance = input.immune || !input.pressure.eligible ? 0 : input.pressure.risk;
  const onSuccess = nextRebellionProgress({
    before: input.before, eligible: input.pressure.eligible, risk: input.pressure.risk,
    roll: successChance > 0 ? 1 : null, immune: input.immune
  });
  const onFailure = nextRebellionProgress({
    before: input.before, eligible: input.pressure.eligible, risk: input.pressure.risk,
    roll: successChance > 0 ? 100 : null, immune: input.immune
  });
  const expected = Math.round(onSuccess * successChance / 100 + onFailure * (100 - successChance) / 100);
  return { onSuccess, onFailure, expected, successChance };
}

export function nextRebellionProgress(input: { before: number; eligible: boolean; risk: number; roll: number | null; immune: boolean }): number {
  if (input.immune) return Math.max(0, input.before - 20);
  if (!input.eligible) return Math.max(0, input.before - 20);
  const successful=input.roll!==null&&input.roll<=input.risk;
  if(input.risk>=25)return Math.min(100,input.before+(successful?30:10));
  if(successful)return Math.min(100,input.before+20);
  if(input.risk<15)return Math.max(0,input.before-10);
  return input.before;
}

export function rebelFactionName(input:{
  type:RebelFactionType;settlementName:string;restorationCountryName?:string|null;religionLabel?:string|null;
}):string{
  if(input.type==="SEPARATIST")return input.restorationCountryName
    ?`${input.restorationCountryName} Gönüllüleri`
    :`${input.settlementName} Özgürlük Birliği`;
  if(input.type==="RELIGIOUS")return input.religionLabel
    ?`${input.religionLabel} Muhafızları`
    :`${input.settlementName} İnanç Muhafızları`;
  if(input.type==="SLAVE")return `${input.settlementName} Zincirkıranları`;
  return `${input.settlementName} Halk Birliği`;
}

export function chooseRebelFaction(scores: Record<RebelFactionType, number>): RebelFactionType {
  const priority: RebelFactionType[] = ["SEPARATIST", "RELIGIOUS", "SLAVE", "POPULAR"];
  return priority.reduce((best, key) => scores[key] > scores[best] ? key : best, "POPULAR" as RebelFactionType);
}

const REBEL_COMPOSITION: Record<RebelFactionType, Readonly<Record<string, number>>> = {
  // İsyancılar geçici milis değil; kaçak askerler, yerel seçkinler ve tecrübeli savaşçılar içerir.
  POPULAR: { light_infantry: 25, spear: 25, archer: 15, heavy_infantry: 20, light_cavalry: 10, heavy_cavalry: 5 },
  SEPARATIST: { light_infantry: 15, spear: 20, archer: 15, heavy_infantry: 25, light_cavalry: 15, heavy_cavalry: 10 },
  RELIGIOUS: { light_infantry: 20, spear: 25, archer: 20, heavy_infantry: 20, light_cavalry: 10, heavy_cavalry: 5 },
  SLAVE: { light_infantry: 30, spear: 30, slinger: 15, archer: 10, heavy_infantry: 10, light_cavalry: 5 }
};

export function rebelPersonnel(input: { type: RebelFactionType; population: number; slavePopulation: number; warExhaustion: number }): number {
  const freePopulation = Math.max(0, input.population);
  const slavePopulation = Math.max(0, input.slavePopulation);
  const ratios: Record<RebelFactionType, readonly [number, number]> = {
    POPULAR: [0.06, 0.02], SEPARATIST: [0.08, 0.03], RELIGIOUS: [0.07, 0.02], SLAVE: [0.02, 0.20]
  };
  const [freeRatio, slaveRatio] = ratios[input.type];
  const raw = (freePopulation * freeRatio + slavePopulation * slaveRatio) * (1 + Math.max(0, input.warExhaustion) / 500);
  const cap = Math.max(1_000, Math.min(30_000, Math.floor((freePopulation + slavePopulation) * 0.20)));
  return Math.max(1_000, Math.min(cap, Math.round(raw / 100) * 100));
}

export function rebelComposition(type: RebelFactionType, personnel: number): Record<string, number> {
  const total = Math.max(0, Math.floor(personnel));
  const weights = REBEL_COMPOSITION[type];
  const result: Record<string, number> = {};
  let allocated = 0;
  for (const [unit, percent] of Object.entries(weights)) {
    const quantity = Math.floor(total * percent / 100);
    result[unit] = quantity;
    allocated += quantity;
  }
  const primary = Object.keys(weights)[0]!;
  result[primary] = (result[primary] ?? 0) + total - allocated;
  return result;
}

export function rebelSiegeTrain(input: {
  type: RebelFactionType;
  personnel: number;
  composition: Readonly<Record<string, number>>;
  engineeringLevel: number;
}): RebelSiegeTrain {
  const personnel = Math.max(0, Math.floor(input.personnel));
  const engineering = Math.max(0, Math.min(3, Math.floor(input.engineeringLevel)));
  const result: RebelSiegeTrain = {};
  const ladders = Math.min(8, Math.ceil(personnel / 2_000));
  const mantlets = Math.min(5, Math.floor(personnel / 4_000));
  const ballistae = (engineering >= 1 ? 1 : 0) + (input.type === "SEPARATIST" ? 1 : 0);
  if (ladders > 0) result.ladder_group = ladders;
  if (personnel >= 4_000) result.ram = 1;
  if (mantlets > 0) result.mantlet = mantlets;
  if (ballistae > 0) result.ballista = ballistae;
  if (engineering >= 2) result.catapult = 1;
  if (engineering >= 3) result.siege_tower = 1;
  return result;
}

export function rebelMilitaryPower(composition: Readonly<Record<string, number>>): number {
  return Math.round(Object.entries(composition).reduce((sum, [unit, quantity]) =>
    sum + Math.max(0, quantity) * (UNIT_POWER[unit as keyof typeof UNIT_POWER] ?? 1), 0));
}
