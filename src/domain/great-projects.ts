import type { CharacterRole } from "./types.js";

export type GreatProjectKey =
  | "RHODES_COLOSSUS" | "PERGAMON_ALTAR" | "PANTICAPAION_ACROPOLIS" | "CAMULODUNON_OPPIDUM"
  | "CARTHAGE_COTHON" | "SARMIZEGETUSA_CITADEL" | "CORDUBA_BRIDGE" | "CARNUTES_NEMETON"
  | "ASCAUCALIS_AMBER_EXCHANGE" | "PETRA_WATERWORKS" | "GIZA_PYRAMID_COMPLEX" | "PERSEPOLIS_APADANA"
  | "SINOPE_GREAT_HARBOR" | "COLOSSEUM" | "BAM_CITADEL" | "TEMPLE_OF_ARTEMIS"
  | "MARIB_DAM" | "SEMNONES_SACRED_GROVE" | "ATHENS_ACROPOLIS" | "AMARAVATI_STUPA"
  | "CHAMPA_TRADE_GATES" | "TAXILA_GREAT_ACADEMY" | "AYODHYA_ROYAL_COMPLEX" | "MEKONG_STRAIT_HARBOR"
  | "MALAYA_MARITIME_EXCHANGE" | "HASTINAPURA_WALLS" | "MADURAI_SANGAM" | "KANCHIPURAM_TEMPLE_CITY"
  | "BHARUKACCHA_DOCKS" | "VARANASI_SACRED_COMPLEX" | "TAMRALIPTI_OCEAN_HARBOR"
  | "BAIKAL_ANCESTOR_SHRINE" | "MINUSINSK_KURGAN" | "OTUKEN_SANCTUARY" | "HULUN_HORSE_STUD"
  | "DAVAN_CARAVANSERAI" | "KASHGAR_GREAT_BAZAAR" | "KHENTII_ANCESTOR_SHRINE" | "KHINGAN_BORDER_MARKET"
  | "ONON_TOY_GROUND" | "YARLUNG_TERRACES" | "SOLOKHA_ROYAL_KURGAN" | "ARZHAN_NECROPOLIS"
  | "ILI_HEAVENLY_HORSE_PASTURES" | "XIANBEI_GREAT_CAMP" | "LONGCHENG_KURULTAI"
  | "GOTALAND_ROYAL_HALL" | "VIKEN_WAR_BOAT_HALL" | "NERTHUS_SACRED_GROVE" | "SVEAR_GREAT_THING";

export interface GreatProjectModifiers {
  incomePercent?: number;
  taxIncomePercent?: number;
  landTradeIncomePercent?: number;
  seaTradeIncomePercent?: number;
  portIncomePercent?: number;
  tradeIncomePercent?: number;
  merchantReturnPercent?: number;
  tributeIncomePercent?: number;
  populationGrowthPercent?: number;
  buildingCostDiscount?: number;
  unitPurchaseDiscount?: number;
  infantryPurchaseDiscount?: number;
  cavalryPurchaseDiscount?: number;
  steppePurchaseDiscount?: number;
  garrisonPurchaseDiscount?: number;
  shipPurchaseDiscount?: number;
  hjortspringPurchaseDiscount?: number;
  landUpkeepDiscount?: number;
  cavalryUpkeepDiscount?: number;
  steppeUpkeepDiscount?: number;
  garrisonUpkeepDiscount?: number;
  shipUpkeepDiscount?: number;
  rebellionResistance?: number;
  militaryLimitPercent?: number;
  settlementDefenseRoll?: number;
  characterCapacity?: number;
  taskRollBonus?: Partial<Record<CharacterRole, number>>;
  cultureTaskRollBonus?: number;
  religionTaskRollBonus?: number;
  successfulTaskExtraProgress?: number;
}

export interface GreatProjectDefinition {
  key: GreatProjectKey;
  name: string;
  settlementNames: readonly string[];
  cost: number;
  duration: number;
  effects: readonly string[];
  modifiers: GreatProjectModifiers;
}

export const GREAT_PROJECT_COST_REDUCTION = 10_000;

const project = (
  key: GreatProjectKey, name: string, settlementNames: readonly string[], cost: number,
  effects: readonly string[], modifiers: GreatProjectModifiers
): GreatProjectDefinition => ({ key, name, settlementNames, cost: cost - GREAT_PROJECT_COST_REDUCTION, duration: 6, effects, modifiers });

export const GREAT_PROJECTS: readonly GreatProjectDefinition[] = [
  project("RHODES_COLOSSUS","Rodos Heykeli",["Rodos"],75_000,["Liman geliri +%15","Gemi bakım maliyeti -%10","Tüccar görev getirisi +%10"],{portIncomePercent:.15,shipUpkeepDiscount:.10,merchantReturnPercent:.10}),
  project("PERGAMON_ALTAR","Bergama Büyük Sunağı",["Bergama"],70_000,["Kültür değiştirme görev zarına +2","Toplam karakter kapasitesi +10","Yerleşke geliri +%10"],{cultureTaskRollBonus:2,characterCapacity:10,incomePercent:.10}),
  project("PANTICAPAION_ACROPOLIS","Pantikapion Akropolü",["Pantikapaion","Pantikapion"],65_000,["Kara ve deniz ticareti geliri +%12","Yerleşke savaşlarında savunma zarına +2"],{landTradeIncomePercent:.12,seaTradeIncomePercent:.12,settlementDefenseRoll:2}),
  project("CAMULODUNON_OPPIDUM","Camulodunon Kraliyet Oppidumu",["Camulodunon"],60_000,["Kara birimi alım maliyeti -%10","İsyan direnci +8","Yerleşke savaşlarında savunma zarına +1"],{unitPurchaseDiscount:.10,rebellionResistance:8,settlementDefenseRoll:1}),
  project("CARTHAGE_COTHON","Kartaca Cothon’u",["Kartaca"],80_000,["Gemi alım maliyeti -%12","Gemi bakım maliyeti -%10","Liman geliri +%15"],{shipPurchaseDiscount:.12,shipUpkeepDiscount:.10,portIncomePercent:.15}),
  project("SARMIZEGETUSA_CITADEL","Sarmizegetusa Kutsal Hisarları",["Zarmizegetusa","Sarmizegetusa"],70_000,["Yerleşke savaşlarında savunma zarına +2","Kara ordusu bakım maliyeti -%8","İsyan direnci +8"],{settlementDefenseRoll:2,landUpkeepDiscount:.08,rebellionResistance:8}),
  project("CORDUBA_BRIDGE","Kartuba Taş Köprüsü",["Kartuba"],65_000,["Kara ticareti geliri +%15","Bina inşa maliyeti -%10"],{landTradeIncomePercent:.15,buildingCostDiscount:.10}),
  project("CARNUTES_NEMETON","Karnut Büyük Nemetonu",["Treverorum"],60_000,["Din değiştirme görev zarına +2","İsyan direnci +10","Nüfus artışı +%5"],{religionTaskRollBonus:2,rebellionResistance:10,populationGrowthPercent:.05}),
  project("ASCAUCALIS_AMBER_EXCHANGE","Ascaucalis Kehribar Borsası",["Ascaucalis"],65_000,["Kara ticareti geliri +%15","Tüccar görev getirisi +%15"],{landTradeIncomePercent:.15,merchantReturnPercent:.15}),
  project("PETRA_WATERWORKS","Petra Su Kanalları",["Petra"],75_000,["Nüfus artışı +%10","Yerleşke geliri +%10","Bina inşa maliyeti -%8"],{populationGrowthPercent:.10,incomePercent:.10,buildingCostDiscount:.08}),
  project("GIZA_PYRAMID_COMPLEX","Gize Piramitler Külliyesi",["Memphis"],80_000,["Nüfus artışı +%10","İsyan direnci +12","Vergi geliri +%8"],{populationGrowthPercent:.10,rebellionResistance:12,taxIncomePercent:.08}),
  project("PERSEPOLIS_APADANA","Persepolis Apadana Sarayı",["Persepolis"],80_000,["Yerleşke geliri +%12","Vassal ve haraç geliri +%15","İsyan direnci +8"],{incomePercent:.12,tributeIncomePercent:.15,rebellionResistance:8}),
  project("SINOPE_GREAT_HARBOR","Sinop Büyük Limanı",["Sinop"],70_000,["Liman geliri +%15","Gemi alım maliyeti -%10","Ticaret geliri +%8"],{portIncomePercent:.15,shipPurchaseDiscount:.10,tradeIncomePercent:.08}),
  project("COLOSSEUM","Kolezyum",["Roma"],80_000,["İsyan direnci +12","Kara birimi alım maliyeti -%10","Yerleşke geliri +%8"],{rebellionResistance:12,unitPurchaseDiscount:.10,incomePercent:.08}),
  project("BAM_CITADEL","Bam Kalesi",["Bam"],65_000,["Yerleşke savaşlarında savunma zarına +2","Garnizon bakım maliyeti -%10"],{settlementDefenseRoll:2,garrisonUpkeepDiscount:.10}),
  project("TEMPLE_OF_ARTEMIS","Artemis Tapınağı",["Efes"],75_000,["Ticaret geliri +%12","Nüfus artışı +%8","Din değiştirme görev zarına +1"],{tradeIncomePercent:.12,populationGrowthPercent:.08,religionTaskRollBonus:1}),
  project("MARIB_DAM","Büyük Marib Barajı",["Marib"],80_000,["Nüfus artışı +%12","Yerleşke geliri +%12","Bina inşa maliyeti -%8"],{populationGrowthPercent:.12,incomePercent:.12,buildingCostDiscount:.08}),
  project("SEMNONES_SACRED_GROVE","Semnon Kutsal Korusu",["Budorgis"],60_000,["Piyade alım maliyeti -%10","İsyan direnci +10","Nüfus artışı +%5"],{infantryPurchaseDiscount:.10,rebellionResistance:10,populationGrowthPercent:.05}),
  project("ATHENS_ACROPOLIS","Atina Akropolü",["Atina"],80_000,["Toplam karakter kapasitesi +10","Kültür değiştirme görev zarına +2","Yerleşke geliri +%8"],{characterCapacity:10,cultureTaskRollBonus:2,incomePercent:.08}),
  project("AMARAVATI_STUPA","Amaravati Büyük Stupası",["Andhra"],70_000,["Nüfus artışı +%8","Din değiştirme görev zarına +2","İsyan direnci +8"],{populationGrowthPercent:.08,religionTaskRollBonus:2,rebellionResistance:8}),
  project("CHAMPA_TRADE_GATES","Champa Ticaret Kapıları",["Champa"],60_000,["Yerleşke savaşlarında savunma zarına +2","Bina inşa maliyeti -%10","Kara ticareti geliri +%8"],{settlementDefenseRoll:2,buildingCostDiscount:.10,landTradeIncomePercent:.08}),
  project("TAXILA_GREAT_ACADEMY","Taxila Büyük Akademisi",["Taxila"],75_000,["Toplam karakter kapasitesi +15","Diplomat, casus, tüccar ve misyoner görev zarına +1","Başarılı görevlerde +1 ek uzmanlık puanı"],{characterCapacity:15,taskRollBonus:{DIPLOMAT:1,SPY:1,MERCHANT:1,MISSIONARY:1},successfulTaskExtraProgress:1}),
  project("AYODHYA_ROYAL_COMPLEX","Ayodhya Kraliyet Kompleksi",["Ayodhya"],65_000,["Nüfus artışı +%8","Yerleşke geliri +%10","İsyan direnci +8"],{populationGrowthPercent:.08,incomePercent:.10,rebellionResistance:8}),
  project("MEKONG_STRAIT_HARBOR","Mekong Boğaz Limanı",["Mekong Deltası"],70_000,["Liman geliri +%15","Gemi alım maliyeti -%10","Ticaret geliri +%10"],{portIncomePercent:.15,shipPurchaseDiscount:.10,tradeIncomePercent:.10}),
  project("MALAYA_MARITIME_EXCHANGE","Malaya Deniz Ticaret Merkezi",["Malaya"],65_000,["Deniz ticareti geliri +%15","Tüccar görev getirisi +%15"],{seaTradeIncomePercent:.15,merchantReturnPercent:.15}),
  project("HASTINAPURA_WALLS","Hastinapura Büyük Surları",["Hastinapura"],65_000,["Yerleşke savaşlarında savunma zarına +2","Garnizon birimi alım maliyeti -%12","İsyan direnci +8"],{settlementDefenseRoll:2,garrisonPurchaseDiscount:.12,rebellionResistance:8}),
  project("MADURAI_SANGAM","Madurai Sangam Akademisi",["Madurai"],70_000,["Kültür değiştirme görev zarına +2","Nüfus artışı +%8","Yerleşke geliri +%8"],{cultureTaskRollBonus:2,populationGrowthPercent:.08,incomePercent:.08}),
  project("KANCHIPURAM_TEMPLE_CITY","Kanchipuran Tapınak Şehri",["Kanchipuran","Kanchipuram"],70_000,["Bina inşa maliyeti -%12","Nüfus artışı +%8","Ticaret geliri +%8"],{buildingCostDiscount:.12,populationGrowthPercent:.08,tradeIncomePercent:.08}),
  project("BHARUKACCHA_DOCKS","Bharakaccha Büyük Rıhtımları",["Bharakaccha"],70_000,["Liman geliri +%15","Tüccar görev getirisi +%15","Gemi bakım maliyeti -%8"],{portIncomePercent:.15,merchantReturnPercent:.15,shipUpkeepDiscount:.08}),
  project("VARANASI_SACRED_COMPLEX","Varanasi Kutsal Kompleksi",["Varanasi"],70_000,["Din değiştirme görev zarına +2","Kültür değiştirme görev zarına +1","Nüfus artışı +%8"],{religionTaskRollBonus:2,cultureTaskRollBonus:1,populationGrowthPercent:.08}),
  project("TAMRALIPTI_OCEAN_HARBOR","Tamralipti Okyanus Limanı",["Tamralipti"],70_000,["Liman geliri +%15","Deniz ticareti geliri +%12","Gemi alım maliyeti -%8"],{portIncomePercent:.15,seaTradeIncomePercent:.12,shipPurchaseDiscount:.08}),
  project("BAIKAL_ANCESTOR_SHRINE","Baykal Ata Mabedi",["Baykal Kışlağı"],55_000,["Bozkır birimi alım maliyeti -%10","Bozkır birimi bakım maliyeti -%8","Nüfus artışı +%5"],{steppePurchaseDiscount:.10,steppeUpkeepDiscount:.08,populationGrowthPercent:.05}),
  project("MINUSINSK_KURGAN","Minusinsk Büyük Kurganı",["Minusinsk Ortak Otlakları"],55_000,["Hareketli birim alım maliyeti -%10","Kara ordusu bakım maliyeti -%8"],{cavalryPurchaseDiscount:.10,landUpkeepDiscount:.08}),
  project("OTUKEN_SANCTUARY","Ötüken Kutsal Yerleşkesi",["Orhun Kavşağı"],65_000,["Bozkır birimi bakım maliyeti -%10","İsyan direnci +10","Askerî limit +%1"],{steppeUpkeepDiscount:.10,rebellionResistance:10,militaryLimitPercent:.01}),
  project("HULUN_HORSE_STUD","Hulun İmparatorluk At Harası",["Hulun Gölü"],60_000,["Süvari alım maliyeti -%12","Süvari bakım maliyeti -%8","Nüfus artışı +%5"],{cavalryPurchaseDiscount:.12,cavalryUpkeepDiscount:.08,populationGrowthPercent:.05}),
  project("DAVAN_CARAVANSERAI","Davan Kraliyet Kervansarayı",["Davan"],65_000,["Kara ticareti geliri +%15","Tüccar görev getirisi +%15"],{landTradeIncomePercent:.15,merchantReturnPercent:.15}),
  project("KASHGAR_GREAT_BAZAAR","Kaşgar Büyük Çarşısı",["Kaşgar"],70_000,["Kara ticareti geliri +%18","Tüccar görev getirisi +%15","Bina inşa maliyeti -%8"],{landTradeIncomePercent:.18,merchantReturnPercent:.15,buildingCostDiscount:.08}),
  project("KHENTII_ANCESTOR_SHRINE","Khentii Atalar Mabedi",["Khentii Otlakları"],55_000,["Bozkır birimi bakım maliyeti -%10","İsyan direnci +10"],{steppeUpkeepDiscount:.10,rebellionResistance:10}),
  project("KHINGAN_BORDER_MARKET","Khingan Sınır Pazarı",["Nen Nehri Pazarı"],60_000,["Kara ticareti geliri +%15","Yerleşke savaşlarında savunma zarına +1","İsyan direnci +8"],{landTradeIncomePercent:.15,settlementDefenseRoll:1,rebellionResistance:8}),
  project("ONON_TOY_GROUND","Onon Büyük Toy Alanı",["Onon Geçidi"],55_000,["Kara birimi alım maliyeti -%8","Kara ordusu bakım maliyeti -%8","İsyan direnci +8"],{unitPurchaseDiscount:.08,landUpkeepDiscount:.08,rebellionResistance:8}),
  project("YARLUNG_TERRACES","Yarlung Tarım Terasları",["Yarlung Vadisi"],60_000,["Nüfus artışı +%10","Bina inşa maliyeti -%10","İsyan direnci +5"],{populationGrowthPercent:.10,buildingCostDiscount:.10,rebellionResistance:5}),
  project("SOLOKHA_ROYAL_KURGAN","Solokha Kraliyet Kurganı",["Solokha"],60_000,["Süvari alım maliyeti -%10","Süvari bakım maliyeti -%10","Askerî limit +%1"],{cavalryPurchaseDiscount:.10,cavalryUpkeepDiscount:.10,militaryLimitPercent:.01}),
  project("ARZHAN_NECROPOLIS","Arzhan Kraliyet Nekropolü",["Sayan Yaylası"],55_000,["Kara ordusu bakım maliyeti -%8","İsyan direnci +10"],{landUpkeepDiscount:.08,rebellionResistance:10}),
  project("ILI_HEAVENLY_HORSE_PASTURES","Gök Atlar Kraliyet Meraları",["İli Vadisi"],65_000,["Süvari alım maliyeti -%12","Süvari bakım maliyeti -%10","Askerî limit +%1"],{cavalryPurchaseDiscount:.12,cavalryUpkeepDiscount:.10,militaryLimitPercent:.01}),
  project("XIANBEI_GREAT_CAMP","Xianbei Büyük Ordugâhı",["Xianbei Dağı Ordugâhı","Xianbei Dağı Ordugahı","Xianbei Dağ Ordugahı"],70_000,["Askerî limit +%2","Kara birimi alım maliyeti -%10","Kara ordusu bakım maliyeti -%5"],{militaryLimitPercent:.02,unitPurchaseDiscount:.10,landUpkeepDiscount:.05}),
  project("LONGCHENG_KURULTAI","Longcheng Büyük Kurultay Alanı",["Longcheng Ordugâhı","Longcheng Ordugahı"],80_000,["Vassal ve haraç geliri +%15","Bozkır birimi bakım maliyeti -%10","Askerî limit +%2"],{tributeIncomePercent:.15,steppeUpkeepDiscount:.10,militaryLimitPercent:.02}),
  project("GOTALAND_ROYAL_HALL","Götaland Kraliyet Salonu",["Östergötland"],60_000,["Piyade alım maliyeti -%12","Kara ordusu bakım maliyeti -%8","İsyan direnci +8"],{infantryPurchaseDiscount:.12,landUpkeepDiscount:.08,rebellionResistance:8}),
  project("VIKEN_WAR_BOAT_HALL","Viken Savaş Teknesi Salonu",["Viken"],60_000,["Hjortspring alım maliyeti -%12","Gemi bakım maliyeti -%10","Liman geliri +%8"],{hjortspringPurchaseDiscount:.12,shipUpkeepDiscount:.10,portIncomePercent:.08}),
  project("NERTHUS_SACRED_GROVE","Nerthus Kutsal Korusu",["Sjaelland"],60_000,["Nüfus artışı +%10","İsyan direnci +10","Bina inşa maliyeti -%8"],{populationGrowthPercent:.10,rebellionResistance:10,buildingCostDiscount:.08}),
  project("SVEAR_GREAT_THING","Svear Büyük Ting Alanı",["Södermanland"],60_000,["Piyade alım maliyeti -%10","İsyan direnci +10","Askerî limit +%1"],{infantryPurchaseDiscount:.10,rebellionResistance:10,militaryLimitPercent:.01})
] as const;

const trFold=(value:string)=>value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ş/g,"s").replace(/ç/g,"c").replace(/ö/g,"o").replace(/ü/g,"u").replace(/[^a-z0-9]+/g," ").trim();
const PROJECT_BY_KEY = new Map(GREAT_PROJECTS.map((item)=>[item.key,item]));
const PROJECT_BY_SETTLEMENT = new Map(GREAT_PROJECTS.flatMap((item)=>item.settlementNames.map((name)=>[trFold(name),item] as const)));

export function greatProjectByKey(key:string|null|undefined):GreatProjectDefinition|null{return key?PROJECT_BY_KEY.get(key as GreatProjectKey)??null:null;}
export function greatProjectForSettlement(name:string):GreatProjectDefinition|null{return PROJECT_BY_SETTLEMENT.get(trFold(name))??null;}

const sum=(values:number[],cap:number)=>Math.min(cap,values.reduce((a,b)=>a+(b||0),0));
export function aggregateGreatProjectModifiers(keys:readonly string[]):GreatProjectModifiers{
  const list=keys.map(greatProjectByKey).filter((item):item is GreatProjectDefinition=>Boolean(item)).map((item)=>item.modifiers);
  const pct=(key:keyof GreatProjectModifiers,cap=.30)=>sum(list.map((m)=>Number(m[key]??0)),cap);
  const taskRollBonus:Partial<Record<CharacterRole,number>>={};
  for(const role of ["DIPLOMAT","SPY","MERCHANT","MISSIONARY"] as CharacterRole[])taskRollBonus[role]=sum(list.map((m)=>m.taskRollBonus?.[role]??0),2);
  return {
    incomePercent:pct("incomePercent"),taxIncomePercent:pct("taxIncomePercent"),landTradeIncomePercent:pct("landTradeIncomePercent"),
    seaTradeIncomePercent:pct("seaTradeIncomePercent"),portIncomePercent:pct("portIncomePercent"),tradeIncomePercent:pct("tradeIncomePercent"),
    merchantReturnPercent:pct("merchantReturnPercent"),tributeIncomePercent:pct("tributeIncomePercent"),populationGrowthPercent:pct("populationGrowthPercent",.20),
    buildingCostDiscount:pct("buildingCostDiscount",.20),unitPurchaseDiscount:pct("unitPurchaseDiscount",.20),infantryPurchaseDiscount:pct("infantryPurchaseDiscount",.20),
    cavalryPurchaseDiscount:pct("cavalryPurchaseDiscount",.20),steppePurchaseDiscount:pct("steppePurchaseDiscount",.20),garrisonPurchaseDiscount:pct("garrisonPurchaseDiscount",.20),
    shipPurchaseDiscount:pct("shipPurchaseDiscount",.20),hjortspringPurchaseDiscount:pct("hjortspringPurchaseDiscount",.20),landUpkeepDiscount:pct("landUpkeepDiscount",.20),
    cavalryUpkeepDiscount:pct("cavalryUpkeepDiscount",.20),steppeUpkeepDiscount:pct("steppeUpkeepDiscount",.20),garrisonUpkeepDiscount:pct("garrisonUpkeepDiscount",.20),shipUpkeepDiscount:pct("shipUpkeepDiscount",.20),
    rebellionResistance:sum(list.map((m)=>m.rebellionResistance??0),20),militaryLimitPercent:sum(list.map((m)=>m.militaryLimitPercent??0),.03),
    settlementDefenseRoll:sum(list.map((m)=>m.settlementDefenseRoll??0),2),characterCapacity:sum(list.map((m)=>m.characterCapacity??0),30),
    taskRollBonus,cultureTaskRollBonus:sum(list.map((m)=>m.cultureTaskRollBonus??0),2),religionTaskRollBonus:sum(list.map((m)=>m.religionTaskRollBonus??0),2),
    successfulTaskExtraProgress:sum(list.map((m)=>m.successfulTaskExtraProgress??0),1)
  };
}

export function applyGreatProjectIncome<T extends {building:number;tax:number;landTrade:number;seaTrade:number}>(income:T,modifiers:GreatProjectModifiers):T{
  const general=1+(modifiers.incomePercent??0);
  const trade=1+(modifiers.tradeIncomePercent??0);
  const whole=(value:number)=>Math.floor(value+1e-9);
  return{
    ...income,
    building:whole(income.building*general),
    tax:whole(income.tax*general*(1+(modifiers.taxIncomePercent??0))),
    landTrade:whole(income.landTrade*general*trade*(1+(modifiers.landTradeIncomePercent??0))),
    seaTrade:whole(income.seaTrade*general*trade*(1+(modifiers.seaTradeIncomePercent??0))*(1+(modifiers.portIncomePercent??0)))
  };
}

export function greatProjectUnitPurchaseDiscount(unitType:string,modifiers:GreatProjectModifiers):number{
  const infantry=unitType.includes("infantry")||unitType.includes("berserker")||unitType.includes("spearman")||unitType.includes("spear");
  const cavalry=unitType.includes("cavalry")||unitType.includes("mounted")||unitType.includes("horse")||unitType.includes("chariot");
  const steppe=cavalry||unitType.includes("steppe")||unitType.includes("nomad");
  return Math.min(.20,(modifiers.unitPurchaseDiscount??0)+(infantry?(modifiers.infantryPurchaseDiscount??0):0)+(cavalry?(modifiers.cavalryPurchaseDiscount??0):0)+(steppe?(modifiers.steppePurchaseDiscount??0):0));
}

export function greatProjectUnitUpkeepDiscount(unitType:string,status:string,modifiers:GreatProjectModifiers):number{
  const cavalry=unitType.includes("cavalry")||unitType.includes("mounted")||unitType.includes("horse")||unitType.includes("chariot");
  const steppe=cavalry||unitType.includes("steppe")||unitType.includes("nomad");
  return Math.min(.20,(modifiers.landUpkeepDiscount??0)+(cavalry?(modifiers.cavalryUpkeepDiscount??0):0)+(steppe?(modifiers.steppeUpkeepDiscount??0):0)+(status==="GARRISON"?(modifiers.garrisonUpkeepDiscount??0):0));
}

export function greatProjectShipPurchaseDiscount(shipType:string,modifiers:GreatProjectModifiers):number{
  return Math.min(.20,(modifiers.shipPurchaseDiscount??0)+(shipType.includes("hjortspring")?(modifiers.hjortspringPurchaseDiscount??0):0));
}
