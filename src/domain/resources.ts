export const RESOURCES = {
  GRAIN: { label: "Tahıl", effects: ["Nüfus artış hızı +%10", "Ordu bakım maliyeti -%10"] },
  IRON: { label: "Demir", effects: ["Mızraklı, Ağır Piyade ve Ağır Süvari yetiştirme maliyeti -%10", "Koçbaşı, Katapult ve Balista üretim maliyeti -%10"] },
  TIMBER: { label: "Kereste", effects: ["Bina inşa maliyeti -%10", "Gemi üretim maliyeti -%10"] },
  MARBLE: { label: "Mermer", effects: ["Curia, Panteon, Agora ve Akademi inşa maliyeti -%10", "Bu binaların inşa süresi -1 Tur"] },
  HORSES: { label: "At", effects: ["Hafif ve Ağır Süvari yetiştirme maliyeti -%10", "Ordu hareket hızı +%25"] },
  LEATHER: { label: "Deri", effects: ["Hafif Piyade, Okçu ve Sapancı yetiştirme maliyeti -%10", "Mantlet, Koçbaşı ve Kuşatma Kulesi maliyeti -%10"] },
  WINE: { label: "Şarap", effects: ["Huzursuzluk ihtimali -%10; asimilasyon süresi -1 Tur", "Lupanar gelir yüzdesi her seviyede +%5"] },
  OLIVE: { label: "Zeytin", effects: ["Şifacı Evi nüfus getirisi +%20", "Salgın hastalık ihtimali -%10"] },
  GLASS: { label: "Cam", effects: ["Şifacı Evi ve Su Kemeri ayrı ayrı +100 Altın gelir sağlar", "Şifacı Evi ve Su Kemeri inşa maliyeti -%10"] },
  GOLD: { label: "Altın", effects: ["Yerleşkenin toplam geliri +%10", "Paralı asker kontrat maliyeti -%10"] },
  LEAD: { label: "Kurşun", effects: ["Sapancı yetiştirme maliyeti -%10", "Katapult ve Balista üretim maliyeti -%10"] },
  AMBER: { label: "Kehribar", effects: ["Panteon +300 Altın ek gelir sağlar", "İsyan ihtimali -%10"] },
  SILK: { label: "İpek", effects: ["Agora ve Ticaret Loncası gelirleri +%10", "Akademide yetiştirilen karakterlerin zarlarına +1"] },
  SPICES: { label: "Baharat", effects: ["Yerleşkenin toplam geliri +%20", "Nüfus artış hızı +%5"] },
  PURPLE_DYE: { label: "Mor Boya", effects: ["Curia'nın ikinci politika sınırını geliştirir", "Ülkenin ticaret sözleşmesi sınırı +1"] }
} as const;

export type ResourceType = keyof typeof RESOURCES;

export const RESOURCE_CHOICES = Object.entries(RESOURCES).map(([value, resource]) => ({ name: resource.label, value }));

export function isResourceType(value: string): value is ResourceType {
  return Object.prototype.hasOwnProperty.call(RESOURCES, value);
}

function has(resources: readonly ResourceType[], resource: ResourceType): boolean {
  return resources.includes(resource);
}

function cappedDiscount(count: number): number {
  return Math.max(0.5, 1 - count * 0.10);
}

export function buildingCostMultiplier(buildingType: string, resources: readonly ResourceType[]): number {
  let discounts = has(resources, "TIMBER") ? 1 : 0;
  if (has(resources, "MARBLE") && ["curia", "pantheon", "agora", "academy"].includes(buildingType)) discounts++;
  if (has(resources, "GLASS") && ["healer", "aqueduct"].includes(buildingType)) discounts++;
  return Math.max(0.70, 1 - discounts * 0.10);
}

export function buildingDurationReduction(buildingType: string, resources: readonly ResourceType[]): number {
  return has(resources, "MARBLE") && ["curia", "pantheon", "agora", "academy"].includes(buildingType) ? 1 : 0;
}

export function unitCostMultiplier(unitType: string, resources: readonly ResourceType[]): number {
  let discounts = 0;
  if (has(resources, "IRON") && ["spear", "heavy_infantry", "heavy_cavalry"].includes(unitType)) discounts++;
  if (has(resources, "HORSES") && ["light_cavalry", "heavy_cavalry"].includes(unitType)) discounts++;
  if (has(resources, "LEATHER") && ["light_infantry", "archer", "slinger"].includes(unitType)) discounts++;
  if (has(resources, "LEAD") && unitType === "slinger") discounts++;
  return cappedDiscount(discounts);
}

export function shipCostMultiplier(resources: readonly ResourceType[]): number {
  return has(resources, "TIMBER") ? 0.9 : 1;
}

export function armyUpkeepMultiplier(resources: readonly ResourceType[]): number {
  return has(resources, "GRAIN") ? 0.9 : 1;
}

export function siegeCostMultiplier(assetType: string, resources: readonly ResourceType[]): number {
  let discounts = 0;
  if (has(resources, "IRON") && ["ram", "catapult", "ballista"].includes(assetType)) discounts++;
  if (has(resources, "LEATHER") && ["mantlet", "ram", "siege_tower"].includes(assetType)) discounts++;
  if (has(resources, "LEAD") && ["catapult", "ballista"].includes(assetType)) discounts++;
  return cappedDiscount(discounts);
}

export function tradeAgreementLimit(resources: readonly ResourceType[]): number {
  return 2 + (has(resources, "PURPLE_DYE") ? 1 : 0);
}

