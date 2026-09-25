export const SPECIAL_UNITS = {
  legionary: { name: "Lejyoner", price: 5_000, upkeep: 500 },
  hoplite: { name: "Hoplit", price: 3_500, upkeep: 400 },
  horse_archer: { name: "Atlı Okçu", price: 4_500, upkeep: 450 },
  camel_cavalry: { name: "Deve Süvarisi", price: 4_000, upkeep: 350 },
  briton_longbow: { name: "Briton Uzun Yaycıları", price: 3_500, upkeep: 400 },
  persian_immortal: { name: "Pers Ölümsüzleri", price: 5_000, upkeep: 500 },
  carthaginian_war_elephant: { name: "Kartaca Savaş Filleri", price: 6_500, upkeep: 650 },
  iberian_caetrati: { name: "İber Caetratileri", price: 3_000, upkeep: 300 },
  germanic_shock_warrior: { name: "Cermen Şok Savaşçıları", price: 3_500, upkeep: 350 },
  anatolian_thureophoroi: { name: "Anadolu Kalkanlıları (Thureophoroi)", price: 3_000, upkeep: 300 },
  triarii_veteran: { name: "Triarii Gazileri", price: 3_000, upkeep: 300 },
  punic_veteran: { name: "Pön Gazileri", price: 4_750, upkeep: 475 },
  gaesatae: { name: "Gaesatae", price: 4_750, upkeep: 475 },
  peltast: { name: "Peltastlar", price: 1_750, upkeep: 175 },
  silver_shield: { name: "Gümüş Kalkanlılar", price: 3_500, upkeep: 400 },
  machimoi_phalangitai: { name: "Machimoi Phalangitai", price: 3_500, upkeep: 400 },
  mauryan_war_elephant: { name: "Maurya Savaş Filleri", price: 8_000, upkeep: 800 },
  desert_raider: { name: "Çöl Akıncıları", price: 4_250, upkeep: 425 },
  egyptian_war_chariot: { name: "Chariot", price: 5_000, upkeep: 500 }
} as const;

export type SpecialUnitType = keyof typeof SPECIAL_UNITS;
export const SPECIAL_UNIT_TYPES = Object.keys(SPECIAL_UNITS) as SpecialUnitType[];
export function isSpecialUnitType(value: string): value is SpecialUnitType {
  return Object.prototype.hasOwnProperty.call(SPECIAL_UNITS, value);
}
