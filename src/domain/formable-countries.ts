import type { CharacterRole } from "./types.js";

export type FormableTier = 1 | 2 | 3;
export type FormableEffectScale = "MAJOR" | "MEDIUM" | "MINOR";

export const FORMABLE_TIER_LABELS: Record<FormableTier, string> = {
  1: "Tier 1",
  2: "Tier 2",
  3: "Tier 3"
};

const EFFECT_SCALE_LABELS: Record<FormableEffectScale, string> = {
  MAJOR: "🔴 Büyük",
  MEDIUM: "🟠 Orta",
  MINOR: "🟢 Hafif"
};

export interface FormableModifiers {
  unitDiscount?: number;
  infantryDiscount?: number;
  cavalryDiscount?: number;
  archerSlingerDiscount?: number;
  archerSlingerLightDiscount?: number;
  shipDiscount?: number;
  shipUpkeepDiscount?: number;
  shipTransportMultiplier?: number;
  navalClashBonus?: number;
  britonLongbowDamageBonusPerThousand?: number;
  stabilityRiskReduction?: number;
  buildingDiscount?: number;
  buildingDiscountTypes?: readonly string[];
  buildingDurationReduction?: number;
  incomePercent?: number;
  seaTradeIncomePercent?: number;
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
  mercenaryHireDiscount?: number;
  mercenaryUpkeepDiscount?: number;
  wallSiegeDamageMultiplier?: number;
  ruinStageTwoIncomeMultiplier?: number;
  slaveCampRates?: readonly [number, number, number];
}

export interface FormableCountryDefinition {
  name: string;
  emoji: string;
  tier?: FormableTier;
  buffs: readonly string[];
  effectScales?: readonly FormableEffectScale[];
  modifiers: FormableModifiers;
  requiredActiveFormable?: string;
  requiredActiveFormables?: readonly string[];
  foundingReward?: {
    shipsPerActiveShipyard: {
      shipType: "kerkouros" | "trireme" | "quinquereme";
      quantity: number;
    };
  };
  requiredTerritories?: readonly {
    label: string;
    settlementNames: readonly string[];
  }[];
}

export const FORMABLE_COUNTRIES = {
  BRITANNIA: {
    name: "Britanya",
    emoji: "🏴",
    buffs: [
      "Gemi alım maliyeti ve gemi bakımı %30 azalır.",
      "Briton Uzun Yaycıları, Okçu ve Sapancı alım maliyeti %10 azalır.",
      "Liman geliri %20 artar."
    ],
    modifiers: {
      archerSlingerDiscount: 0.10,
      shipDiscount: 0.30,
      shipUpkeepDiscount: 0.30,
      buildingIncomePercent: { port: 0.20 }
    },
    requiredTerritories: [
      { label: "Camulodunon", settlementNames: ["Camulodunon"] },
      { label: "Eborakon", settlementNames: ["Eborakon"] },
      { label: "Eildon", settlementNames: ["Eildon"] },
      { label: "Iska", settlementNames: ["Iska"] },
      { label: "Moridunon", settlementNames: ["Moridunon"] }
    ]
  },
  GREAT_BRITAIN: {
    name: "Büyük Britanya",
    emoji: "👑",
    tier: 2,
    buffs: [
      "Kraliyet Donanması: Gemi alımı ve bakımı %30 azalır; savaş gemilerinin asker taşıma kapasitesi %20 artar.",
      "Uzun Yay Üstünlüğü: Briton Uzun Yaycıları, Okçu ve Sapancı alımı %10 azalır; her 1.000 Briton Uzun Yaycısı hasar sonucuna +1 kazandırır.",
      "Britanya liman gelirleri %20 artar.",
      "Britanya yerleşkelerinin huzursuzluk ve isyan ihtimali 10 puan azalır."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: {
      archerSlingerDiscount: 0.10,
      shipDiscount: 0.30,
      shipUpkeepDiscount: 0.30,
      buildingIncomePercent: { port: 0.20 },
      shipTransportMultiplier: 1.20,
      britonLongbowDamageBonusPerThousand: 1,
      stabilityRiskReduction: 10
    },
    requiredActiveFormables: ["BRITANNIA"],
    requiredTerritories: [
      { label: "Camulodunon", settlementNames: ["Camulodunon"] },
      { label: "Eborakon", settlementNames: ["Eborakon"] },
      { label: "Eildon", settlementNames: ["Eildon"] },
      { label: "Iska", settlementNames: ["Iska"] },
      { label: "Moridunon", settlementNames: ["Moridunon"] },
      { label: "İrlanda (Eblana)", settlementNames: ["Eblana"] }
    ]
  },
  CELTIC_CONFEDERATION: {
    name: "Keltika Konfederasyonu", emoji: "🍀", tier: 2,
    buffs: [
      "Kelt Savaşçıları: Bütün piyade alımları %15 ucuzdur.",
      "Oppidum İnşası: Sur ve Curia binaları %15 ucuzdur.",
      "Oppidum Ekonomisi: Çiftlik ve Agora gelirleri %10 artar.",
      "Tahkimli Yerleşimler: Yerleşkeler açlığa 1 tur daha fazla dayanır."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { infantryDiscount: 0.15, buildingDiscount: 0.15, buildingDiscountTypes: ["walls", "curia"], buildingIncomePercent: { farm: 0.10, agora: 0.10 }, starvationBonus: 1 },
    requiredActiveFormables: ["GALLIC_CONFEDERATION", "BELGIAN_UNION"]
  },
  MAGNA_GERMANIA: {
    name: "Magna Germania", emoji: "🌲", tier: 2,
    buffs: [
      "Büyük Kabile Ordusu: Bütün piyade alımları %15 ucuzdur.",
      "Cermen Mühendisliği: Mühendislik Atölyesi ve kuşatma aletleri %15 ucuzdur.",
      "Üretici Kabileler: Çiftlik ve Curia gelirleri %10 artar.",
      "Dağınık Kaleler: Yerleşkeler açlığa 1 tur daha fazla dayanır."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { infantryDiscount: 0.15, buildingDiscount: 0.15, buildingDiscountTypes: ["engineering"], siegeAssetDiscount: 0.15, buildingIncomePercent: { farm: 0.10, curia: 0.10 }, starvationBonus: 1 },
    requiredActiveFormables: ["GERMANIC_UNION", "ALPINE_UNION"]
  },
  DANUBIAN_CONFEDERATION: {
    name: "Tuna Konfederasyonu", emoji: "🐺", tier: 2,
    buffs: [
      "Tuna Süvarileri: Bütün süvari alımları %15 ucuzdur.",
      "Tuna Donanması: Gemi alım ve bakım maliyetleri %15 azalır.",
      "Nehir ve Kıyı Nakliyesi: Gemilerin asker taşıma kapasitesi %15 artar.",
      "Tuna Tarımı: Çiftlik gelirleri %5 artar."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { cavalryDiscount: 0.15, shipDiscount: 0.15, shipUpkeepDiscount: 0.15, shipTransportMultiplier: 1.15, buildingIncomePercent: { farm: 0.05 } },
    requiredActiveFormables: ["PANNONIA", "ILLYRIA", "DACIA", "THRACE"]
  },
  HISPANIA: {
    name: "Hispania", emoji: "🐂", tier: 2,
    buffs: [
      "İber Hafif Orduları: Okçu, Sapancı ve Hafif Piyade alımları %15 ucuzdur.",
      "Maden ve Kuşatma Ustaları: Mühendislik Atölyesi %15, kuşatma aletleri %20 ucuzdur.",
      "Yarımada Ticareti: Bütün yerleşke gelirleri %5 artar.",
      "İber Öncüleri: Gözcü birliği için gereken etkin süvari 100'e düşer."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { archerSlingerLightDiscount: 0.15, buildingDiscount: 0.15, buildingDiscountTypes: ["engineering"], siegeAssetDiscount: 0.20, incomePercent: 0.05, observerManpower: 100 },
    requiredActiveFormables: ["IBERIA"]
  },
  GALLIC_CONFEDERATION: { name: "Galya Konfederasyonu", emoji: "🐗", buffs: ["Piyade alımı %10 ucuzdur.", "Galya içindeki ordu hareketi %25 hızlıdır.", "Kuşatmadaki Curia Sv2+ yerleşke 500 geçici milis kazanır.", "Çiftlik ve Agora gelirleri %5 artar."], modifiers: { infantryDiscount: 0.10, buildingIncomePercent: { farm: 0.05, agora: 0.05 } } },
  BELGIAN_UNION: { name: "Belçika Birliği", emoji: "🛡️", buffs: ["Yıkılan sur ve kapı 1 turda onarılır.", "Politika ve olaylardan gelen milis %20 artar.", "Bölgedeki yağma nüfus ve gelir kaybı %25 azalır."], modifiers: { policyMilitiaMultiplier: 1.20 } },
  GERMANIC_UNION: { name: "Cermenya Birliği", emoji: "⚔️", buffs: ["Gözcüler orman cezasını yok sayar.", "Piyade alımı %10 ucuzdur.", "Cermen yağmalarındaki nüfus ve köle kaybı %25 azalır.", "Zorunlu Askerlik 5.000 milis için 4.000 nüfus harcar."], modifiers: { infantryDiscount: 0.10 } },
  IBERIA: { name: "İberya", emoji: "🐂", buffs: ["Kara yağması zarlarına +1.", "Okçu, Sapancı ve Hafif Piyade alımı %5 ucuzdur.", "Yağma ve köle taşıma kapasitesi %25 artar.", "Mühendislik Atölyesi ve kuşatma aletleri %10 ucuzdur."], modifiers: { archerSlingerLightDiscount: 0.05, buildingDiscount: 0.10, buildingDiscountTypes: ["engineering"], siegeAssetDiscount: 0.10 } },
  ITALY: { name: "İtalya", emoji: "🦅", buffs: ["İtalya içindeki hareket %25 hızlıdır.", "Bütün asker alımları %5 ucuzdur.", "Bina yapım süresi 1 tur kısalır.", "Curia politikası Alım Turu beklemeden değiştirilebilir."], modifiers: { unitDiscount: 0.05, buildingDurationReduction: 1 } },
  ALPINE_UNION: { name: "Alp Birliği", emoji: "🏔️", buffs: ["Gözcüler dağ cezasını yok sayar.", "Yerleşkeler açlığa +2 tur dayanır.", "Mühendislik Atölyesi ve savaş aletleri %10 ucuzdur."], modifiers: { starvationBonus: 2, buildingDiscount: 0.10, buildingDiscountTypes: ["engineering"], siegeAssetDiscount: 0.10 } },
  PANNONIA: { name: "Pannonia", emoji: "🐎", buffs: ["Gözcü için gerekli süvari 100'e düşer.", "Süvari alımı %5 ucuzdur.", "Savaş Hazırlığı milisi 750 olur."], modifiers: { observerManpower: 100, cavalryDiscount: 0.05, warPreparationMilitia: 750 } },
  ILLYRIA: { name: "İllirya", emoji: "🌊", buffs: ["Her Tersane kapasitesine +2 Kerkouros ekler.", "Kıyı yağması zarlarına +1.", "Gemi taşıma kapasitesi %10 artar."], modifiers: { shipyardPointBonus: { kerkouros: 2 }, shipTransportMultiplier: 1.10 } },
  DACIA: { name: "Dakya", emoji: "🐺", buffs: ["Köle Kampı isyan ihtimali 5 puan azalır.", "Köle Kampı gelir oranları %30/%45/%95 olur.", "Çiftlik geliri %10 artar."], modifiers: { slaveCampRates: [0.30, 0.45, 0.95], buildingIncomePercent: { farm: 0.10 } } },
  THRACE: { name: "Trakya", emoji: "🗡️", buffs: ["Kara birlikleri %5 ucuzdur.", "Kara yağması zarlarına +1.", "Savaş Hazırlığı 250 ek milis verir."], modifiers: { unitDiscount: 0.05, warPreparationMilitia: 750 } },
  MACEDONIA: { name: "Makedonya", emoji: "☀️", buffs: ["Süvari alımı %5 ucuzdur.", "Akademiden yetişen Komutanlar +1 ek özellik puanı alır."], modifiers: { cavalryDiscount: 0.05, academyRoleSkillBonus: { COMMANDER: 1 } } },
  HELLAS: { name: "Hellas", emoji: "🏛️", buffs: ["Akademi bakımı 250 Altındır.", "Agora sabit geliri %10 artar.", "Her Tersane kapasitesine +1 Trireme ekler."], modifiers: { academyUpkeep: 250, buildingIncomePercent: { agora: 0.10 }, shipyardPointBonus: { trireme: 1 } } },
  MEDITERRANEAN_LEAGUE: {
    name: "Akdeniz Ligi",
    emoji: "🔱",
    buffs: [
      "Deniz Ticareti gelirleri %10 artar.",
      "Gemi alım maliyeti ve gemi bakımı %10 azalır.",
      "Gemi taşıma kapasitesi %10 artar."
    ],
    modifiers: {
      seaTradeIncomePercent: 0.10,
      shipDiscount: 0.10,
      shipUpkeepDiscount: 0.10,
      shipTransportMultiplier: 1.10
    },
    requiredTerritories: [
      { label: "Kıbrıs", settlementNames: ["Salamis", "Kıbrıs"] },
      { label: "Rodos", settlementNames: ["Rodos"] },
      { label: "Hierapytna", settlementNames: ["Hierapytna"] }
    ]
  },
  ROMAN_REPUBLIC: {
    name: "Roma Cumhuriyeti", emoji: "🦅", tier: 2,
    buffs: [
      "Lejyon Seferberliği: Bütün asker alımları %10 ucuzdur.",
      "Roma İnşa Düzeni: Bütün binalar %10 ucuzdur ve yapım süreleri 1 tur azalır.",
      "Cumhuriyet İdaresi: Her aktif Curia +150 Altın gelir sağlar.",
      "Hukuk Düzeni: Huzursuzluk ve isyan ihtimali 5 puan azalır."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { unitDiscount: 0.10, buildingDiscount: 0.10, buildingDurationReduction: 1, curiaFlatIncome: 150, stabilityRiskReduction: 5 },
    requiredActiveFormables: ["ITALY"]
  },
  PUNIC_EMPIRE: {
    name: "Pön İmparatorluğu", emoji: "🐘", tier: 2,
    buffs: [
      "Pön Deniz Hegemonyası: Gemi alım ve bakım maliyetleri %20 azalır.",
      "Paralı İmparatorluk: Paralı asker kiralama bedeli ve bakım giderleri %20 azalır.",
      "Batı Akdeniz Ticareti: Liman gelirleri %25 artar.",
      "Deniz Nakliyesi: Gemilerin asker taşıma kapasitesi %15 artar."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { shipDiscount: 0.20, shipUpkeepDiscount: 0.20, buildingIncomePercent: { port: 0.25 }, mercenaryHireDiscount: 0.20, mercenaryUpkeepDiscount: 0.20, shipTransportMultiplier: 1.15 },
    requiredActiveFormables: ["CARTHAGE", "MAURETANIA", "LIBYA"]
  },
  HELLENISTIC_LEAGUE: {
    name: "Helenistik Birlik", emoji: "☀️", tier: 2,
    buffs: [
      "Kraliyet Subay Okulları: Akademide yetişen Komutanlar +2 ek özellik puanı kazanır.",
      "Hetairoi Geleneği: Bütün süvari alımları %15 ucuzdur.",
      "Helen Akademileri: Akademi bakım maliyeti 250 Altın olur.",
      "Polis Ekonomisi: Agora gelirleri %10 artar."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { academyRoleSkillBonus: { COMMANDER: 2 }, cavalryDiscount: 0.15, academyUpkeep: 250, buildingIncomePercent: { agora: 0.10 } },
    requiredActiveFormables: ["MACEDONIA", "HELLAS", "MEDITERRANEAN_LEAGUE"]
  },
  ANATOLIAN_KINGDOM: {
    name: "Anadolu Krallığı", emoji: "🏰", tier: 2,
    buffs: [
      "Anadolu Ustaları: Sur ve Mühendislik Atölyesi %15, kuşatma aletleri %15 ucuzdur.",
      "Yüksek Kaleler: Yerleşkeler açlığa 2 tur daha dayanır ve surların aldığı kuşatma hasarı %15 azalır.",
      "Anadolu Limanları: Her aktif Liman +150 Altın gelir sağlar.",
      "Kıyı Tersaneleri: Gemi alımları %5 ucuzdur."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { buildingDiscount: 0.15, buildingDiscountTypes: ["walls", "engineering"], siegeAssetDiscount: 0.15, starvationBonus: 2, wallSiegeDamageMultiplier: 0.85, portFlatIncome: 150, shipDiscount: 0.05 },
    requiredActiveFormables: ["CILICIA_CYPRUS", "LYDIA_IONIA", "CAPPADOCIA"]
  },
  CARTHAGE: {
    name: "Büyük Kartaca",
    emoji: "🐘",
    buffs: [
      "Kuruluşta aktif Tersanesi bulunan her yerleşke ücretsiz 2 Kerkouros kazanır; bu ödül yalnızca bir kez uygulanır.",
      "Liman geliri %20 artar.",
      "Paralı asker kiralama bedeli ve bakım giderleri %10 azalır."
    ],
    modifiers: {
      buildingIncomePercent: { port: 0.20 },
      mercenaryHireDiscount: 0.10,
      mercenaryUpkeepDiscount: 0.10
    },
    foundingReward: {
      shipsPerActiveShipyard: { shipType: "kerkouros", quantity: 2 }
    }
  },
  BLACK_SEA_EMPIRE: {
    name: "Karadeniz İmparatorluğu", emoji: "🌊", tier: 2,
    buffs: [
      "Bozkır Orduları: Bütün süvari alımları %15 ucuzdur.",
      "Tahıl ve Boğaz Ağı: Çiftlik ve Liman gelirleri %15 artar.",
      "Karadeniz Filosu: Gemi alımı ve bakımı %10 azalır.",
      "Göçebe Öncüler: Gözcü birliği için gereken etkin süvari 100'e düşer."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { cavalryDiscount: 0.15, buildingIncomePercent: { farm: 0.15, port: 0.15 }, shipDiscount: 0.10, shipUpkeepDiscount: 0.10, observerManpower: 100 },
    requiredActiveFormables: ["PONTUS", "BOSPORAN_KINGDOM", "SARMATIA", "SCYTHIA"]
  },
  GREATER_ARMENIA: {
    name: "Büyük Ermenistan", emoji: "⛰️", tier: 2,
    buffs: [
      "Ermeni Süvarileri: Bütün süvari alımları %15 ucuzdur.",
      "Kafkas Kaleleri: Yerleşkeler açlığa 2 tur daha dayanır ve surların aldığı kuşatma hasarı %20 azalır.",
      "Dağ Mühendisleri: Sur ve Mühendislik Atölyesi %10 ucuzdur.",
      "Dağ Gözcüleri: Gözcü birliği için gereken etkin süvari 100'e düşer."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { cavalryDiscount: 0.15, starvationBonus: 2, wallSiegeDamageMultiplier: 0.80, buildingDiscount: 0.10, buildingDiscountTypes: ["walls", "engineering"], observerManpower: 100 },
    requiredActiveFormables: ["ARMENIA", "CAUCASUS"]
  },
  NILE_EMPIRE: {
    name: "Nil İmparatorluğu", emoji: "𓂀", tier: 2,
    buffs: [
      "Nil Taşkınları: Çiftlik gelirleri %25 artar.",
      "Nehir Nüfusu: Bina ve doğal yollarla kazanılan nüfus %20 artar.",
      "Nil Okçuları: Okçu ve Sapancı alımları %10 ucuzdur.",
      "Tahıl Depoları: Yerleşkeler açlığa 1 tur daha fazla dayanır."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { buildingIncomePercent: { farm: 0.25 }, populationGainPercent: 0.20, archerSlingerDiscount: 0.10, starvationBonus: 1 },
    requiredActiveFormables: ["EGYPT", "KUSH"]
  },
  NEO_ASSYRIAN_EMPIRE: {
    name: "Yeni Asur İmparatorluğu", emoji: "🦁", tier: 2,
    buffs: [
      "Asur Kuşatma Teşkilatı: Mühendislik Atölyesi %15, kuşatma aletleri %20 ucuzdur.",
      "Bereketli Hilal: Çiftlik ve Ticaret Loncası gelirleri %15 artar.",
      "Kraliyet Depoları: Yerleşkeler açlığa 2 tur daha fazla dayanır.",
      "Levant Limanları: Her aktif Liman +100 Altın gelir sağlar."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { buildingDiscount: 0.15, buildingDiscountTypes: ["engineering"], siegeAssetDiscount: 0.20, buildingIncomePercent: { farm: 0.15, trade_guild: 0.15 }, starvationBonus: 2, portFlatIncome: 100 },
    requiredActiveFormables: ["MESOPOTAMIA", "PHOENICIA_ARAM"]
  },
  MAURETANIA: { name: "Mauretanya", emoji: "🦁", buffs: ["Bütün yerleşke gelirleri %2 artar.", "Liman geliri %10 artar.", "Haraplık ikinci aşama toparlanması %60 olur."], modifiers: { incomePercent: 0.02, buildingIncomePercent: { port: 0.10 }, ruinStageTwoIncomeMultiplier: 0.60 } },
  LIBYA: { name: "Libya", emoji: "🌴", buffs: ["Çiftlik, Su Kemeri ve Liman gelirleri %10 artar.", "Haraplık ikinci aşama toparlanması %75 olur.", "Su Kemeri %10 ucuzdur."], modifiers: { buildingIncomePercent: { farm: 0.10, aqueduct: 0.10, port: 0.10 }, buildingDiscount: 0.10, buildingDiscountTypes: ["aqueduct"], ruinStageTwoIncomeMultiplier: 0.75 } },
  EGYPT: { name: "Mısır", emoji: "𓂀", buffs: ["Çiftlik sabit geliri %20 artar.", "Bina ve doğal nüfus artışı %10 yükselir."], modifiers: { buildingIncomePercent: { farm: 0.20 }, populationGainPercent: 0.10 } },
  KUSH: { name: "Kuş Krallığı", emoji: "☀️", buffs: ["Okçu ve Sapancı alımı %5 ucuzdur.", "Panteon %10 ucuzdur; salgın koruması Sv1'de başlar."], modifiers: { archerSlingerDiscount: 0.05, buildingDiscount: 0.10, buildingDiscountTypes: ["pantheon"] } },
  ARABIAN_EMPIRE: {
    name: "Arabistan İmparatorluğu", emoji: "🐪", tier: 2,
    buffs: [
      "Büyük Kervan Ağı: Agora, Liman ve Ticaret Loncası gelirleri %15 artar.",
      "Çöl Süvarileri: Bütün süvari alımları %15 ucuzdur.",
      "Vaha Şehirleri: Su Kemeri %15 ucuzdur ve yerleşkeler açlığa 2 tur daha dayanır.",
      "Çöl İdaresi: Huzursuzluk ve isyan ihtimali 5 puan azalır."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { buildingIncomePercent: { agora: 0.15, port: 0.15, trade_guild: 0.15 }, cavalryDiscount: 0.15, buildingDiscount: 0.15, buildingDiscountTypes: ["aqueduct"], starvationBonus: 2, stabilityRiskReduction: 5 },
    requiredActiveFormables: ["ARABIAN_CONFEDERATION"]
  },
  ERANSHAHR: {
    name: "İranşahr", emoji: "🔥", tier: 2,
    buffs: [
      "İran Süvarileri: Bütün süvari alımları %15 ucuzdur.",
      "Satraplık İnşası: Bütün binalar %10 ucuzdur.",
      "Kraliyet İdaresi: Her aktif Curia +150 Altın gelir sağlar.",
      "Satraplık Düzeni: Huzursuzluk ve isyan ihtimali 5 puan azalır."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { cavalryDiscount: 0.15, buildingDiscount: 0.10, curiaFlatIncome: 150, stabilityRiskReduction: 5 },
    requiredActiveFormables: ["PARTHIAN_KINGDOM", "MEDIA", "PERSIS", "GEDROSIA_CARMANIA"]
  },
  GRECO_BACTRIAN_KINGDOM: {
    name: "Greko-Baktriya Krallığı", emoji: "🐫", tier: 2,
    buffs: [
      "Doğu Orduları: Süvari, Okçu ve Sapancı alımları %10 ucuzdur.",
      "İpek Yolu Merkezleri: Agora ve Ticaret Loncası gelirleri %15 artar.",
      "Tüccar Okulları: Akademide yetişen Tüccarlar +1 ek özellik puanı kazanır.",
      "Helen-İran Akademileri: Akademi bakım maliyeti 400 Altın olur."
    ],
    effectScales: ["MAJOR", "MAJOR", "MEDIUM", "MINOR"],
    modifiers: { cavalryDiscount: 0.10, archerSlingerDiscount: 0.10, buildingIncomePercent: { agora: 0.15, trade_guild: 0.15 }, academyRoleSkillBonus: { MERCHANT: 1 }, academyUpkeep: 400 },
    requiredActiveFormables: ["BACTRIA", "SOGDIANA", "CHORASMIA", "ARYANA"]
  },
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

export function formableTier(key: FormableCountryKey | null | undefined): FormableTier {
  if (!key) return 1;
  const definition: FormableCountryDefinition = FORMABLE_COUNTRIES[key];
  return definition.tier ?? 1;
}

export function formableEffectLines(key: FormableCountryKey): string[] {
  const definition: FormableCountryDefinition = FORMABLE_COUNTRIES[key];
  return definition.buffs.map((buff, index) => {
    const scale = definition.effectScales?.[index];
    return scale ? `${EFFECT_SCALE_LABELS[scale]} — ${buff}` : buff;
  });
}

export function formableKeysForTier(tier: FormableTier): FormableCountryKey[] {
  return (Object.keys(FORMABLE_COUNTRIES) as FormableCountryKey[]).filter((key) => formableTier(key) === tier);
}

export function isFormableCountryKey(value: string): value is FormableCountryKey {
  return Object.prototype.hasOwnProperty.call(FORMABLE_COUNTRIES, value);
}

export function formableModifiers(key: FormableCountryKey | null | undefined): FormableModifiers {
  return key ? FORMABLE_COUNTRIES[key]?.modifiers ?? {} : {};
}

function normalizeTerritoryName(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export function missingFormableTerritories(
  key: FormableCountryKey,
  ownedSettlementNames: readonly string[]
): string[] {
  const owned = new Set(ownedSettlementNames.map(normalizeTerritoryName));
  const definition: FormableCountryDefinition = FORMABLE_COUNTRIES[key];
  return (definition.requiredTerritories ?? [])
    .filter((requirement) => !requirement.settlementNames.some((name) => owned.has(normalizeTerritoryName(name))))
    .map((requirement) => requirement.label);
}

export function applyFormableShipUpkeepDiscount(baseUpkeep: number, key: FormableCountryKey | null | undefined): number {
  const discount = Math.max(0, Math.min(1, formableModifiers(key).shipUpkeepDiscount ?? 0));
  return Math.ceil(Math.max(0, baseUpkeep) * (1 - discount));
}

const infantry = new Set(["light_infantry", "slinger", "spear", "archer", "heavy_infantry", "legionary", "hoplite", "briton_longbow", "persian_immortal", "iberian_caetrati", "germanic_shock_warrior", "anatolian_thureophoroi", "triarii_veteran", "punic_veteran", "gaesatae", "peltast", "silver_shield", "machimoi_phalangitai"]);
const cavalry = new Set(["light_cavalry", "heavy_cavalry", "horse_archer", "camel_cavalry", "carthaginian_war_elephant", "mauryan_war_elephant", "desert_raider", "egyptian_war_chariot"]);

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
