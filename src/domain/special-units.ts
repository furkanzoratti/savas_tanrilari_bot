export const SPECIAL_UNITS = {
  legionary: { name: "Lejyoner", price: 5_000, upkeep: 500 },
  hoplite: { name: "Hoplit", price: 3_500, upkeep: 400 },
  horse_archer: { name: "Atlı Okçu", price: 4_500, upkeep: 450 },
  camel_cavalry: { name: "Deve Süvarisi", price: 4_000, upkeep: 350 },
  briton_longbow: { name: "Briton Uzun Yaycıları", price: 3_500, upkeep: 400 },
  persian_immortal: { name: "Pers Ölümsüzleri", price: 5_000, upkeep: 500 },
  carthaginian_war_elephant: { name: "Kartaca Savaş Filleri", price: 6_500, upkeep: 650 },
  iberian_caetrati: { name: "İber Caetratileri", price: 3_000, upkeep: 300 },
  germanic_shock_warrior: { name: "Cermen Şok Savaşçıları", price: 3_500, upkeep: 350 }
} as const;

export type SpecialUnitType = keyof typeof SPECIAL_UNITS;
export const SPECIAL_UNIT_TYPES = Object.keys(SPECIAL_UNITS) as SpecialUnitType[];
export function isSpecialUnitType(value: string): value is SpecialUnitType {
  return Object.prototype.hasOwnProperty.call(SPECIAL_UNITS, value);
}
