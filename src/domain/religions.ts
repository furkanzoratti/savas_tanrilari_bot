import { UNITS } from "./catalog.js";
import type { CultureGroup } from "./cultures.js";

export type ReligionKey =
  | "CELTIC_FAITH" | "GERMANIC_FAITH" | "IBERIAN_FAITH" | "ROMAN_FAITH" | "ITALIC_FAITH"
  | "PUNIC_FAITH" | "LIBYAN_BERBER_FAITH" | "HELLENIC_FAITH" | "THRACO_ILLYRIAN_FAITH"
  | "ZALMOXIAN_FAITH" | "SCYTHO_SARMATIAN_FAITH" | "BOSPORAN_SYNCRETISM" | "BALTIC_FAITH"
  | "ANATOLIAN_FAITHS" | "ARMENIAN_FAITH" | "CAUCASIAN_FAITH" | "PHOENICIAN_CANAANITE_FAITH"
  | "JUDAISM" | "MESOPOTAMIAN_FAITH" | "EGYPTIAN_FAITH" | "KUSH_NUBIAN_FAITH"
  | "NABATAEAN_FAITH" | "SOUTH_ARABIAN_FAITH" | "ZOROASTRIANISM" | "HELLENO_IRANIAN_SYNCRETISM"
  | "BRAHMANISM" | "BUDDHISM" | "JAINISM" | "DRAVIDIAN_FAITHS" | "CHRISTIANITY";

export type ReligionUnitType = keyof typeof UNITS;

export const MINORITY_RELIGION_KEY = "LOCAL_SYNCRETIC_CULTS" as const;
export const MINORITY_RELIGION_LABEL = "Yerel ve Senkretik Kültler";
export const LOCAL_RELIGION_FULL_EFFECT_THRESHOLD = 80;
export const LOCAL_RELIGION_HALF_EFFECT_THRESHOLD = 50;
export const NATIONAL_RELIGION_EFFECT_THRESHOLD = 75;
export const SECONDARY_RELIGION_FULL_EFFECT_THRESHOLD = 25;
export const SECONDARY_RELIGION_HALF_EFFECT_THRESHOLD = 10;

export interface ReligionModifiers {
  taxIncomePercent: number;
  landTradeIncomePercent: number;
  seaTradeIncomePercent: number;
  foreignTradeIncomePercent: number;
  settlementIncomePercent: number;
  populationGrowthPercent: number;
  buildingCostDiscount: number;
  academyBuildingCostDiscount: number;
  siegeAssetCostDiscount: number;
  unitPurchaseDiscounts: Array<{ discount: number; units: ReligionUnitType[] }>;
  unitUpkeepDiscounts: Array<{ discount: number; units: ReligionUnitType[] }>;
  shipPurchaseDiscount: number;
  shipUpkeepDiscount: number;
  unrestReduction: number;
  negativeEventRiskReduction: number;
  starvationBonus: number;
  landRaidIncomePercent: number;
  spyDefenseBonus: number;
  diplomatTaskBonus: number;
  missionaryTaskBonus: number;
  merchantTaskBonus: number;
}

const emptyModifiers = (): ReligionModifiers => ({
  taxIncomePercent: 0, landTradeIncomePercent: 0, seaTradeIncomePercent: 0,
  foreignTradeIncomePercent: 0, settlementIncomePercent: 0, populationGrowthPercent: 0,
  buildingCostDiscount: 0, academyBuildingCostDiscount: 0, siegeAssetCostDiscount: 0,
  unitPurchaseDiscounts: [], unitUpkeepDiscounts: [], shipPurchaseDiscount: 0, shipUpkeepDiscount: 0,
  unrestReduction: 0, negativeEventRiskReduction: 0, starvationBonus: 0,
  landRaidIncomePercent: 0, spyDefenseBonus: 0, diplomatTaskBonus: 0, missionaryTaskBonus: 0, merchantTaskBonus: 0
});

const ALL_LAND = [
  "light_infantry","militia","slinger","spear","archer","heavy_infantry","light_cavalry","heavy_cavalry",
  "legionary","hoplite","horse_archer","camel_cavalry","briton_longbow","persian_immortal",
  "carthaginian_war_elephant","iberian_caetrati","germanic_shock_warrior","anatolian_thureophoroi",
  "triarii_veteran","punic_veteran","gaesatae","peltast","silver_shield","machimoi_phalangitai",
  "mauryan_war_elephant","desert_raider","egyptian_war_chariot","germanic_companion_cavalry",
  "balearic_slinger","sarmatian_longswordsmen","briton_noble_spearmen"
] as ReligionUnitType[];
const RANGED = ["slinger","archer","briton_longbow","balearic_slinger"] as ReligionUnitType[];
const CAVALRY = ["light_cavalry","heavy_cavalry","horse_archer","camel_cavalry","carthaginian_war_elephant","mauryan_war_elephant","desert_raider","egyptian_war_chariot","germanic_companion_cavalry"] as ReligionUnitType[];
const LIGHT_CAVALRY = ["light_cavalry","camel_cavalry","desert_raider"] as ReligionUnitType[];
const SPEAR_RANGED = ["spear","hoplite","triarii_veteran","silver_shield","machimoi_phalangitai","briton_noble_spearmen",...RANGED] as ReligionUnitType[];
const HEAVY_SPEAR = ["heavy_infantry","legionary","hoplite","persian_immortal","punic_veteran","gaesatae","sarmatian_longswordsmen","spear","triarii_veteran","silver_shield","machimoi_phalangitai","briton_noble_spearmen"] as ReligionUnitType[];
const CELTIC_UNITS = ["light_infantry","spear","peltast","iberian_caetrati","briton_noble_spearmen"] as ReligionUnitType[];

type PartialModifiers = Partial<Omit<ReligionModifiers,"unitPurchaseDiscounts"|"unitUpkeepDiscounts">> & {
  unitPurchaseDiscounts?: ReligionModifiers["unitPurchaseDiscounts"];
  unitUpkeepDiscounts?: ReligionModifiers["unitUpkeepDiscounts"];
};

export interface ReligionDefinition {
  label: string;
  localEffect: string;
  nationalEffect: string;
  local: PartialModifiers;
  national: PartialModifiers;
}

export interface SecondaryReligionDefinition {
  key: string;
  label: string;
  effect: string;
  modifiers: PartialModifiers;
}

export interface ReligionFamilyShare {
  religionKey: ReligionKey;
  primaryPercent: number;
  secondaryPercent: number;
}

export interface ReligionBeliefShare {
  religionKey: ReligionKey;
  religionLabel: string;
  primaryPercent: number;
  secondaryKey: string;
  secondaryLabel: string;
  secondaryPercent: number;
  familyPercent: number;
  active: boolean;
}

export const RELIGIONS: Record<ReligionKey, ReligionDefinition> = {
  CELTIC_FAITH: { label:"Kelt İnancı",localEffect:"Nüfus artışı +%6",nationalEffect:"Hafif piyade, ciritçi ve mızraklı bakımı -%3",local:{populationGrowthPercent:.06},national:{unitUpkeepDiscounts:[{discount:.03,units:CELTIC_UNITS}]} },
  GERMANIC_FAITH: { label:"Cermen İnancı",localEffect:"Kara birimi alım maliyeti -%5",nationalEffect:"Kara ordusu bakımı -%3",local:{unitPurchaseDiscounts:[{discount:.05,units:ALL_LAND}]},national:{unitUpkeepDiscounts:[{discount:.03,units:ALL_LAND}]} },
  IBERIAN_FAITH: { label:"İber İnancı",localEffect:"Menzilli birlik alım maliyeti -%5",nationalEffect:"Kara yağması kazancı +%5",local:{unitPurchaseDiscounts:[{discount:.05,units:RANGED}]},national:{landRaidIncomePercent:.05} },
  ROMAN_FAITH: { label:"Roma İnancı",localEffect:"Bina maliyeti -%5",nationalEffect:"Kara birimi alım maliyeti -%3",local:{buildingCostDiscount:.05},national:{unitPurchaseDiscounts:[{discount:.03,units:ALL_LAND}]} },
  ITALIC_FAITH: { label:"İtalik İnançlar",localEffect:"Halk vergisi geliri +%6",nationalEffect:"Yerleşke huzursuzluğu -3 puan",local:{taxIncomePercent:.06},national:{unrestReduction:3} },
  PUNIC_FAITH: { label:"Pön İnancı",localEffect:"Liman geliri +%8",nationalEffect:"Gemi alım ve bakım maliyeti -%3",local:{seaTradeIncomePercent:.08},national:{shipPurchaseDiscount:.03,shipUpkeepDiscount:.03} },
  LIBYAN_BERBER_FAITH: { label:"Libya-Berberi İnancı",localEffect:"Kara ticareti +%8",nationalEffect:"Hafif süvari ve deve süvarisi bakımı -%3",local:{landTradeIncomePercent:.08},national:{unitUpkeepDiscounts:[{discount:.03,units:LIGHT_CAVALRY}]} },
  HELLENIC_FAITH: { label:"Helen İnancı",localEffect:"Kara ticareti +%8",nationalEffect:"Akademi bina maliyeti -%5",local:{landTradeIncomePercent:.08},national:{academyBuildingCostDiscount:.05} },
  THRACO_ILLYRIAN_FAITH: { label:"Trak-İllirya İnancı",localEffect:"Mızraklı ve menzilli birlik alımı -%5",nationalEffect:"Aynı birliklerin bakımı -%3",local:{unitPurchaseDiscounts:[{discount:.05,units:SPEAR_RANGED}]},national:{unitUpkeepDiscounts:[{discount:.03,units:SPEAR_RANGED}]} },
  ZALMOXIAN_FAITH: { label:"Zalmoksis İnancı",localEffect:"Kuşatma erzak dayanıklılığı +1 tur",nationalEffect:"Yerleşke huzursuzluğu -3 puan",local:{starvationBonus:1},national:{unrestReduction:3} },
  SCYTHO_SARMATIAN_FAITH: { label:"İskit-Sarmat İnancı",localEffect:"Atlı birlik alımı -%5",nationalEffect:"Atlı birlik bakımı -%3",local:{unitPurchaseDiscounts:[{discount:.05,units:CAVALRY}]},national:{unitUpkeepDiscounts:[{discount:.03,units:CAVALRY}]} },
  BOSPORAN_SYNCRETISM: { label:"Bosporos Senkretizmi",localEffect:"Liman geliri +%8",nationalEffect:"Atlı birlik ve savaş gemisi bakımı -%2",local:{seaTradeIncomePercent:.08},national:{unitUpkeepDiscounts:[{discount:.02,units:CAVALRY}],shipUpkeepDiscount:.02} },
  BALTIC_FAITH: { label:"Baltık İnancı",localEffect:"Kara ticareti +%8",nationalEffect:"Menzilli birlik bakımı -%3",local:{landTradeIncomePercent:.08},national:{unitUpkeepDiscounts:[{discount:.03,units:RANGED}]} },
  ANATOLIAN_FAITHS: { label:"Anadolu İnançları",localEffect:"Olumsuz yerleşke olayı ihtimali -5 puan",nationalEffect:"Bina maliyeti -%3",local:{negativeEventRiskReduction:5},national:{buildingCostDiscount:.03} },
  ARMENIAN_FAITH: { label:"Ermeni İnancı",localEffect:"Kuşatma erzak dayanıklılığı +1 tur",nationalEffect:"Mızraklı ve ağır piyade bakımı -%3",local:{starvationBonus:1},national:{unitUpkeepDiscounts:[{discount:.03,units:HEAVY_SPEAR}]} },
  CAUCASIAN_FAITH: { label:"Kafkas İnancı",localEffect:"Nüfus artışı +%6",nationalEffect:"Yerleşke huzursuzluğu -3 puan",local:{populationGrowthPercent:.06},national:{unrestReduction:3} },
  PHOENICIAN_CANAANITE_FAITH: { label:"Fenike-Kenan İnancı",localEffect:"Liman geliri +%8",nationalEffect:"Dış ticaret geliri +%3",local:{seaTradeIncomePercent:.08},national:{foreignTradeIncomePercent:.03} },
  JUDAISM: { label:"Yahudilik",localEffect:"Yerleşke huzursuzluğu -5 puan",nationalEffect:"Kuşatma erzak dayanıklılığı +1 tur",local:{unrestReduction:5},national:{starvationBonus:1} },
  MESOPOTAMIAN_FAITH: { label:"Mezopotamya İnancı",localEffect:"Kara ticareti +%8",nationalEffect:"Kuşatma aleti üretim maliyeti -%3",local:{landTradeIncomePercent:.08},national:{siegeAssetCostDiscount:.03} },
  EGYPTIAN_FAITH: { label:"Mısır İnancı",localEffect:"Halk vergisi geliri +%6",nationalEffect:"Bina maliyeti -%3",local:{taxIncomePercent:.06},national:{buildingCostDiscount:.03} },
  KUSH_NUBIAN_FAITH: { label:"Kuş-Nubya İnancı",localEffect:"Nüfus artışı +%6",nationalEffect:"Menzilli birlik bakımı -%3",local:{populationGrowthPercent:.06},national:{unitUpkeepDiscounts:[{discount:.03,units:RANGED}]} },
  NABATAEAN_FAITH: { label:"Nabatî İnancı",localEffect:"Kara ticareti +%8",nationalEffect:"Deve ve hafif süvari bakımı -%3",local:{landTradeIncomePercent:.08},national:{unitUpkeepDiscounts:[{discount:.03,units:LIGHT_CAVALRY}]} },
  SOUTH_ARABIAN_FAITH: { label:"Güney Arabistan İnancı",localEffect:"Halk vergisi geliri +%6",nationalEffect:"Kara ve liman ticareti +%2",local:{taxIncomePercent:.06},national:{landTradeIncomePercent:.02,seaTradeIncomePercent:.02} },
  ZOROASTRIANISM: { label:"Zerdüştlük",localEffect:"Halk vergisi geliri +%6",nationalEffect:"Casusluk savunması +1",local:{taxIncomePercent:.06},national:{spyDefenseBonus:1} },
  HELLENO_IRANIAN_SYNCRETISM: { label:"Helen-İran Senkretizmi",localEffect:"Kara ticareti +%8",nationalEffect:"Diplomat ve tüccar görevlerine +1",local:{landTradeIncomePercent:.08},national:{diplomatTaskBonus:1,merchantTaskBonus:1} },
  BRAHMANISM: { label:"Brahmanizm",localEffect:"Halk vergisi geliri +%6",nationalEffect:"Yerleşke huzursuzluğu -3 puan",local:{taxIncomePercent:.06},national:{unrestReduction:3} },
  BUDDHISM: { label:"Budizm",localEffect:"Olumsuz yerleşke olayı ihtimali -5 puan",nationalEffect:"Diplomat görevlerine +1",local:{negativeEventRiskReduction:5},national:{diplomatTaskBonus:1} },
  JAINISM: { label:"Jainizm",localEffect:"Kara ticareti +%8",nationalEffect:"Tüccar görevlerine +1",local:{landTradeIncomePercent:.08},national:{merchantTaskBonus:1} },
  DRAVIDIAN_FAITHS: { label:"Dravid İnançları",localEffect:"Liman geliri +%8",nationalEffect:"Gemi bakım maliyeti -%3",local:{seaTradeIncomePercent:.08},national:{shipUpkeepDiscount:.03} },
  CHRISTIANITY: { label:"Hristiyanlık",localEffect:"Yerleşke toplam geliri +%5",nationalEffect:"Bina maliyeti -%5; Misyoner ve Diplomat görevlerine +1",local:{settlementIncomePercent:.05},national:{buildingCostDiscount:.05,diplomatTaskBonus:1,missionaryTaskBonus:1} }
};

export const SECONDARY_RELIGIONS: Record<ReligionKey, SecondaryReligionDefinition> = {
  CELTIC_FAITH: { key:"CELTIC_DRUIDIC_TRADITION",label:"Druidik Gelenek",effect:"Olumsuz yerleşke olayı ihtimali -2 puan",modifiers:{negativeEventRiskReduction:2} },
  GERMANIC_FAITH: { key:"GERMANIC_WODAN_CULT",label:"Wodan Savaşçı Kültü",effect:"Kara birimi alım maliyeti -%2",modifiers:{unitPurchaseDiscounts:[{discount:.02,units:ALL_LAND}]} },
  IBERIAN_FAITH: { key:"IBERIAN_ANCESTOR_CULT",label:"Atalar ve Kahramanlar Kültü",effect:"Kara yağması kazancı +%3",modifiers:{landRaidIncomePercent:.03} },
  ROMAN_FAITH: { key:"ROMAN_MARS_CULT",label:"Mars Kültü",effect:"Ağır piyade ve mızraklı alım maliyeti -%2",modifiers:{unitPurchaseDiscounts:[{discount:.02,units:HEAVY_SPEAR}]} },
  ITALIC_FAITH: { key:"ITALIC_LARES_PENATES",label:"Lares ve Penates Kültü",effect:"Nüfus artışı +%3",modifiers:{populationGrowthPercent:.03} },
  PUNIC_FAITH: { key:"PUNIC_TANIT_CULT",label:"Tanit Kültü",effect:"Yerleşke huzursuzluğu -2 puan",modifiers:{unrestReduction:2} },
  LIBYAN_BERBER_FAITH: { key:"BERBER_ANCESTOR_CULT",label:"Berberi Atalar Kültü",effect:"Hafif süvari ve deve süvarisi alımı -%2",modifiers:{unitPurchaseDiscounts:[{discount:.02,units:LIGHT_CAVALRY}]} },
  HELLENIC_FAITH: { key:"HELLENIC_ELEUSINIAN_MYSTERIES",label:"Eleusis Gizemleri",effect:"Yerleşke huzursuzluğu -2 puan",modifiers:{unrestReduction:2} },
  THRACO_ILLYRIAN_FAITH: { key:"THRACIAN_SABAZIOS_CULT",label:"Sabazios Kültü",effect:"Mızraklı ve menzilli birlik alımı -%2",modifiers:{unitPurchaseDiscounts:[{discount:.02,units:SPEAR_RANGED}]} },
  ZALMOXIAN_FAITH: { key:"ZALMOXIAN_GEBELEIZIS_CULT",label:"Gebeleizis Kültü",effect:"Olumsuz yerleşke olayı ihtimali -2 puan",modifiers:{negativeEventRiskReduction:2} },
  SCYTHO_SARMATIAN_FAITH: { key:"SCYTHIAN_HORSE_ANCESTOR_CULT",label:"Atlı Atalar Kültü",effect:"Atlı birlik alım maliyeti -%2",modifiers:{unitPurchaseDiscounts:[{discount:.02,units:CAVALRY}]} },
  BOSPORAN_SYNCRETISM: { key:"BOSPORAN_APATOUROS_CULT",label:"Apatouros Kültü",effect:"Liman geliri +%3",modifiers:{seaTradeIncomePercent:.03} },
  BALTIC_FAITH: { key:"BALTIC_SACRED_GROVES",label:"Kutsal Korular Geleneği",effect:"Nüfus artışı +%3",modifiers:{populationGrowthPercent:.03} },
  ANATOLIAN_FAITHS: { key:"ANATOLIAN_KYBELE_CULT",label:"Kybele Kültü",effect:"Bina maliyeti -%2",modifiers:{buildingCostDiscount:.02} },
  ARMENIAN_FAITH: { key:"ARMENIAN_ANAHIT_CULT",label:"Anahit Kültü",effect:"Halk vergisi geliri +%3",modifiers:{taxIncomePercent:.03} },
  CAUCASIAN_FAITH: { key:"CAUCASIAN_MOUNTAIN_ANCESTORS",label:"Dağ Ataları Kültü",effect:"Ağır piyade ve mızraklı bakımı -%2",modifiers:{unitUpkeepDiscounts:[{discount:.02,units:HEAVY_SPEAR}]} },
  PHOENICIAN_CANAANITE_FAITH: { key:"PHOENICIAN_MELQART_CULT",label:"Melqart Kültü",effect:"Dış ticaret geliri +%2",modifiers:{foreignTradeIncomePercent:.02} },
  JUDAISM: { key:"JUDAIC_TEMPLE_TRADITION",label:"Tapınak Geleneği",effect:"Yerleşke huzursuzluğu -2 puan",modifiers:{unrestReduction:2} },
  MESOPOTAMIAN_FAITH: { key:"MESOPOTAMIAN_MARDUK_CULT",label:"Marduk Kültü",effect:"Kuşatma aleti üretim maliyeti -%2",modifiers:{siegeAssetCostDiscount:.02} },
  EGYPTIAN_FAITH: { key:"EGYPTIAN_ISIS_CULT",label:"İsis Kültü",effect:"Nüfus artışı +%3",modifiers:{populationGrowthPercent:.03} },
  KUSH_NUBIAN_FAITH: { key:"KUSHITE_AMUN_CULT",label:"Napata Amun Kültü",effect:"Menzilli birlik alım maliyeti -%2",modifiers:{unitPurchaseDiscounts:[{discount:.02,units:RANGED}]} },
  NABATAEAN_FAITH: { key:"NABATAEAN_DUSHARA_CULT",label:"Düşara Kültü",effect:"Kara ticareti +%3",modifiers:{landTradeIncomePercent:.03} },
  SOUTH_ARABIAN_FAITH: { key:"SOUTH_ARABIAN_ALMAQAH_CULT",label:"Almaqah Kültü",effect:"Kara ve liman ticareti +%2",modifiers:{landTradeIncomePercent:.02,seaTradeIncomePercent:.02} },
  ZOROASTRIANISM: { key:"ZOROASTRIAN_FIRE_TEMPLE",label:"Ateş Tapınağı Geleneği",effect:"Yerleşke huzursuzluğu -2 puan",modifiers:{unrestReduction:2} },
  HELLENO_IRANIAN_SYNCRETISM: { key:"HELLENO_IRANIAN_MITHRA_CULT",label:"Mithra Kültü",effect:"Atlı birlik bakımı -%2",modifiers:{unitUpkeepDiscounts:[{discount:.02,units:CAVALRY}]} },
  BRAHMANISM: { key:"BRAHMANIC_BHAGAVATA_TRADITION",label:"Bhagavata Geleneği",effect:"Bina maliyeti -%2",modifiers:{buildingCostDiscount:.02} },
  BUDDHISM: { key:"BUDDHIST_STHAVIRA_TRADITION",label:"Sthavira Geleneği",effect:"Olumsuz yerleşke olayı ihtimali -2 puan",modifiers:{negativeEventRiskReduction:2} },
  JAINISM: { key:"JAIN_SRAMANA_COMMUNITY",label:"Şramana Cemaati",effect:"Dış ticaret geliri +%2",modifiers:{foreignTradeIncomePercent:.02} },
  DRAVIDIAN_FAITHS: { key:"DRAVIDIAN_MURUGAN_CULT",label:"Murugan Kültü",effect:"Mızraklı birlik alım maliyeti -%2",modifiers:{unitPurchaseDiscounts:[{discount:.02,units:SPEAR_RANGED}]} },
  CHRISTIANITY: { key:"CHRISTIAN_CATHOLICISM",label:"Katoliklik",effect:"Olumsuz yerleşke olayı ihtimali -5 puan",modifiers:{negativeEventRiskReduction:5} }
};

export type SecondaryReligionKey = (typeof SECONDARY_RELIGIONS)[ReligionKey]["key"];

export const RELIGION_CHOICES = Object.entries(RELIGIONS).map(([value,religion]) => ({name:religion.label,value:value as ReligionKey}));

export function isReligionKey(value: string): value is ReligionKey {
  return Object.prototype.hasOwnProperty.call(RELIGIONS,value);
}

export function religionEffectScale(adherencePercent: number): number {
  if (adherencePercent >= LOCAL_RELIGION_FULL_EFFECT_THRESHOLD) return 1;
  if (adherencePercent >= LOCAL_RELIGION_HALF_EFFECT_THRESHOLD) return .5;
  return 0;
}

export function secondaryReligionEffectScale(adherencePercent: number): number {
  if (adherencePercent >= SECONDARY_RELIGION_FULL_EFFECT_THRESHOLD) return 1;
  if (adherencePercent >= SECONDARY_RELIGION_HALF_EFFECT_THRESHOLD) return .5;
  return 0;
}

function addModifiers(target: ReligionModifiers, source: PartialModifiers, scale = 1): void {
  const numeric = ["taxIncomePercent","landTradeIncomePercent","seaTradeIncomePercent","foreignTradeIncomePercent","settlementIncomePercent",
    "populationGrowthPercent","buildingCostDiscount","academyBuildingCostDiscount","siegeAssetCostDiscount",
    "shipPurchaseDiscount","shipUpkeepDiscount","unrestReduction","negativeEventRiskReduction","starvationBonus",
    "landRaidIncomePercent","spyDefenseBonus","diplomatTaskBonus","missionaryTaskBonus","merchantTaskBonus"] as const;
  for (const key of numeric) target[key] += Number(source[key] ?? 0) * scale;
  for (const item of source.unitPurchaseDiscounts ?? []) target.unitPurchaseDiscounts.push({...item,discount:item.discount*scale});
  for (const item of source.unitUpkeepDiscounts ?? []) target.unitUpkeepDiscounts.push({...item,discount:item.discount*scale});
}

export function religionModifiers(religionKey: ReligionKey, adherencePercent: number, dominantReligionKey: ReligionKey | null): ReligionModifiers {
  const modifiers = emptyModifiers();
  const normalizedAdherence = Math.max(0,Math.min(100,Number(adherencePercent)));
  addModifiers(modifiers,RELIGIONS[religionKey].local,religionEffectScale(normalizedAdherence));
  addModifiers(modifiers,SECONDARY_RELIGIONS[religionKey].modifiers,secondaryReligionEffectScale(100-normalizedAdherence));
  if (dominantReligionKey) addModifiers(modifiers,RELIGIONS[dominantReligionKey].national,1);
  return modifiers;
}

const boundedPercent = (value: number): number => Math.max(0,Math.min(100,Number(value) || 0));

export function leadingReligionFamily(
  shares: ReadonlyArray<ReligionFamilyShare>,
  preferredReligionKey: ReligionKey | null = null
): ReligionFamilyShare | null {
  return [...shares]
    .map((share) => ({
      ...share,
      primaryPercent: boundedPercent(share.primaryPercent),
      secondaryPercent: boundedPercent(share.secondaryPercent)
    }))
    .filter((share) => share.primaryPercent+share.secondaryPercent>0)
    .sort((left,right) =>
      (right.primaryPercent+right.secondaryPercent)-(left.primaryPercent+left.secondaryPercent)
      || Number(right.religionKey===preferredReligionKey)-Number(left.religionKey===preferredReligionKey)
      || left.religionKey.localeCompare(right.religionKey)
    )[0] ?? null;
}

export function religionBeliefShares(
  shares: ReadonlyArray<ReligionFamilyShare>,
  preferredReligionKey: ReligionKey | null = null
): ReligionBeliefShare[] {
  const leading = leadingReligionFamily(shares,preferredReligionKey)?.religionKey ?? null;
  return shares
    .map((share) => {
      const primaryPercent=boundedPercent(share.primaryPercent);
      const secondaryPercent=boundedPercent(share.secondaryPercent);
      const secondary=SECONDARY_RELIGIONS[share.religionKey];
      return {
        religionKey:share.religionKey,religionLabel:RELIGIONS[share.religionKey].label,
        primaryPercent,secondaryKey:secondary.key,secondaryLabel:secondary.label,secondaryPercent,
        familyPercent:primaryPercent+secondaryPercent,active:share.religionKey===leading
      };
    })
    .filter((share)=>share.familyPercent>0)
    .sort((left,right)=>right.familyPercent-left.familyPercent||Number(right.active)-Number(left.active)||left.religionLabel.localeCompare(right.religionLabel,"tr"));
}

export function religionDistributionModifiers(
  shares: ReadonlyArray<ReligionFamilyShare>,
  dominantReligionKey: ReligionKey | null,
  preferredReligionKey: ReligionKey | null = null
): ReligionModifiers {
  const modifiers=emptyModifiers();
  const leading=leadingReligionFamily(shares,preferredReligionKey);
  if (leading) {
    addModifiers(modifiers,RELIGIONS[leading.religionKey].local,religionEffectScale(leading.primaryPercent));
    addModifiers(modifiers,SECONDARY_RELIGIONS[leading.religionKey].modifiers,secondaryReligionEffectScale(leading.secondaryPercent));
  }
  if (dominantReligionKey) addModifiers(modifiers,RELIGIONS[dominantReligionKey].national,1);
  return modifiers;
}

export function dominantReligionFromDistributions(
  settlements: ReadonlyArray<{population:number;shares:ReadonlyArray<ReligionFamilyShare>}>
): {key:ReligionKey;sharePercent:number}|null {
  const totalPopulation=settlements.reduce((sum,item)=>sum+Math.max(0,Number(item.population)),0);
  if (totalPopulation<=0) return null;
  const believers=new Map<ReligionKey,number>();
  for (const settlement of settlements) {
    const population=Math.max(0,Number(settlement.population));
    for (const share of settlement.shares) {
      const amount=population*boundedPercent(share.primaryPercent)/100;
      believers.set(share.religionKey,(believers.get(share.religionKey)??0)+amount);
    }
  }
  const first=[...believers.entries()].sort((left,right)=>right[1]-left[1]||left[0].localeCompare(right[0]))[0];
  if (!first) return null;
  const sharePercent=first[1]/totalPopulation*100;
  return sharePercent>=NATIONAL_RELIGION_EFFECT_THRESHOLD?{key:first[0],sharePercent}:null;
}

export function religionConversionPercent(successMargin:number):number {
  if (successMargin>=9) return 12;
  if (successMargin>=5) return 8;
  if (successMargin>=1) return 4;
  return 0;
}

const roundReligionPercent=(value:number):number=>Math.round(value*100)/100;

export function convertReligionDistribution(
  shares:ReadonlyArray<ReligionFamilyShare>,
  targetReligionKey:ReligionKey,
  successMargin:number
):ReligionFamilyShare[] {
  return convertReligionDistributionByPercent(shares,targetReligionKey,religionConversionPercent(successMargin));
}

export function convertReligionDistributionByPercent(
  shares:ReadonlyArray<ReligionFamilyShare>,
  targetReligionKey:ReligionKey,
  conversionPercent:number
):ReligionFamilyShare[] {
  const converted=shares.map((share)=>({
    religionKey:share.religionKey,
    primaryPercent:boundedPercent(share.primaryPercent),
    secondaryPercent:boundedPercent(share.secondaryPercent)
  }));
  let target=converted.find((share)=>share.religionKey===targetReligionKey);
  if (!target) {
    target={religionKey:targetReligionKey,primaryPercent:0,secondaryPercent:0};
    converted.push(target);
  }
  const requested=boundedPercent(conversionPercent);
  const available=converted.filter((share)=>share!==target).reduce((sum,share)=>sum+share.primaryPercent+share.secondaryPercent,0);
  let remaining=Math.min(requested,available);
  const actual=remaining;
  for (const source of converted.filter((share)=>share!==target).sort((left,right)=>(right.primaryPercent+right.secondaryPercent)-(left.primaryPercent+left.secondaryPercent))) {
    if (remaining<=0) break;
    const familyTotal=source.primaryPercent+source.secondaryPercent;
    const deduction=Math.min(remaining,familyTotal);
    const primaryDeduction=familyTotal>0?roundReligionPercent(deduction*source.primaryPercent/familyTotal):0;
    source.primaryPercent=roundReligionPercent(Math.max(0,source.primaryPercent-primaryDeduction));
    source.secondaryPercent=roundReligionPercent(Math.max(0,source.secondaryPercent-(deduction-primaryDeduction)));
    remaining=roundReligionPercent(remaining-deduction);
  }
  target.primaryPercent=roundReligionPercent(target.primaryPercent+actual*.75);
  target.secondaryPercent=roundReligionPercent(target.secondaryPercent+actual*.25);
  return converted.filter((share)=>share.primaryPercent+share.secondaryPercent>0);
}

export function secondaryReligionFor(religionKey: ReligionKey): SecondaryReligionDefinition {
  return SECONDARY_RELIGIONS[religionKey];
}

export function religionUnitDiscount(entries: ReligionModifiers["unitPurchaseDiscounts"], unitType: ReligionUnitType): number {
  return entries.reduce((sum,item)=>item.units.includes(unitType)?sum+item.discount:sum,0);
}

export function dominantReligion(settlements: ReadonlyArray<{ religion_key: ReligionKey; religion_adherence_percent: number; population: number }>): { key: ReligionKey; sharePercent: number } | null {
  const totalPopulation = settlements.reduce((sum,item)=>sum+Math.max(0,Number(item.population)),0);
  if (totalPopulation<=0) return null;
  const believers = new Map<ReligionKey,number>();
  for (const settlement of settlements) {
    const amount = Math.max(0,Number(settlement.population))*Math.max(0,Math.min(100,Number(settlement.religion_adherence_percent)))/100;
    believers.set(settlement.religion_key,(believers.get(settlement.religion_key)??0)+amount);
  }
  const first = [...believers.entries()].sort((left,right)=>right[1]-left[1]||left[0].localeCompare(right[0]))[0];
  if (!first) return null;
  const sharePercent = first[1]/totalPopulation*100;
  return sharePercent>=NATIONAL_RELIGION_EFFECT_THRESHOLD?{key:first[0],sharePercent}:null;
}

export function defaultReligionForCulture(culture: CultureGroup): ReligionKey {
  const map: Record<CultureGroup,ReligionKey> = {
    UNASSIGNED:"HELLENIC_FAITH",BRITTONIC:"CELTIC_FAITH",CELTIC:"CELTIC_FAITH",GERMANIC:"GERMANIC_FAITH",
    BALTIC:"BALTIC_FAITH",IBERIAN:"IBERIAN_FAITH",ITALIC:"ITALIC_FAITH",ILLYRO_PANNONIAN:"THRACO_ILLYRIAN_FAITH",
    DACO_GETIC:"ZALMOXIAN_FAITH",THRACIAN:"THRACO_ILLYRIAN_FAITH",HELLENIC:"HELLENIC_FAITH",PUNIC:"PUNIC_FAITH",
    BERBER:"LIBYAN_BERBER_FAITH",LIBYAN:"LIBYAN_BERBER_FAITH",EGYPTIAN:"EGYPTIAN_FAITH",KUSHITIC:"KUSH_NUBIAN_FAITH",
    HABESHA:"KUSH_NUBIAN_FAITH",ARABIAN:"NABATAEAN_FAITH",LEVANTINE:"PHOENICIAN_CANAANITE_FAITH",
    MESOPOTAMIAN:"MESOPOTAMIAN_FAITH",ANATOLIAN:"ANATOLIAN_FAITHS",ARMENIAN:"ARMENIAN_FAITH",
    CAUCASIAN:"CAUCASIAN_FAITH",SARMATIAN:"SCYTHO_SARMATIAN_FAITH",SCYTHIAN:"SCYTHO_SARMATIAN_FAITH",
    WEST_IRANIAN:"ZOROASTRIANISM",EAST_IRANIAN:"HELLENO_IRANIAN_SYNCRETISM",GANDHARAN:"BUDDHISM",
    MADHYADESHI:"BRAHMANISM",MAGADHAN:"BUDDHISM",KALINGAN:"BUDDHISM",MAHARASHTRI:"BRAHMANISM",
    ANDHRA:"BRAHMANISM",TAMIL:"DRAVIDIAN_FAITHS",SOUTHEAST_ASIAN:"BUDDHISM"
  };
  return map[culture];
}
