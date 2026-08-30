import type { UNITS } from "./catalog.js";

export const NPC_AUTO_PURCHASE_DOCTRINES = {
  BALANCED: {
    label: "Dengeli",
    description: "Her Alım Turunda en fazla 1 bina ve dengeli bir kara ordusu kurar.",
    buildingLimit: 1,
    buildingPriority: ["farm", "agora", "trade_guild", "aqueduct", "healer", "curia", "engineering", "academy", "pantheon", "port", "shipyard", "raw_material"]
  },
  DEFENSIVE: {
    label: "Savunmacı",
    description: "Bina almaz; mızraklı, okçu ve ağır piyadeye öncelik verir.",
    buildingLimit: 0,
    buildingPriority: []
  },
  OFFENSIVE: {
    label: "Saldırgan",
    description: "Bina almaz; ağır piyade ve süvari ağırlıklı asker toplar.",
    buildingLimit: 0,
    buildingPriority: []
  },
  CAVALRY: {
    label: "Süvari Ağırlıklı",
    description: "Bina almaz; bütçesini hafif ve ağır süvariye ayırır.",
    buildingLimit: 0,
    buildingPriority: []
  },
  LIGHT_ARMY: {
    label: "Hafif Ordu",
    description: "En fazla 1 ekonomik/altyapı binası ve düşük maliyetli hareketli birlikler alır.",
    buildingLimit: 1,
    buildingPriority: ["farm", "agora", "aqueduct", "trade_guild", "healer", "curia", "raw_material"]
  },
  HISTORICAL: {
    label: "Tarihsel / Çeşitli",
    description: "Ülkeye ve tura göre tutarlı bir asker profili seçer; en fazla 1 uygun bina alır.",
    buildingLimit: 1,
    buildingPriority: ["curia", "farm", "agora", "aqueduct", "engineering", "academy", "pantheon", "trade_guild", "port", "shipyard", "raw_material"]
  }
} as const;

export type NpcAutoPurchaseDoctrine = keyof typeof NPC_AUTO_PURCHASE_DOCTRINES;
export type PurchasableUnitType = Exclude<keyof typeof UNITS, "observer" | "militia">;

const UNIT_ORDERS: Record<Exclude<NpcAutoPurchaseDoctrine, "HISTORICAL">, readonly PurchasableUnitType[]> = {
  BALANCED: ["light_infantry", "spear", "archer", "heavy_infantry", "slinger", "light_cavalry", "heavy_cavalry", "light_infantry", "spear", "archer"],
  DEFENSIVE: ["spear", "archer", "heavy_infantry", "spear", "archer", "light_infantry", "heavy_infantry", "slinger"],
  OFFENSIVE: ["heavy_infantry", "light_infantry", "heavy_cavalry", "heavy_infantry", "light_cavalry", "light_infantry", "archer"],
  CAVALRY: ["light_cavalry", "heavy_cavalry", "light_cavalry", "heavy_cavalry", "light_cavalry", "archer", "spear"],
  LIGHT_ARMY: ["light_infantry", "slinger", "archer", "light_infantry", "spear", "light_cavalry", "light_infantry", "slinger"]
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolvedNpcDoctrine(doctrine: NpcAutoPurchaseDoctrine, countryId: string, turn: number): Exclude<NpcAutoPurchaseDoctrine, "HISTORICAL"> {
  if (doctrine !== "HISTORICAL") return doctrine;
  const profiles: Array<Exclude<NpcAutoPurchaseDoctrine, "HISTORICAL">> = ["BALANCED", "DEFENSIVE", "OFFENSIVE", "CAVALRY", "LIGHT_ARMY"];
  return profiles[stableHash(`${countryId}:${turn}`) % profiles.length]!;
}

export function npcUnitOrder(doctrine: NpcAutoPurchaseDoctrine, countryId: string, turn: number): readonly PurchasableUnitType[] {
  return UNIT_ORDERS[resolvedNpcDoctrine(doctrine, countryId, turn)];
}

export function npcBuildingLimit(doctrine: NpcAutoPurchaseDoctrine): number {
  return NPC_AUTO_PURCHASE_DOCTRINES[doctrine].buildingLimit;
}

export function npcBuildingPriority(doctrine: NpcAutoPurchaseDoctrine, countryId: string, turn: number): readonly string[] {
  if (doctrine !== "HISTORICAL") return NPC_AUTO_PURCHASE_DOCTRINES[doctrine].buildingPriority;
  const resolved = resolvedNpcDoctrine(doctrine, countryId, turn);
  if (resolved === "DEFENSIVE" || resolved === "OFFENSIVE" || resolved === "CAVALRY") {
    return NPC_AUTO_PURCHASE_DOCTRINES.HISTORICAL.buildingPriority;
  }
  return NPC_AUTO_PURCHASE_DOCTRINES[resolved].buildingPriority;
}
