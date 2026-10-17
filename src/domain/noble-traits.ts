import type {GreatProjectModifiers} from "./great-projects.js";

export type NobleTraitCategory="POSITIVE"|"MIXED"|"NEGATIVE";
export type NobleTraitKey=
  |"ADIL"|"USTA_IDARECI"|"STRATEJIST"|"TICARET_HAMISI"|"BILGE"
  |"FATIH"|"ZALIM"|"COMERT"|"DINDAR"|"KURNAZ"|"DENIZCI"|"HIRSLI"
  |"SAVURGAN"|"HASTALIKLI"|"KARARSIZ"|"KORKAK";

export interface NobleTraitDefinition{
  key:NobleTraitKey;name:string;category:NobleTraitCategory;description:string;
  effects:readonly string[];modifiers:GreatProjectModifiers;
}

const trait=(key:NobleTraitKey,name:string,category:NobleTraitCategory,description:string,effects:readonly string[],modifiers:GreatProjectModifiers):NobleTraitDefinition=>
  ({key,name,category,description,effects,modifiers});

export const NOBLE_TRAITS:readonly NobleTraitDefinition[]=[
  trait("ADIL","Adil","POSITIVE","Halkın güvenini kazanan dengeli bir hükümdar.",["İsyan direnci +8","Nüfus artışı +%4"],{rebellionResistance:8,populationGrowthPercent:.04}),
  trait("USTA_IDARECI","Usta İdareci","POSITIVE","Kaynakları ve devlet düzenini verimli yönetir.",["Toplam gelir +%6","Bina inşa maliyeti -%5"],{incomePercent:.06,buildingCostDiscount:.05}),
  trait("STRATEJIST","Stratejist","POSITIVE","Ordunun kapasitesini ve ikmal düzenini güçlendirir.",["Askerî limit +%2","Kara ordusu bakım maliyeti -%5"],{militaryLimitPercent:.02,landUpkeepDiscount:.05}),
  trait("TICARET_HAMISI","Ticaret Hamisi","POSITIVE","Tüccarları ve ticaret yollarını himaye eder.",["Kara ve deniz ticareti geliri +%10","Tüccar görev getirisi +%10"],{tradeIncomePercent:.10,merchantReturnPercent:.10}),
  trait("BILGE","Bilge","POSITIVE","Bilgiye ve uzlaşmaya dayalı bir yönetim sürdürür.",["Toplam karakter kapasitesi +5","Diplomat ve misyoner görev zarına +1"],{characterCapacity:5,taskRollBonus:{DIPLOMAT:1,MISSIONARY:1}}),
  trait("FATIH","Fatih","MIXED","Fetih için devletin askerî kaynaklarını zorlar.",["Kara birimi alım maliyeti -%8","Askerî limit +%1","Kara ordusu bakım maliyeti +%5"],{unitPurchaseDiscount:.08,militaryLimitPercent:.01,landUpkeepDiscount:-.05}),
  trait("ZALIM","Zalim","MIXED","Korkuyla daha fazla vergi toplar, huzursuzluğu büyütür.",["Vergi geliri +%10","İsyan direnci -10"],{taxIncomePercent:.10,rebellionResistance:-10}),
  trait("COMERT","Cömert","MIXED","Halkın bağlılığını devlet hazinesi pahasına artırır.",["İsyan direnci +10","Toplam gelir -%6"],{rebellionResistance:10,incomePercent:-.06}),
  trait("DINDAR","Dindar","MIXED","İnancı güçlendirirken kültürel dönüşümü zorlaştırır.",["Misyoner görev zarına +2","Nüfus artışı +%4","Kültür değiştirme görev zarına -1"],{taskRollBonus:{MISSIONARY:2},populationGrowthPercent:.04,cultureTaskRollBonus:-1}),
  trait("KURNAZ","Kurnaz","MIXED","Gizli işlerde mahir, açık diplomaside güvensizdir.",["Casus ve karşı casusluk görev zarına +1","Diplomat görev zarına -1"],{taskRollBonus:{SPY:1,DIPLOMAT:-1}}),
  trait("DENIZCI","Denizci","MIXED","Deniz gücünü kara ordusuna tercih eder.",["Gemi alım ve bakım maliyeti -%8","Kara birimi alım maliyeti +%5"],{shipPurchaseDiscount:.08,shipUpkeepDiscount:.08,unitPurchaseDiscount:-.05}),
  trait("HIRSLI","Hırslı","MIXED","Geliri büyütürken toplum üzerindeki baskıyı artırır.",["Toplam gelir +%8","İsyan direnci -6"],{incomePercent:.08,rebellionResistance:-6}),
  trait("SAVURGAN","Savurgan","NEGATIVE","Devlet harcamalarında ölçüyü kaçırır.",["Bina, birlik ve gemi alım maliyeti +%8"],{buildingCostDiscount:-.08,unitPurchaseDiscount:-.08,shipPurchaseDiscount:-.08}),
  trait("HASTALIKLI","Hastalıklı","NEGATIVE","Hükümdarın kırılganlığı ülkenin büyümesini ve seferberliğini sınırlar.",["Nüfus artışı -%8","Askerî limit -%1"],{populationGrowthPercent:-.08,militaryLimitPercent:-.01}),
  trait("KARARSIZ","Kararsız","NEGATIVE","Sık değişen kararları idareyi ve dış görevleri aksatır.",["Bina inşa maliyeti +%5","Diplomat ve tüccar görev zarına -1"],{buildingCostDiscount:-.05,taskRollBonus:{DIPLOMAT:-1,MERCHANT:-1}}),
  trait("KORKAK","Korkak","NEGATIVE","Riskten kaçınması askerî hazırlığı ve savunmayı zayıflatır.",["Askerî limit -%2","Yerleşke savaşlarında savunma zarına -1"],{militaryLimitPercent:-.02,settlementDefenseRoll:-1})
] as const;

const TRAIT_BY_KEY=new Map(NOBLE_TRAITS.map((item)=>[item.key,item]));
export const NOBLE_TRAIT_KEYS=NOBLE_TRAITS.map((item)=>item.key);
export function isNobleTraitKey(value:unknown):value is NobleTraitKey{return typeof value==="string"&&TRAIT_BY_KEY.has(value as NobleTraitKey);}
export function nobleTraitByKey(value:string|null|undefined):NobleTraitDefinition|null{return value?TRAIT_BY_KEY.get(value as NobleTraitKey)??null:null;}
export function nobleTraitCategoryLabel(category:NobleTraitCategory):string{return category==="POSITIVE"?"Olumlu":category==="MIXED"?"Karma":"Olumsuz";}
export function randomNobleTraitKey(pick:(maximum:number)=>number):NobleTraitKey{return NOBLE_TRAIT_KEYS[pick(NOBLE_TRAIT_KEYS.length)]!;}

