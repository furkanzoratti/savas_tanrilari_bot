export type Mobilization = "PEACE" | "PARTIAL" | "GENERAL";
export type UnitStatus = "GARRISON" | "FIELD_FRIENDLY" | "FIELD_HOSTILE";
export type ShipStatus = "RESERVE" | "ACTIVE" | "HOSTILE";
export type RuinStage = 0 | 1 | 2;

export interface BuildingEffect {
  flatIncome?: number;
  incomePercent?: number;
  upkeep?: number;
  populationFlat?: number;
  populationPercent?: number;
}

export interface BuildingDefinition {
  key: string;
  name: string;
  maxLevel: 1 | 3;
  levels: Record<number, BuildingEffect>;
}
