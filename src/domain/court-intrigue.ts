export const COURT_MAX_ROUNDS=5;

export const COURT_AREAS={
  THRONE:{label:"Taht",emoji:"👑"},
  GUARD:{label:"Saray Muhafızları",emoji:"⚔️"},
  CLERGY:{label:"Ruhban Sınıfı",emoji:"⛪"},
  MERCHANTS:{label:"Tüccarlar",emoji:"💰"}
}as const;
export type CourtArea=keyof typeof COURT_AREAS;

export const COURT_ACTIONS={
  INFLUENCE:{label:"Nüfuz Kur",emoji:"🏛️",description:"Seçilen saray alanına 2 nüfuz ekler."},
  BRIBE:{label:"Rüşvet Dağıt",emoji:"🪙",description:"1 entrika harcayarak seçilen alana 3 nüfuz ekler."},
  SUPPORT:{label:"Delegasyonu Destekle",emoji:"🤝",description:"Hedef devlete seçilen alanda 1 nüfuz; sana 1 prestij kazandırır."},
  UNDERMINE:{label:"İtibar Sars",emoji:"🗡️",description:"1 entrika harcayarak hedefin seçilen alandaki nüfuzunu 2 azaltmayı dener."},
  SPY:{label:"Casusluk Yap",emoji:"🕵️",description:"1 entrika harcayarak hedefin bu raundki gizli hamlesini öğrenmeyi dener."},
  PROTECT:{label:"Delegasyonu Koru",emoji:"🛡️",description:"1 koruma harcayarak bu raund ilk düşmanca hamleyi engeller."}
}as const;
export type CourtActionType=keyof typeof COURT_ACTIONS;

export const COURT_EVENTS={
  ROYAL_AUDIENCE:{label:"Kraliyet Huzuru",description:"Taht üzerinde kurulan doğrudan nüfuz bu raund +1 güçlenir.",bonusArea:"THRONE"},
  GUARD_INSPECTION:{label:"Muhafız Teftişi",description:"İtibar sarsma ve casusluk girişimleri bu raund daha zordur.",bonusArea:null},
  SACRED_COUNCIL:{label:"Kutsal Meclis",description:"Ruhban Sınıfı üzerinde kurulan doğrudan nüfuz bu raund +1 güçlenir.",bonusArea:"CLERGY"},
  MERCHANT_FEAST:{label:"Tüccarlar Şöleni",description:"Tüccarlar üzerinde kurulan doğrudan nüfuz bu raund +1 güçlenir.",bonusArea:"MERCHANTS"},
  MASKED_BALL:{label:"Maskeli Balo",description:"Casusluk girişimleri bu raund daha kolay ve daha güç fark edilir.",bonusArea:null}
}as const satisfies Record<string,{label:string;description:string;bonusArea:CourtArea|null}>;
export type CourtEventKey=keyof typeof COURT_EVENTS;

export const COURT_OBJECTIVES={
  THRONE_DOMINANCE:{label:"Tahtın Gölgesi",description:"Oyun sonunda Taht nüfuzunda ortak veya tek lider ol.",area:"THRONE"},
  GUARD_DOMINANCE:{label:"Kılıçların Efendisi",description:"Oyun sonunda Saray Muhafızları nüfuzunda ortak veya tek lider ol.",area:"GUARD"},
  CLERGY_DOMINANCE:{label:"Kutsal Destek",description:"Oyun sonunda Ruhban Sınıfı nüfuzunda ortak veya tek lider ol.",area:"CLERGY"},
  MERCHANT_DOMINANCE:{label:"Altın Ağ",description:"Oyun sonunda Tüccarlar nüfuzunda ortak veya tek lider ol.",area:"MERCHANTS"},
  BALANCED_COURT:{label:"Dört Sütun",description:"Oyun sonunda dört saray alanının her birinde en az 3 nüfuza sahip ol.",area:null},
  DIPLOMAT:{label:"Uzlaştırıcı",description:"Oyun boyunca en az 3 destek hamlesi yap.",area:null},
  SHADOW_MASTER:{label:"Gölgelerin Efendisi",description:"En az 2 başarılı casusluk veya itibar sarsma girişimi gerçekleştir.",area:null},
  PRESTIGE:{label:"Sarayın Gözdesi",description:"Amaç puanı uygulanmadan önce en az 8 prestije ulaş.",area:null}
}as const satisfies Record<string,{label:string;description:string;area:CourtArea|null}>;
export type CourtObjectiveKey=keyof typeof COURT_OBJECTIVES;

export interface CourtInfluence{THRONE:number;GUARD:number;CLERGY:number;MERCHANTS:number}
export interface CourtPlayerState{
  countryId:string;countryName:string;influence:CourtInfluence;prestige:number;intrigue:number;protection:number;
  supportCount:number;successfulIntrigues:number;objective:CourtObjectiveKey;lastIntel:string|null;
}
export interface CourtRoundAction{countryId:string;action:CourtActionType;area:CourtArea|null;targetCountryId:string|null}
export interface CourtRoundResult{
  players:CourtPlayerState[];publicLines:string[];privateResults:Record<string,string>;brokenPairs:Array<[string,string]>;
}

export function initialCourtInfluence():CourtInfluence{return{THRONE:1,GUARD:1,CLERGY:1,MERCHANTS:1};}

function die(random:()=>number){return Math.floor(Math.min(Math.max(random(),0),0.999999)*20)+1;}

export function resolveCourtRound(
  sourcePlayers:readonly CourtPlayerState[],actions:readonly CourtRoundAction[],eventKey:CourtEventKey,
  activePacts:readonly{leftCountryId:string;rightCountryId:string}[]=[],random:()=>number=Math.random
):CourtRoundResult{
  const players=sourcePlayers.map((player)=>({...player,influence:{...player.influence}}));
  const byId=new Map(players.map((player)=>[player.countryId,player]));
  const actionById=new Map(actions.map((action)=>[action.countryId,action]));
  const protectedCountries=new Set<string>();
  const protectionSpent=new Set<string>();
  const privateResults:Record<string,string>={};
  const publicLines:string[]=[];
  const brokenPairs:Array<[string,string]>=[];
  const brokenKeys=new Set<string>();
  const pairKey=(left:string,right:string)=>[left,right].sort().join(":");
  const pacts=new Set(activePacts.map((pact)=>pairKey(pact.leftCountryId,pact.rightCountryId)));
  const event=COURT_EVENTS[eventKey];

  for(const action of actions){
    const actor=byId.get(action.countryId);
    if(!actor||action.action!=="PROTECT")continue;
    if(actor.protection<=0)throw new Error(`${actor.countryName} için koruma hakkı kalmadı.`);
    actor.protection-=1;protectedCountries.add(actor.countryId);protectionSpent.add(actor.countryId);
  }
  for(const action of actions){
    const actor=byId.get(action.countryId);
    if(!actor||action.action==="PROTECT")continue;
    const target=action.targetCountryId?byId.get(action.targetCountryId):null;
    if(action.action==="INFLUENCE"||action.action==="BRIBE"){
      if(!action.area)throw new Error("Saray alanı seçilmedi.");
      if(action.action==="BRIBE"){
        if(actor.intrigue<=0)throw new Error(`${actor.countryName} için entrika hakkı kalmadı.`);
        actor.intrigue-=1;
      }
      const amount=(action.action==="BRIBE"?3:2)+(action.action==="INFLUENCE"&&event.bonusArea===action.area?1:0);
      actor.influence[action.area]+=amount;
      privateResults[actor.countryId]=`${COURT_AREAS[action.area].label} alanında +${amount} nüfuz kazandın.`;
      publicLines.push(`${actor.countryName}, ${COURT_AREAS[action.area].label} çevresindeki nüfuzunu güçlendirdi.`);
      continue;
    }
    if(action.action==="SUPPORT"){
      if(!target||!action.area)throw new Error("Destek hedefi veya saray alanı seçilmedi.");
      target.influence[action.area]+=1;actor.prestige+=1;actor.supportCount+=1;
      privateResults[actor.countryId]=`${target.countryName} delegasyonuna verdiğin destek sana +1 prestij kazandırdı.`;
      publicLines.push(`${actor.countryName}, ${target.countryName} delegasyonunu ${COURT_AREAS[action.area].label} alanında destekledi.`);
      continue;
    }
    if(action.action==="UNDERMINE"||action.action==="SPY"){
      if(!target)throw new Error("Entrika hedefi seçilmedi.");
      if(actor.intrigue<=0)throw new Error(`${actor.countryName} için entrika hakkı kalmadı.`);
      actor.intrigue-=1;
      const key=pairKey(actor.countryId,target.countryId);
      if(pacts.has(key)&&!brokenKeys.has(key)){
        brokenKeys.add(key);brokenPairs.push([actor.countryId,target.countryId]);actor.prestige=Math.max(0,actor.prestige-2);
        publicLines.push(`${actor.countryName}, ${target.countryName} ile yaptığı saray anlaşmasını bozdu ve 2 prestij kaybetti.`);
      }
      if(protectedCountries.has(target.countryId)){
        protectedCountries.delete(target.countryId);
        privateResults[actor.countryId]=`${target.countryName} delegasyonunun koruması girişimini engelledi.`;
        privateResults[target.countryId]=`${actor.countryName} kaynaklı bir ${COURT_ACTIONS[action.action].label.toLocaleLowerCase("tr-TR")} girişimi koruman tarafından engellendi.`;
        publicLines.push(`${target.countryName} delegasyonuna yönelen bir entrika saray koruması tarafından engellendi.`);
        continue;
      }
      const roll=die(random);
      const threshold=action.action==="SPY"
        ?(eventKey==="MASKED_BALL"?6:eventKey==="GUARD_INSPECTION"?11:8)
        :(eventKey==="GUARD_INSPECTION"?12:9);
      const success=roll>=threshold;
      const caught=eventKey==="MASKED_BALL"?roll===1:roll<=3;
      if(success){
        actor.successfulIntrigues+=1;
        if(action.action==="UNDERMINE"){
          if(!action.area)throw new Error("İtibar sarsma alanı seçilmedi.");
          const loss=Math.min(2,target.influence[action.area]);target.influence[action.area]-=loss;
          privateResults[actor.countryId]=`${target.countryName}, ${COURT_AREAS[action.area].label} alanında ${loss} nüfuz kaybetti.`;
        }else{
          const targetAction=actionById.get(target.countryId);
          const intel=targetAction
            ?`${target.countryName} bu raund “${COURT_ACTIONS[targetAction.action].label}” hamlesini seçti${targetAction.area?` (${COURT_AREAS[targetAction.area].label})`:""}.`
            :`${target.countryName} için kayıtlı hamle bulunamadı.`;
          actor.lastIntel=intel;privateResults[actor.countryId]=intel;
        }
      }else privateResults[actor.countryId]=`${target.countryName} delegasyonuna yönelik girişimin sonuç vermedi.`;
      if(caught){
        publicLines.push(`${actor.countryName} tarafından ${target.countryName} delegasyonuna yöneltilen entrika açığa çıktı.`);
        privateResults[target.countryId]=`${actor.countryName} delegasyonunun sana karşı ${COURT_ACTIONS[action.action].label.toLocaleLowerCase("tr-TR")} girişiminde bulunduğu ortaya çıktı.`;
      }else if(success&&action.action==="UNDERMINE")publicLines.push(`${target.countryName} delegasyonunun ${COURT_AREAS[action.area!].label} nüfuzu, kaynağı belirlenemeyen bir entrikayla zayıfladı.`);
    }
  }
  for(const area of Object.keys(COURT_AREAS)as CourtArea[]){
    const maximum=Math.max(...players.map((player)=>player.influence[area]));
    const leaders=players.filter((player)=>player.influence[area]===maximum);
    if(leaders.length===1){
      leaders[0]!.prestige+=1;
      publicLines.push(`${COURT_AREAS[area].emoji} ${COURT_AREAS[area].label}: ${leaders[0]!.countryName} tek başına önde ve +1 prestij kazandı.`);
    }else publicLines.push(`${COURT_AREAS[area].emoji} ${COURT_AREAS[area].label}: ${leaders.map((leader)=>leader.countryName).join(", ")} ortak lider; bu alan prestij kazandırmadı.`);
  }
  for(const countryId of protectionSpent)if(!privateResults[countryId])privateResults[countryId]="Koruman gerekmedi; bu raund sana yönelik bir entrika olmadı.";
  return{players,publicLines,privateResults,brokenPairs};
}

export function courtObjectiveCompleted(player:CourtPlayerState,all:readonly CourtPlayerState[]):boolean{
  const objective=COURT_OBJECTIVES[player.objective];
  if(objective.area){
    const maximum=Math.max(...all.map((item)=>item.influence[objective.area!]));
    return player.influence[objective.area]===maximum;
  }
  if(player.objective==="BALANCED_COURT")return(Object.keys(COURT_AREAS)as CourtArea[]).every((area)=>player.influence[area]>=3);
  if(player.objective==="DIPLOMAT")return player.supportCount>=3;
  if(player.objective==="SHADOW_MASTER")return player.successfulIntrigues>=2;
  return player.prestige>=8;
}
