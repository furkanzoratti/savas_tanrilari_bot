import { SHIPS } from "./catalog.js";
import type { BattleUnitType, NavalUnitType, SiegeAssetType } from "./battle.js";

export type MercenaryCategory = "CHEAP" | "STANDARD" | "ELITE" | "SIEGE" | "FLEET";
export interface MercenaryCompany {
  name: string;
  category: MercenaryCategory;
  hireCost: number;
  turnUpkeep: number;
  slotCost?: number;
  land?: Partial<Record<BattleUnitType, number>>;
  ships?: Partial<Record<NavalUnitType, number>>;
  siege?: Partial<Record<SiegeAssetType, number>>;
}

const MERCENARY_COMPANY_DEFINITIONS = {
  arkadian_mountain_watch: { name: "Arkadialı Dağ Nöbetçileri", category: "CHEAP", hireCost: 1400, turnUpkeep: 350, land: { light_infantry: 1000, spear: 500 } },
  rhodian_lead_storm: { name: "Rodoslu Kurşun Fırtınası", category: "CHEAP", hireCost: 1800, turnUpkeep: 450, land: { slinger: 1500 } },
  thracian_peltast_hearth: { name: "Trakya Peltast Ocağı", category: "CHEAP", hireCost: 1700, turnUpkeep: 450, land: { light_infantry: 2000 } },
  cretan_bow_brotherhood: { name: "Giritli Yay Kardeşliği", category: "CHEAP", hireCost: 2200, turnUpkeep: 500, land: { archer: 1000, light_infantry: 500 } },
  campanian_spear_company: { name: "Kampania Mızrak Birliği", category: "CHEAP", hireCost: 2400, turnUpkeep: 500, land: { spear: 1500 } },
  celtic_boars: { name: "Kelt Yaban Domuzları", category: "CHEAP", hireCost: 2800, turnUpkeep: 650, land: { light_infantry: 2000, heavy_infantry: 500 } },
  balearic_sling_hearth: { name: "Balear Sapan Ocağı", category: "STANDARD", hireCost: 3400, turnUpkeep: 800, land: { slinger: 2000, light_infantry: 1000 } },
  hellas_bronze_wall: { name: "Hellas Tunç Duvarı", category: "STANDARD", hireCost: 4800, turnUpkeep: 1100, land: { spear: 2500, heavy_infantry: 500 } },
  iberian_shield_company: { name: "İber Kalkan Birliği", category: "STANDARD", hireCost: 4600, turnUpkeep: 1100, land: { light_infantry: 1500, heavy_infantry: 1000, light_cavalry: 500 } },
  numidian_desert_cavalry: { name: "Numidya Çöl Süvarileri", category: "STANDARD", hireCost: 5600, turnUpkeep: 1300, land: { light_cavalry: 2000, light_infantry: 500 } },
  germanic_oak_oath: { name: "Germen Meşe Yemini", category: "STANDARD", hireCost: 4700, turnUpkeep: 1000, land: { light_infantry: 2500, spear: 1000, archer: 500 } },
  cilician_free_swords: { name: "Kilikya Serbest Kılıçları", category: "STANDARD", hireCost: 4100, turnUpkeep: 850, land: { light_infantry: 1500, archer: 1000, slinger: 500 } },
  galatian_golden_horns: { name: "Galat Altın Boynuzları", category: "STANDARD", hireCost: 5600, turnUpkeep: 1200, land: { heavy_infantry: 2000, light_infantry: 1000 } },
  scythian_steppe_arrows: { name: "İskit Bozkır Okları", category: "STANDARD", hireCost: 6100, turnUpkeep: 1350, land: { light_cavalry: 1500, archer: 1000 } },
  libyan_red_shields: { name: "Libya Kızıl Kalkanları", category: "STANDARD", hireCost: 6500, turnUpkeep: 1450, land: { spear: 2000, heavy_infantry: 1000, slinger: 1000 } },
  thessalian_black_manes: { name: "Tesalya Kara Yelelileri", category: "ELITE", hireCost: 8500, turnUpkeep: 1900, land: { heavy_cavalry: 1500, light_cavalry: 1000 } },
  sarmatian_iron_cavalry: { name: "Sarmat Demir Süvarileri", category: "ELITE", hireCost: 9500, turnUpkeep: 2100, land: { heavy_cavalry: 2000, light_cavalry: 500 } },
  macedonian_sarissa_company: { name: "Makedon Sarissa Birliği", category: "ELITE", hireCost: 7800, turnUpkeep: 1750, land: { spear: 3000, heavy_infantry: 1000, archer: 500 } },
  silver_shields: { name: "Gümüş Kalkanlılar", category: "ELITE", hireCost: 9300, turnUpkeep: 1850, land: { heavy_infantry: 2500, archer: 500, light_cavalry: 500 } },
  punic_expeditionary_army: { name: "Pön Sefer Ordusu", category: "ELITE", hireCost: 9000, turnUpkeep: 1950, land: { spear: 2000, heavy_infantry: 1000, slinger: 1000, heavy_cavalry: 500 } },
  heirs_of_ten_thousand: { name: "On Binlerin Mirasçıları", category: "ELITE", hireCost: 12500, turnUpkeep: 2800, slotCost: 2, land: { light_infantry: 3000, spear: 2000, archer: 1000, heavy_infantry: 1000, light_cavalry: 1000 } },
  tyrian_siege_masters: { name: "Tyros Kuşatma Ustaları", category: "SIEGE", hireCost: 8500, turnUpkeep: 1600, land: { light_infantry: 1000, archer: 500 }, siege: { ballista: 2, catapult: 1, mantlet: 10 } },
  hellas_breach_company: { name: "Hellas Gedik Birliği", category: "SIEGE", hireCost: 9500, turnUpkeep: 1900, land: { heavy_infantry: 1500, spear: 1000 }, siege: { ram: 1, ladder_group: 1, siege_tower: 1 } },
  aegean_free_fleet: { name: "Ege Serbest Filosu", category: "FLEET", hireCost: 6500, turnUpkeep: 1300, ships: { kerkouros: 6, trireme: 2 } },
  phoenician_purple_sails: { name: "Fenike Mor Yelkenleri", category: "FLEET", hireCost: 15000, turnUpkeep: 2800, land: { archer: 1000 }, ships: { trireme: 4, quinquereme: 3 } },
  nile_marines: { name: "Nil Deniz Piyadeleri", category: "FLEET", hireCost: 11000, turnUpkeep: 2400, land: { light_infantry: 1000, spear: 500 }, ships: { trireme: 3, quinquereme: 2 } }
} as const;

export type MercenaryCompanyKey = keyof typeof MERCENARY_COMPANY_DEFINITIONS;
export const MERCENARY_COMPANIES: Record<MercenaryCompanyKey, MercenaryCompany> = MERCENARY_COMPANY_DEFINITIONS;
export const MERCENARY_CONTRACT_LIMITS = { PEACE: 3, PARTIAL: 3, GENERAL: 4 } as const;
export const MERCENARY_CATEGORY_LABELS: Record<MercenaryCategory, string> = {
  CHEAP: "Ucuz Grup", STANDARD: "Orta Sınıf", ELITE: "Seçkin Grup", SIEGE: "Kuşatma Şirketi", FLEET: "Kiralık Filo"
};

export function mercenaryPersonnel(company: MercenaryCompany): number {
  const land = Object.values(company.land ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
  const crew = Object.entries(company.ships ?? {}).reduce((sum, [ship, quantity]) => sum + (SHIPS[ship as keyof typeof SHIPS]?.manpower ?? 0) * (quantity ?? 0), 0);
  return land + crew;
}

export function mercenaryContractSchedule(hiredTurn: number): { arrivalTurn: number; endTurn: number; firstUpkeepTurn: number } {
  const arrivalTurn = hiredTurn + 1;
  return { arrivalTurn, endTurn: arrivalTurn + 2, firstUpkeepTurn: arrivalTurn };
}

export function importedMercenarySchedule(currentTurn: number): { hiredTurn: number; arrivalTurn: number; endTurn: number; lastUpkeepTurn: number; firstUpkeepTurn: number } {
  return { hiredTurn: currentTurn - 1, arrivalTurn: currentTurn, endTurn: currentTurn + 2, lastUpkeepTurn: currentTurn, firstUpkeepTurn: currentTurn + 1 };
}

export function mercenaryTerminationUpkeep(input: {
  turnUpkeep: number;
  hiredTurn: number;
  currentTurn: number;
  acquisitionInterval: number;
  lastUpkeepTurn: number | null;
  unpaid: boolean;
}): { amount: number; chargedTurns: number } {
  if (input.unpaid) return { amount: input.turnUpkeep, chargedTurns: input.acquisitionInterval };
  if (input.lastUpkeepTurn !== null) return { amount: 0, chargedTurns: 0 };
  const chargedTurns = Math.min(input.acquisitionInterval, Math.max(0, input.currentTurn - input.hiredTurn));
  return {
    amount: Math.ceil(input.turnUpkeep * chargedTurns / input.acquisitionInterval),
    chargedTurns
  };
}