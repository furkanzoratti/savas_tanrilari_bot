export const STEPPE_ARMY_UNIT_TYPES = [
  "horse_archer",
  "steppe_cavalry",
  "kurgan_shieldbearer",
  "oba_archer"
] as const;

export type SteppeArmyUnitType = typeof STEPPE_ARMY_UNIT_TYPES[number];

const steppeArmyUnits = new Set<string>(STEPPE_ARMY_UNIT_TYPES);

export function isSteppeArmyUnitType(value: string): value is SteppeArmyUnitType {
  return steppeArmyUnits.has(value);
}
