export const SPECIAL_UNITS = {
  legionary: { name: "Lejyoner", price: 4_500, upkeep: 500 },
  hoplite: { name: "Hoplit", price: 3_500, upkeep: 400 },
  horse_archer: { name: "Atlı Okçu", price: 4_500, upkeep: 450 },
  camel_cavalry: { name: "Deve Süvarisi", price: 4_000, upkeep: 350 },
  briton_longbow: { name: "Briton Uzun Yaycıları", price: 3_500, upkeep: 400 }
} as const;

export type SpecialUnitType = keyof typeof SPECIAL_UNITS;
export const SPECIAL_UNIT_TYPES = Object.keys(SPECIAL_UNITS) as SpecialUnitType[];
export const MAX_SPECIAL_UNIT_RECRUITMENT_PER_ACQUISITION = 3_000;
export const MAX_SPECIAL_UNIT_ARMY_RATIO = 0.20;

export function isSpecialUnitType(value: string): value is SpecialUnitType {
  return Object.prototype.hasOwnProperty.call(SPECIAL_UNITS, value);
}
