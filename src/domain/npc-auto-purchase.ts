import type { UNITS } from "./catalog.js";

const STANDARD_BUILDING_PRIORITY = [
  "farm", "agora", "trade_guild", "aqueduct", "healer", "curia", "engineering",
  "academy", "pantheon", "port", "shipyard", "raw_material"
] as const;

export const NPC_AUTO_PURCHASE_DOCTRINES = {
  FULL_BUILDING_ARMY: {
    label: "Full Bina + Asker",
    description: "Her Alım Turunda en fazla 2 uygun bina emri verir; kalan bütçeyle ordunun eksik kompozisyon rollerini tamamlar.",
    buildingLimit: 2,
    recruitsUnits: true,
    developmentOnly: false,
    navalFirst: false,
    buildingPriority: STANDARD_BUILDING_PRIORITY
  },
  ARMY_ONLY: {
    label: "Sadece Asker",
    description: "Bina emri vermez; bütün kullanılabilir bütçeyi mevcut ordunun eksik kompozisyon rollerine ayırır.",
    buildingLimit: 0,
    recruitsUnits: true,
    developmentOnly: false,
    navalFirst: false,
    buildingPriority: []
  },
  DEVELOPMENT: {
    label: "Gelişim",
    description: "Asker almaz; uygun ve karşılanabilir mevcut Seviye 1 binaları Seviye 2'ye yükseltir.",
    buildingLimit: Number.MAX_SAFE_INTEGER,
    recruitsUnits: false,
    developmentOnly: true,
    navalFirst: false,
    buildingPriority: STANDARD_BUILDING_PRIORITY
  },
  NAVAL_FOCUS: {
    label: "Gemi Odaklı",
    description: "Önce mevcut Liman ve Tersane kapasitesiyle gemi üretir; gemi üretilemezse veya bütçe kalırsa kompozisyona uygun kara askeri alır.",
    buildingLimit: 0,
    recruitsUnits: true,
    developmentOnly: false,
    navalFirst: true,
    buildingPriority: []
  }
} as const;

export type NpcAutoPurchaseDoctrine = keyof typeof NPC_AUTO_PURCHASE_DOCTRINES;
export type PurchasableUnitType = Exclude<keyof typeof UNITS, "observer" | "militia">;

export function npcBuildingLimit(doctrine: NpcAutoPurchaseDoctrine): number {
  return NPC_AUTO_PURCHASE_DOCTRINES[doctrine].buildingLimit;
}

export function npcBuildingPriority(doctrine: NpcAutoPurchaseDoctrine): readonly string[] {
  return NPC_AUTO_PURCHASE_DOCTRINES[doctrine].buildingPriority;
}

export function npcRecruitsUnits(doctrine: NpcAutoPurchaseDoctrine): boolean {
  return NPC_AUTO_PURCHASE_DOCTRINES[doctrine].recruitsUnits;
}

export function npcDevelopmentOnly(doctrine: NpcAutoPurchaseDoctrine): boolean {
  return NPC_AUTO_PURCHASE_DOCTRINES[doctrine].developmentOnly;
}

export function npcPrioritizesShips(doctrine: NpcAutoPurchaseDoctrine): boolean {
  return NPC_AUTO_PURCHASE_DOCTRINES[doctrine].navalFirst;
}
