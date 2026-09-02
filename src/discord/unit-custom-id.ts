import { UNITS } from "../domain/catalog.js";

const UNIT_TYPE_ALIASES = {
  legionary: "lg",
  hoplite: "hp",
  horse_archer: "ha",
  camel_cavalry: "cc",
  briton_longbow: "bl",
  persian_immortal: "pi",
  carthaginian_war_elephant: "cwe",
  iberian_caetrati: "ic",
  germanic_shock_warrior: "gsw"
} as const;

const UNIT_TYPE_BY_ALIAS = Object.fromEntries(
  Object.entries(UNIT_TYPE_ALIASES).map(([unitType, alias]) => [alias, unitType])
) as Record<string, keyof typeof UNITS>;

export function encodeUnitTypeForCustomId(unitType: keyof typeof UNITS): string {
  return UNIT_TYPE_ALIASES[unitType as keyof typeof UNIT_TYPE_ALIASES] ?? unitType;
}

export function decodeUnitTypeFromCustomId(value: string): keyof typeof UNITS | null {
  const unitType = UNIT_TYPE_BY_ALIAS[value] ?? value;
  return Object.prototype.hasOwnProperty.call(UNITS, unitType) ? unitType as keyof typeof UNITS : null;
}
