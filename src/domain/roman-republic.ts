export const ROMAN_BUSINESSES = {
  MARKET_STALL: {
    label: "Pazar Tezgâhı", emoji: "🧺", purchaseCost: 2_500, turnIncome: 350,
    influenceOnPurchase: 1, familyLimit: 4,
    description: "Düşük giriş maliyetli perakende ağı; aileye düzenli ve güvenli nakit akışı sağlar."
  },
  WORKSHOP: {
    label: "Zanaat Atölyesi", emoji: "⚒️", purchaseCost: 5_000, turnIncome: 650,
    influenceOnPurchase: 1, familyLimit: 3,
    description: "Roma kent ekonomisine üretim sağlayan, orta ölçekli aile işletmesi."
  },
  BROTHEL: {
    label: "Genelev", emoji: "🍷", purchaseCost: 6_000, turnIncome: 900,
    influenceOnPurchase: 1, familyLimit: 2,
    description: "Yüksek nakit akışlı eğlence işletmesi; skandal ve ahlak siyaseti sonraki aşamada işlenecek."
  },
  BATHHOUSE: {
    label: "Hamam", emoji: "♨️", purchaseCost: 8_000, turnIncome: 1_000,
    influenceOnPurchase: 2, familyLimit: 2,
    description: "Gelir yanında şehir halkıyla görünür temas ve toplumsal itibar kazandırır."
  },
  LUDUS: {
    label: "Gladyatör Okulu (Ludus)", emoji: "🛡️", purchaseCost: 12_000, turnIncome: 1_500,
    influenceOnPurchase: 3, familyLimit: 1,
    description: "Gladyatör yetiştiren prestijli okul; oyunlarla özel etkileşimi sonraki aşamada açılacak."
  },
  LATIFUNDIUM: {
    label: "Latifundium", emoji: "🌾", purchaseCost: 18_000, turnIncome: 2_200,
    influenceOnPurchase: 3, familyLimit: 2,
    description: "Geniş tarım arazisi; yüksek sermaye karşılığında güçlü ve istikrarlı gelir sağlar."
  }
} as const;

export type RomanBusinessType = keyof typeof ROMAN_BUSINESSES;

export const ROMAN_TERM_LENGTH = 6;
export const ROMAN_CONSUL_TURN_STIPEND = 500;
export const ROMAN_SENATE_TOTAL_SEATS = 100;
export const ROMAN_FAMILY_SEAT_CAP = 35;
export const ROMAN_FAMILY_SEAT_FLOOR = 3;
export const ROMAN_CANDIDACY_INFLUENCE_COST = 5;
export const ROMAN_BALLOT_INFLUENCE_CAP = 10;
export const ROMAN_ELECTION_WIN_INFLUENCE = 5;
export const ROMAN_GOVERNOR_TERM_LENGTH = 6;
export const ROMAN_GOVERNOR_FAMILY_CAP = 2;
export const ROMAN_GOVERNOR_INFLUENCE_PER_TURN = 1;
export const ROMAN_GOVERNOR_NET_INCOME_PERCENT = 5;

export const ROMAN_SENATE_PROPOSALS={
  MILITARY_BUDGET:{label:"Askerî Bütçe",category:"MILITARY",cost:3,threshold:51,duration:6,description:"Roma ordusuna öncelik verir; yürürlükteyken savaş yorgunluğunu her tur 1 azaltır."},
  LAND_REFORM:{label:"Toprak Reformu",category:"POPULAR",cost:3,threshold:51,duration:6,description:"Roma yerleşkelerinde her tur +2 refah sağlar."},
  GRAIN_DISTRIBUTION:{label:"Tahıl Yardımı",category:"POPULAR",cost:3,threshold:50,duration:3,description:"Roma yerleşkelerinde her tur isyan gerilimini 3 azaltır."},
  TRADE_PRIVILEGE:{label:"Ticaret İmtiyazı",category:"ECONOMY",cost:3,threshold:51,duration:6,description:"Alım Turlarında Roma yerleşkelerinin pozitif net gelirine %5 ekler."},
  EMERGENCY_POWERS:{label:"Olağanüstü Yetkiler",category:"ADMINISTRATION",cost:5,threshold:67,duration:3,description:"Konsül ailesine tur başına +2 nüfuz verir; her tur +1 skandal riski oluşturur."}
} as const;
export type RomanProposalType=keyof typeof ROMAN_SENATE_PROPOSALS;
export type RomanPoliticalCategory=(typeof ROMAN_SENATE_PROPOSALS)[RomanProposalType]["category"];

export const ROMAN_OFFICES={
  QUAESTOR:{label:"Quaestor",cost:2,duration:4,prerequisite:null,treasuryPerTurn:250,influencePerTurn:1,reputationPerTurn:0,scandalRecovery:0},
  AEDILE:{label:"Aedilis",cost:3,duration:4,prerequisite:"QUAESTOR",treasuryPerTurn:0,influencePerTurn:1,reputationPerTurn:1,scandalRecovery:0},
  PRAETOR:{label:"Praetor",cost:4,duration:6,prerequisite:"QUAESTOR",treasuryPerTurn:0,influencePerTurn:2,reputationPerTurn:0,scandalRecovery:0},
  CENSOR:{label:"Censor",cost:5,duration:6,prerequisite:"PRAETOR",treasuryPerTurn:0,influencePerTurn:2,reputationPerTurn:0,scandalRecovery:1},
  PONTIFEX_MAXIMUS:{label:"Pontifex Maximus",cost:5,duration:8,prerequisite:null,treasuryPerTurn:0,influencePerTurn:2,reputationPerTurn:1,scandalRecovery:0}
} as const;
export type RomanOfficeKey=keyof typeof ROMAN_OFFICES;
export type RomanPoliticalBloc="CENTRIST"|"OPTIMATES"|"POPULARES"|"EQUITES"|"MILITARISTS"|"TRADITIONALISTS";
export type RomanRelationAction="HOST_FEAST"|"POLITICAL_SUPPORT"|"SMEAR_CAMPAIGN";

export const ROMAN_RELATION_ACTIONS={
  HOST_FEAST:{label:"Aile Ziyafeti",treasuryCost:1_000,influenceCost:0,scoreDelta:8,trustDelta:4,rivalryDelta:-2,scandalDelta:0},
  POLITICAL_SUPPORT:{label:"Siyasi Destek",treasuryCost:0,influenceCost:3,scoreDelta:10,trustDelta:6,rivalryDelta:-3,scandalDelta:0},
  SMEAR_CAMPAIGN:{label:"Karalama Kampanyası",treasuryCost:0,influenceCost:2,scoreDelta:-10,trustDelta:-4,rivalryDelta:8,scandalDelta:2}
} as const;

const BLOC_PREFERENCES:Record<RomanPoliticalBloc,{favored:RomanPoliticalCategory[];opposed:RomanPoliticalCategory[]}>= {
  CENTRIST:{favored:["ADMINISTRATION"],opposed:[]},
  OPTIMATES:{favored:["ADMINISTRATION","MILITARY"],opposed:["POPULAR"]},
  POPULARES:{favored:["POPULAR"],opposed:["ADMINISTRATION"]},
  EQUITES:{favored:["ECONOMY"],opposed:["POPULAR"]},
  MILITARISTS:{favored:["MILITARY"],opposed:["ECONOMY"]},
  TRADITIONALISTS:{favored:["ADMINISTRATION"],opposed:["POPULAR"]}
};

function stableNoise(seed:string):number{
  let value=2166136261;
  for(const character of seed)value=Math.imul(value^character.charCodeAt(0),16777619);
  return Math.abs(value)%17-8;
}

export function romanNpcDecisionScore(input:{
  seed:string;bloc:RomanPoliticalBloc;category:RomanPoliticalCategory;relationScore:number;trust:number;rivalry:number;
  proposerReputation:number;proposerScandal:number;selfTarget:boolean;
}):number{
  const preference=BLOC_PREFERENCES[input.bloc];
  return Math.round(input.relationScore/4+(input.trust-50)/5-input.rivalry/5+(input.proposerReputation-50)/5-input.proposerScandal/4+
    (preference.favored.includes(input.category)?15:0)-(preference.opposed.includes(input.category)?12:0)+(input.selfTarget?30:0)+stableNoise(input.seed));
}

export function romanNpcVote(score:number):"YES"|"NO"|"ABSTAIN"{
  return score>=8?"YES":score<=-8?"NO":"ABSTAIN";
}

export function romanElectionBallotWeight(senateSeats:number,influenceSpent:number):number{
  return Math.max(1,Math.trunc(senateSeats))+Math.max(0,Math.min(ROMAN_BALLOT_INFLUENCE_CAP,Math.trunc(influenceSpent)));
}

export function romanGovernorTreasuryShare(netIncome:number):number{
  return Math.floor(Math.max(0,netIncome)*ROMAN_GOVERNOR_NET_INCOME_PERCENT/100);
}

export interface RomanSenateSeatCandidate {
  id:string;
  name:string;
  currentSeats:number;
  performanceScore:number;
  reputation:number;
  scandal:number;
}

export interface RomanSenateSeatAllocation extends RomanSenateSeatCandidate {
  newSeats:number;
  seatDelta:number;
}

/**
 * Applies the term performance delta first, then normalises the chamber back to
 * its exact size. Extra seats go to the strongest performers; excess seats are
 * removed from the weakest, while the family floor and cap remain inviolable.
 */
export function redistributeRomanSenateSeats(
  families:RomanSenateSeatCandidate[],
  totalSeats=ROMAN_SENATE_TOTAL_SEATS,
  familySeatFloor=ROMAN_FAMILY_SEAT_FLOOR,
  familySeatCap=ROMAN_FAMILY_SEAT_CAP
):RomanSenateSeatAllocation[]{
  if(!families.length)return[];
  const floor=Math.max(0,Math.trunc(familySeatFloor));
  const cap=Math.max(floor,Math.trunc(familySeatCap));
  if(totalSeats<families.length*floor||totalSeats>families.length*cap){
    throw new RangeError("Senato büyüklüğü aile koltuk alt/üst sınırlarıyla bağdaşmıyor.");
  }
  const allocations=families.map((family)=>({
    ...family,
    currentSeats:Math.trunc(family.currentSeats),
    performanceScore:Math.trunc(family.performanceScore),
    newSeats:Math.max(floor,Math.min(cap,Math.trunc(family.currentSeats)+Math.trunc(family.performanceScore))),
    seatDelta:0
  }));
  const gainOrder=[...allocations].sort((left,right)=>
    right.performanceScore-left.performanceScore||right.reputation-left.reputation||left.scandal-right.scandal||
    left.currentSeats-right.currentSeats||left.name.localeCompare(right.name,"tr")
  );
  const lossOrder=[...allocations].sort((left,right)=>
    left.performanceScore-right.performanceScore||left.reputation-right.reputation||right.scandal-left.scandal||
    right.currentSeats-left.currentSeats||left.name.localeCompare(right.name,"tr")
  );
  let allocated=allocations.reduce((sum,item)=>sum+item.newSeats,0);
  while(allocated<totalSeats){
    let changed=false;
    for(const family of gainOrder){
      if(allocated>=totalSeats)break;
      if(family.newSeats>=cap)continue;
      family.newSeats+=1;allocated+=1;changed=true;
    }
    if(!changed)throw new RangeError("Senato koltuklarının tamamı ailelere dağıtılamadı.");
  }
  while(allocated>totalSeats){
    let changed=false;
    for(const family of lossOrder){
      if(allocated<=totalSeats)break;
      if(family.newSeats<=floor)continue;
      family.newSeats-=1;allocated-=1;changed=true;
    }
    if(!changed)throw new RangeError("Senato koltukları aile üst sınırına indirilemedi.");
  }
  return allocations.map((family)=>({...family,seatDelta:family.newSeats-family.currentSeats}));
}

export function isRomanBusinessType(value: string): value is RomanBusinessType {
  return value in ROMAN_BUSINESSES;
}

export function romanBusinessChoices() {
  return (Object.entries(ROMAN_BUSINESSES) as Array<[RomanBusinessType,(typeof ROMAN_BUSINESSES)[RomanBusinessType]]>)
    .map(([value,business])=>({
      name: `${business.emoji} ${business.label} • ${business.purchaseCost.toLocaleString("tr-TR")} Altın`,
      value
    }));
}
