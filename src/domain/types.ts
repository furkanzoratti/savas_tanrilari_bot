export type Mobilization = "PEACE" | "PARTIAL" | "GENERAL";
export type UnitStatus = "GARRISON" | "FIELD_FRIENDLY" | "FIELD_HOSTILE";
export type ForceType = "GARRISON" | "ARMY";
export type ShipStatus = "RESERVE" | "ACTIVE" | "HOSTILE";
export type RuinStage = 0 | 1 | 2;
export type BuildingCategory = "PUBLIC_INFRASTRUCTURE" | "FLAT_ECONOMY" | "PERCENT_ECONOMY" | "MILITARY_NAVAL";
export type CharacterRole = "SPY" | "MERCHANT" | "COMMANDER" | "DIPLOMAT";

export interface BuildingEffect {
  flatIncome?: number;
  incomePercent?: number;
  seaIncomePercent?: number;
  upkeep?: number;
  populationFlat?: number;
  populationPercent?: number;
}

export interface BuildingDefinition {
  key: string;
  name: string;
  category: BuildingCategory;
  maxLevel: 1 | 3;
  levels: Record<number, BuildingEffect>;
}
