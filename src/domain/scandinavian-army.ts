export const SCANDINAVIAN_ARMY_UNIT_TYPES = [
  "scandinavian_berserker",
  "scandinavian_spearmen",
  "scandinavian_hunters"
] as const;

export type ScandinavianArmyUnitType = typeof SCANDINAVIAN_ARMY_UNIT_TYPES[number];

const scandinavianArmyUnits = new Set<string>(SCANDINAVIAN_ARMY_UNIT_TYPES);

export function isScandinavianArmyUnitType(value: string): value is ScandinavianArmyUnitType {
  return scandinavianArmyUnits.has(value);
}
