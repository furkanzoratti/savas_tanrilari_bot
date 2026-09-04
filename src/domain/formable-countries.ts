import type { CharacterRole } from "./types.js";

export interface FormableModifiers {
  unitDiscount?: number;
  infantryDiscount?: number;
  cavalryDiscount?: number;
  archerSlingerDiscount?: number;
  archerSlingerLightDiscount?: number;
  shipDiscount?: number;
  shipTransportMultiplier?: number;
  buildingDiscount?: number;
  buildingDiscountTypes?: readonly string[];
  buildingDurationReduction?: number;
  incomePercent?: number;
  buildingIncomePercent?: Partial<Record<string, number>>;
  portFlatIncome?: number;
  curiaFlatIncome?: number;
  populationGainPercent?: number;
  academyUpkeep?: number;
  academyRoleSkillBonus?: Partial<Record<CharacterRole, number>>;
  academyMerchantAgoraBonus?: number;
  warPreparationMilitia?: number;
  observerManpower?: number;
  policyMilitiaMultiplier?: number;
  starvationBonus?: number;
  shipyardPointBonus?: Partial<Record<"kerkouros" | "trireme" | "quinquereme", number>>;
  siegeAssetDiscount?: number;
  wallSiegeDamageMultiplier?: number;
  ruinStageTwoIncomeMultiplier?: number;
  slaveCampRates?: readonly [number, number, number];
}

export interface FormableCountryDefinition {
  name: string;
  emoji: string;
  buffs: readonly string[];
  modifiers: FormableModifiers;
}

export const FORMABLE_COUNTRIES = {
  BRITANNIA: { name: "Britanya", emoji: "🏴", buffs: ["Britanya'da düşman keşif sonuçları doğal 20 dışında dar tahmin aralığı verir.", "Savaş Hazırlığı milisi 1.000 olur.", "Her Tersane üretim kapasitesine +2 Trireme ekler.", "Okçu ve Sapancı alımı %5 ucuzdur."], modifiers: { archerSlingerDiscount: 0.05, warPreparationMilitia: 1_000, shipyardPointBonus: { trireme: 2 } } },
  GALLIC_CONFEDERATION: { name: "Galya Konfederasyonu", emoji: "🐗", buffs: ["Piyade alımı %10 ucuzdur.", "Galya içindeki ordu hareketi %25 hızlıdır.", "Kuşatmadaki Curia Sv2+ yerleşke 500 geçici milis kazanır.", "Çiftlik ve Agora gelirleri %5 artar."], modifiers: { infantryDiscount: 0.10, buildingIncomePercent: { farm: 0.05, agora: 0.05 } } },
  BELGIAN_UNION: { name: "Belçika Birliği", emoji: "🛡️", buffs: ["Yıkılan sur ve kapı 1 turda onarılır.", "Politika ve olaylardan gelen milis %20 artar.", "Bölgedeki yağma nüfus ve gelir kaybı %25 azalır."], modifiers: { policyMilitiaMultiplier: 1.20 } },
  GERMANIC_UNION: { name: "Cermenya Birliği", emoji: "⚔️", buffs: ["Gözcüler orman cezasını yok sayar.", "Piyade alımı %10 ucuzdur.", "Cermen yağmalarındaki nüfus ve köle kaybı %25 azalır.", "Zorunlu Askerlik 5.000 milis için 4.000 nüfus harcar."], modifiers: { infantryDiscount: 0.10 } },
  IBERIA: { name: "İberya", emoji: "🐂", buffs: ["Kara yağması zarlarına +1.", "Okçu, Sapancı ve Hafif Piyade alımı %5 ucuzdur.", "Yağma ve köle taşıma kapasitesi %25 artar.", "Mühendislik Atölyesi ve kuşatma aletleri %10 ucuzdur."], modifiers: { archerSlingerLightDiscount: 0.05, buildingDiscount: 0.10, buildingDiscountTypes: ["engineering"], siegeAssetDiscount: 0.10 } },
  ITALY: { name: "İtalya", emoji: "🦅", buffs: ["İtalya içindeki hareket %25 hızlıdır.", "Bütün asker alımları %5 ucuzdur.", "Bina yapım süresi 1 tur kısalır.", "Curia politikası Alım Turu beklemeden değiştirilebilir."], modifiers: { unitDiscount: 0.05, buildingDurationReduction: 1 } },
  ALPINE_UNION: { name: "Alp Birliği", emoji: "🏔️", buffs: ["Gözcüler dağ cezasını yok sayar.", "Yerleşkeler açlığa +2 tur dayanır.", "Mühendislik Atölyesi ve savaş aletleri %10 ucuzdur."], modifiers: { starvationBonus: 2, buildingDiscount: 0.10, buildingDiscountTypes: ["engineering"], siegeAssetDiscount: 0.10 } },
  PANNONIA: { name: "Pannonia", emoji: "🐎", buffs: ["Gözcü için gerekli süvari 100'e düşer.", "Süvari alımı %5 ucuzdur.", "Savaş Hazırlığı milisi 750 olur."], modifiers: { observerManpower: 100, cavalryDiscount: 0.05, warPreparationMilitia: 750 } },
  ILLYRIA: { name: "İllirya", emoji: "🌊", buffs: ["Her Tersane kapasitesine +2 Kerkouros ekler.", "Kıyı yağması zarlarına +1.", "Gemi taşıma kapasitesi %10 artar."], modifiers: { shipyardPointBonus: { kerkouros: 2 }, shipTransportMultiplier: 1.10 } },
  DACIA: { name: "Dakya", emoji: "🐺", buffs: ["Köle Kampı isyan ihtimali 5 puan azalır.", "Köle Kampı gelir oranları %20/%35/%55 olur.", "Çiftlik geliri %10 artar."], modifiers: { slaveCampRates: [0.20, 0.35, 0.55], buildingIncomePercent: { farm: 0.10 } } },
  THRACE: { name: "Trakya", emoji: "🗡️", buffs: ["Kara birlikleri %5 ucuzdur.", "Kara yağması zarlarına +1.", "Savaş Hazırlığı 250 ek milis verir."], modifiers: { unitDiscount: 0.05, warPreparationMilitia: 750 } },
  MACEDONIA: { name: "Makedonya", emoji: "☀️", buffs: ["Süvari alımı %5 ucuzdur.", "Akademiden yetişen Komutanlar +1 ek özellik puanı alır."], modifiers: { cavalryDiscount: 0.05, academyRoleSkillBonus: { COMMANDER: 1 } } },
  HELLAS: { name: "Hellas", emoji: "🏛️", buffs: ["Akademi bakımı 250 Altındır.", "Agora sabit geliri %10 artar.", "Her Tersane kapasitesine +1 Trireme ekler."], modifiers: { academyUpkeep: 250, buildingIncomePercent: { agora: 0.10 }, shipyardPointBonus: { trireme: 1 } } },
  CARTHAGE: { name: "Kartaca", emoji: "🐘", buffs: ["Liman ve Agora gelirleri %5 artar.", "Her Tersane kapasitesine +2 Kerkouros ekler."], modifiers: { buildingIncomePercent: { port: 0.05, agora: 0.05 }, shipyardPointBonus: { kerkouros: 2 } } },
  MAURETANIA: { name: "Mauretanya", emoji: "🦁", buffs: ["Bütün yerleşke gelirleri %2 artar.", "Liman geliri %10 artar.", "Haraplık ikinci aşama toparlanması %60 olur."], modifiers: { incomePercent: 0.02, buildingIncomePercent: { port: 0.10 }, ruinStageTwoIncomeMultiplier: 0.60 } },
  LIBYA: { name: "Libya", emoji: "🌴", buffs: ["Çiftlik, Su Kemeri ve Liman gelirleri %10 artar.", "Haraplık ikinci aşama toparlanması %75 olur.", "Su Kemeri %10 ucuzdur."], modifiers: { buildingIncomePercent: { farm: 0.10, aqueduct: 0.10, port: 0.10 }, buildingDiscount: 0.10, buildingDiscountTypes: ["aqueduct"], ruinStageTwoIncomeMultiplier: 0.75 } },
  EGYPT: { name: "Mısır", emoji: "𓂀", buffs: ["Çiftlik sabit geliri %20 artar.", "Bina ve doğal nüfus artışı %10 yükselir."], modifiers: { buildingIncomePercent: { farm: 0.20 }, populationGainPercent: 0.10 } },
  KUSH: { name: "Kuş Krallığı", emoji: "☀️", buffs: ["Okçu ve Sapancı alımı %5 ucuzdur.", "Panteon %10 ucuzdur; salgın koruması Sv1'de başlar."], modifiers: { archerSlingerDiscount: 0.05, buildingDiscount: 0.10, buildingDiscountTypes: ["pantheon"] } },
  ARABIAN_CONFEDERATION: { name: "Arabistan Konfederasyonu", emoji: "🐪", buffs: ["Agora, Liman ve Ticaret Loncası gelirleri %10 artar.", "Çöl hareketi %25 hızlıdır.", "Yağma ve köle taşıma kapasitesi %30 artar.", "Su Kemeri %10 ucuzdur ve açlığa +1 tur verir."], modifiers: { buildingIncomePercent: { agora: 0.10, port: 0.10, trade_guild: 0.10 }, buildingDiscount: 0.10, buildingDiscountTypes: ["aqueduct"], starvationBonus: 1 } },
  PHOENICIA_ARAM: { name: "Fenike-Aram", emoji: "⛵", buffs: ["Her Liman +100 Altın verir.", "Tersane inşası %5 ucuzdur."], modifiers: { portFlatIncome: 100, buildingDiscount: 0.05, buildingDiscountTypes: ["shipyard"] } },
  MESOPOTAMIA: { name: "Mezopotamya", emoji: "🌅", buffs: ["Çiftlik geliri %10 artar.", "Yerleşkeler açlığa +1 tur dayanır."], modifiers: { buildingIncomePercent: { farm: 0.10 }, starvationBonus: 1 } },
  CILICIA_CYPRUS: { name: "Kilikya-Kıbrıs", emoji: "⚓", buffs: ["Gemi alımı %5 ucuzdur.", "Her Tersane kapasitesine +1 Trireme ekler."], modifiers: { shipDiscount: 0.05, shipyardPointBonus: { trireme: 1 } } },
  LYDIA_IONIA: { name: "Lidya-İyonya", emoji: "🪙", buffs: ["Agora sabit geliri %20 artar.", "Akademi bakımı 250 Altındır.", "Her Liman +100 Altın verir."], modifiers: { buildingIncomePercent: { agora: 0.20 }, academyUpkeep: 250, portFlatIncome: 100 } },
  CAPPADOCIA: { name: "Kapadokya", emoji: "🏰", buffs: ["Yerleşkeler açlığa +1 tur dayanır.", "Sur ve Mühendislik Atölyesi %10 ucuzdur.", "Yıkılan sur ve kapı 1 turda onarılır."], modifiers: { starvationBonus: 1, buildingDiscount: 0.10, buildingDiscountTypes: ["walls", "engineering"] } },
  PONTUS: { name: "Pontus", emoji: "🌊", buffs: ["Her Liman +150 Altın verir.", "Gemi alımı %5 ucuzdur.", "Tersane Sv2 +1, Sv3 +2 Trireme kapasitesi verir."], modifiers: { portFlatIncome: 150, shipDiscount: 0.05 } },
  ARMENIA: { name: "Ermenistan", emoji: "⛰️", buffs: ["Yerleşkeler açlığa +1 tur dayanır.", "Süvari alımı %5 ucuzdur."], modifiers: { starvationBonus: 1, cavalryDiscount: 0.05 } },
  CAUCASUS: { name: "Kafkasya", emoji: "🏔️", buffs: ["Bölge hareketi %25 hızlıdır.", "Yerleşkeler açlığa +1 tur dayanır.", "Koçbaşı ve Katapult sur hasarı %10 azalır."], modifiers: { starvationBonus: 1, wallSiegeDamageMultiplier: 0.90 } },
  BOSPORAN_KINGDOM: { name: "Bosporos Krallığı", emoji: "🌾", buffs: ["Her Liman +100 Altın verir.", "Çiftlik geliri %10 artar."], modifiers: { portFlatIncome: 100, buildingIncomePercent: { farm: 0.10 } } },
  SARMATIA: { name: "Sarmatya", emoji: "🐎", buffs: ["Süvari alımı %10 ucuzdur.", "Gözcü için gerekli süvari 100'e düşer.", "Ova ve düz çölde yağma +1, hareket %25 hızlıdır."], modifiers: { observerManpower: 100, cavalryDiscount: 0.10 } },
  SCYTHIA: { name: "İskitya", emoji: "🏹", buffs: ["Süvari alımı %10 ucuzdur.", "Gözcü için gerekli süvari 100'e düşer.", "Ova ve düz çölde yağma +1."], modifiers: { observerManpower: 100, cavalryDiscount: 0.10 } },
  CHORASMIA: { name: "Harezm", emoji: "🏜️", buffs: ["Süvari alımı %5 ucuzdur.", "Su Kemeri %10 ucuzdur."], modifiers: { cavalryDiscount: 0.05, buildingDiscount: 0.10, buildingDiscountTypes: ["aqueduct"] } },
  SOGDIANA: { name: "Soğdiana", emoji: "💰", buffs: ["Agora ve Ticaret Loncası gelirleri %5 artar.", "Agora'ya atanan Tüccar bonusu %15 olur."], modifiers: { buildingIncomePercent: { agora: 0.05, trade_guild: 0.05 }, academyMerchantAgoraBonus: 0.15 } },
  BACTRIA: { name: "Baktriya", emoji: "🐫", buffs: ["Süvari alımı %5 ucuzdur.", "Akademi bakımı 400 Altındır."], modifiers: { cavalryDiscount: 0.05, academyUpkeep: 400 } },
  PARTHIAN_KINGDOM: { name: "Part Krallığı", emoji: "🏹", buffs: ["Süvari alımı %5 ucuzdur.", "Gözcü için gerekli süvari 100'e düşer."], modifiers: { observerManpower: 100, cavalryDiscount: 0.05 } },
  MEDIA: { name: "Medya", emoji: "🦁", buffs: ["Bütün binalar %5 ucuzdur.", "Vergi Sıkılaştırması isyan riski %7 olur."], modifiers: { buildingDiscount: 0.05 } },
  PERSIS: { name: "Persis", emoji: "🔥", buffs: ["Her Curia +100 Altın verir.", "Vergi Sıkılaştırması isyan riski %7 olur."], modifiers: { curiaFlatIncome: 100 } },
  ARYANA: { name: "Aryana", emoji: "🦅", buffs: ["Süvari, Okçu ve Sapancı alımı %5 ucuzdur.", "Yağma ve köle taşıma kapasitesi %20 artar.", "Curia ve yol-altyapı yatırımı %10 ucuzdur."], modifiers: { cavalryDiscount: 0.05, archerSlingerDiscount: 0.05, buildingDiscount: 0.10, buildingDiscountTypes: ["curia"] } },
  GEDROSIA_CARMANIA: { name: "Gedrosya-Karmanya", emoji: "🏜️", buffs: ["Bütün yerleşke gelirleri %2 artar.", "Su Kemeri %10 ucuzdur."], modifiers: { incomePercent: 0.02, buildingDiscount: 0.10, buildingDiscountTypes: ["aqueduct"] } }
} as const satisfies Record<string, FormableCountryDefinition>;

export type FormableCountryKey = keyof typeof FORMABLE_COUNTRIES;

export function isFormableCountryKey(value: string): value is FormableCountryKey {
  return Object.prototype.hasOwnProperty.call(FORMABLE_COUNTRIES, value);
}

export function formableModifiers(key: FormableCountryKey | null | undefined): FormableModifiers {
  return key ? FORMABLE_COUNTRIES[key]?.modifiers ?? {} : {};
}

const infantry = new Set(["light_infantry", "slinger", "spear", "archer", "heavy_infantry", "legionary", "hoplite", "briton_longbow", "persian_immortal", "iberian_caetrati", "germanic_shock_warrior"]);
const cavalry = new Set(["light_cavalry", "heavy_cavalry", "horse_archer", "camel_cavalry", "carthaginian_war_elephant"]);

export function formableUnitDiscount(key: FormableCountryKey | null | undefined, unitType: string): number {
  const modifier = formableModifiers(key);
  let discount = modifier.unitDiscount ?? 0;
  if (infantry.has(unitType)) discount += modifier.infantryDiscount ?? 0;
  if (cavalry.has(unitType)) discount += modifier.cavalryDiscount ?? 0;
  if (["archer", "slinger", "briton_longbow"].includes(unitType)) discount += modifier.archerSlingerDiscount ?? 0;
  if (["archer", "slinger", "briton_longbow", "light_infantry"].includes(unitType)) discount += modifier.archerSlingerLightDiscount ?? 0;
  return discount;
}

export function formableBuildingDiscount(key: FormableCountryKey | null | undefined, buildingType: string): number {
  const modifier = formableModifiers(key);
  if (!modifier.buildingDiscount) return 0;
  return !modifier.buildingDiscountTypes?.length || modifier.buildingDiscountTypes.includes(buildingType) ? modifier.buildingDiscount : 0;
}
