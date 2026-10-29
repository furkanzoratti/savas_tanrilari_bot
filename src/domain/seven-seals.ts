export const SEVEN_SEALS_MAX_ROUNDS=7;
export const SEALS={
  SUN:{label:"Güneş Mührü",emoji:"☀️",difficulty:8,points:1,description:"Açıldıktan sonra sonraki mühür zarlarına +1 sağlar."},
  MOON:{label:"Ay Mührü",emoji:"🌙",difficulty:9,points:1,description:"Erişilebilir ve güvenli bir başlangıç mührüdür."},
  SWORD:{label:"Kılıç Mührü",emoji:"⚔️",difficulty:10,points:2,description:"Orta zorlukta, dengeli puan sağlayan mühür."},
  CHALICE:{label:"Kadeh Mührü",emoji:"🏺",difficulty:11,points:2,description:"Başarıldığında 1 yozlaşmayı temizler."},
  CROWN:{label:"Taç Mührü",emoji:"👑",difficulty:13,points:3,description:"Yüksek değerli bir hükümdarlık mührü."},
  SERPENT:{label:"Yılan Mührü",emoji:"🐍",difficulty:14,points:4,description:"Yüksek puan verir fakat başarıda 1 yozlaşma getirir."},
  GATE:{label:"Kapı Mührü",emoji:"🚪",difficulty:16,points:6,description:"Yedi mühür içindeki en zor ve en değerli sınama."}
}as const;
export type SealKey=keyof typeof SEALS;
export const SEAL_ACTIONS={
  OPEN:{label:"Mühür Aç",emoji:"🔓",description:"Seçtiğin açılmamış mühür için zar atarsın."},
  STUDY:{label:"Kehanet Oku",emoji:"🔮",description:"Sonraki mühür açma zarına +4 odak kazandırır; odak en fazla 8 olur."},
  WARD:{label:"Arınma Ayini",emoji:"🕯️",description:"Mevcut yozlaşmadan 2 puan temizler."},
  CURSE:{label:"Lanet Gönder",emoji:"🕸️",description:"1 lanet hakkı harcayarak hedefin bu raundki mühür zorluğunu +4 artırır."}
}as const;
export type SealActionType=keyof typeof SEAL_ACTIONS;
export interface SevenSealsState{
  countryId:string;countryName:string;opened:SealKey[];focus:number;corruption:number;curses:number;bonusPoints:number;
}
export interface SealAction{countryId:string;action:SealActionType;seal:SealKey|null;targetCountryId:string|null}
export interface SealRoundResult{players:SevenSealsState[];publicLines:string[];privateResults:Record<string,string>}
export function initialSevenSealsState(countryId:string,countryName:string):SevenSealsState{
  return{countryId,countryName,opened:[],focus:0,corruption:0,curses:2,bonusPoints:0};
}
export function sevenSealsScore(player:SevenSealsState):number{
  const sealPoints=player.opened.reduce((sum,key)=>sum+SEALS[key].points,0);
  const setBonus=player.opened.length===7?10:player.opened.length>=5?5:player.opened.length>=3?2:0;
  return Math.max(0,sealPoints+setBonus+player.bonusPoints-player.corruption);
}
function die(random:()=>number){return Math.floor(Math.min(Math.max(random(),0),0.999999)*20)+1;}
export function resolveSealRound(
  source:readonly SevenSealsState[],actions:readonly SealAction[],random:()=>number=Math.random
):SealRoundResult{
  const players=source.map((player)=>({...player,opened:[...player.opened]}));
  const byId=new Map(players.map((player)=>[player.countryId,player]));
  const actionById=new Map(actions.map((action)=>[action.countryId,action]));
  const cursePenalty=new Map<string,number>();const publicLines:string[]=[];const privateResults:Record<string,string>={};
  const addPrivate=(countryId:string,line:string)=>{privateResults[countryId]=privateResults[countryId]?`${privateResults[countryId]}\n${line}`:line;};
  for(const action of actions){
    if(action.action!=="CURSE")continue;const actor=byId.get(action.countryId);const target=action.targetCountryId?byId.get(action.targetCountryId):null;
    if(!actor||!target)throw new Error("Lanet hedefi bulunamadı.");if(actor.curses<=0)throw new Error(`${actor.countryName} için lanet hakkı kalmadı.`);
    actor.curses-=1;cursePenalty.set(target.countryId,(cursePenalty.get(target.countryId)??0)+4);
    const exposed=die(random)<=4;
    addPrivate(actor.countryId,`${target.countryName} delegasyonuna gönderdiğin lanet bu raundki mühür zorluğunu +4 artırdı.`);
    addPrivate(target.countryId,exposed?`${actor.countryName} kaynaklı bir lanet mühür girişimini zorlaştırdı.`:"Kaynağı belirlenemeyen bir lanet mühür girişimini zorlaştırdı.");
    publicLines.push(exposed?`🕸️ **${actor.countryName}**, ${target.countryName} üzerine gönderdiği lanetle açığa çıktı.`:`🕸️ Sarayda kaynağı belirlenemeyen bir lanetin izleri görüldü.`);
  }
  for(const action of actions){
    if(action.action==="CURSE")continue;const player=byId.get(action.countryId);if(!player)continue;
    if(action.action==="STUDY"){
      player.focus=Math.min(8,player.focus+4);addPrivate(player.countryId,`Kehanet çalışması tamamlandı; sonraki mühür girişimin için odak bonusun +${player.focus}.`);
      publicLines.push(`🔮 **${player.countryName}** bu raundu kadim kehanetleri inceleyerek geçirdi.`);continue;
    }
    if(action.action==="WARD"){
      const removed=Math.min(2,player.corruption);player.corruption-=removed;addPrivate(player.countryId,`Arınma ayini ${removed} yozlaşmayı temizledi.`);
      publicLines.push(`🕯️ **${player.countryName}** bir arınma ayini gerçekleştirdi.`);continue;
    }
    if(!action.seal||player.opened.includes(action.seal))throw new Error(`${player.countryName} için mühür seçimi geçersiz.`);
    const seal=SEALS[action.seal];const natural=die(random);const sunBonus=player.opened.includes("SUN")?1:0;const curse=cursePenalty.get(player.countryId)??0;
    const total=natural+player.focus+sunBonus;const difficulty=seal.difficulty+curse;player.focus=0;
    if(total>=difficulty){
      player.opened.push(action.seal);if(action.seal==="CHALICE")player.corruption=Math.max(0,player.corruption-1);
      if(action.seal==="SERPENT")player.corruption+=1;if(natural===20)player.bonusPoints+=1;
      addPrivate(player.countryId,`${seal.label} açıldı. d20 ${natural}${sunBonus?" + Güneş 1":""}${curse?` • lanet zorluğu +${curse}`:""}; toplam ${total}/${difficulty}.${natural===20?" Kusursuz zar +1 bonus puan kazandırdı.":""}`);
      publicLines.push(`${seal.emoji} **${player.countryName}**, **${seal.label}** mührünü açtı.`);
    }else{
      const corruption=natural===1?2:1;player.corruption+=corruption;
      addPrivate(player.countryId,`${seal.label} açılamadı. d20 ${natural}${sunBonus?" + Güneş 1":""}${curse?` • lanet zorluğu +${curse}`:""}; toplam ${total}/${difficulty}. +${corruption} yozlaşma.`);
      publicLines.push(`🔒 **${player.countryName}**, ${seal.label} karşısında başarısız oldu.`);
    }
  }
  for(const player of players)if(!actionById.has(player.countryId))throw new Error(`${player.countryName} için hamle bulunamadı.`);
  return{players,publicLines,privateResults};
}
