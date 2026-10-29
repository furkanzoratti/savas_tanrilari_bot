export const CONSTRUCTION_MAX_ROUNDS=5;
export const CONSTRUCTION_STAGES={
  FOUNDATION:{label:"Temel",emoji:"🧱",description:"Ana yapının taşıyıcı temeli."},
  STRUCTURE:{label:"Ana Yapı",emoji:"🏛️",description:"Anıtın gövdesi ve mühendislik işi."},
  SPLENDOR:{label:"Bezeme",emoji:"✨",description:"Heykeller, kabartmalar ve görkemli son dokunuşlar."}
}as const;
export type ConstructionStage=keyof typeof CONSTRUCTION_STAGES;
export const CONSTRUCTION_METHODS={
  STEADY:{label:"Düzenli İnşa",emoji:"📐",description:"Kaynak harcamadan güvenli biçimde 3 ilerleme sağlar."},
  RUSH:{label:"Hızlandırılmış İnşa",emoji:"⚒️",description:"1 malzeme harcar; başarılı zar 5, başarısız zar 1 ilerleme sağlar."},
  MASTERWORK:{label:"Usta İşçiliği",emoji:"🎨",description:"1 ilham harcar; 4 ilerleme ve 1 kalite sağlar."}
}as const;
export type ConstructionMethod=keyof typeof CONSTRUCTION_METHODS;
export const CONSTRUCTION_EVENTS={
  ABUNDANT_STONE:{label:"Taş Ocakları Açıldı",description:"Hızlandırılmış inşaat başarılarında +1 ilerleme."},
  MASTER_GUILD:{label:"Ustalar Loncası",description:"Usta İşçiliği bu raund +1 ek kalite kazandırır."},
  HEAVY_RAIN:{label:"Şiddetli Yağmur",description:"Temel çalışmaları bu raund 1 daha az ilerler."},
  PUBLIC_FESTIVAL:{label:"Halk Şenliği",description:"Bezeme çalışmaları bu raund +2 ilerleme kazanır."},
  CLEAR_SKIES:{label:"Açık Gökyüzü",description:"Düzenli İnşa bu raund +1 ilerleme kazanır."}
}as const;
export type ConstructionEventKey=keyof typeof CONSTRUCTION_EVENTS;
export interface ConstructionState{
  countryId:string;countryName:string;foundation:number;structure:number;splendor:number;
  material:number;inspiration:number;quality:number;
}
export interface ConstructionAction{countryId:string;stage:ConstructionStage;method:ConstructionMethod}
export interface ConstructionRoundResult{players:ConstructionState[];publicLines:string[];privateResults:Record<string,string>}

export function initialConstructionState(countryId:string,countryName:string):ConstructionState{
  return{countryId,countryName,foundation:0,structure:0,splendor:0,material:2,inspiration:2,quality:0};
}
export function constructionScore(player:ConstructionState):number{
  return player.foundation+player.structure+player.splendor+player.quality*2+
    (player.foundation>=6?3:0)+(player.structure>=6?5:0)+(player.splendor>=4?7:0);
}
function die(random:()=>number){return Math.floor(Math.min(Math.max(random(),0),0.999999)*20)+1;}
export function constructionStageOpen(player:ConstructionState,stage:ConstructionStage):boolean{
  if(stage==="FOUNDATION")return player.foundation<8;
  if(stage==="STRUCTURE")return player.foundation>=6&&player.structure<8;
  return player.structure>=6&&player.splendor<8;
}
export function resolveConstructionRound(
  source:readonly ConstructionState[],actions:readonly ConstructionAction[],eventKey:ConstructionEventKey,random:()=>number=Math.random
):ConstructionRoundResult{
  const players=source.map((player)=>({...player}));
  const byId=new Map(players.map((player)=>[player.countryId,player]));
  const publicLines:string[]=[];const privateResults:Record<string,string>={};
  for(const action of actions){
    const player=byId.get(action.countryId);if(!player)continue;
    if(!constructionStageOpen(player,action.stage))throw new Error(`${player.countryName} için ${CONSTRUCTION_STAGES[action.stage].label} aşaması açık değil.`);
    let progress=0;let roll:number|null=null;let quality=0;
    if(action.method==="STEADY")progress=3+(eventKey==="CLEAR_SKIES"?1:0);
    if(action.method==="RUSH"){
      if(player.material<=0)throw new Error(`${player.countryName} için malzeme hakkı kalmadı.`);
      player.material-=1;roll=die(random);const success=roll>=9;
      progress=success?5+(eventKey==="ABUNDANT_STONE"?1:0):1;
      if(!success)player.quality=Math.max(0,player.quality-1);
    }
    if(action.method==="MASTERWORK"){
      if(player.inspiration<=0)throw new Error(`${player.countryName} için ilham hakkı kalmadı.`);
      player.inspiration-=1;progress=4;quality=1+(eventKey==="MASTER_GUILD"?1:0);player.quality+=quality;
    }
    if(eventKey==="HEAVY_RAIN"&&action.stage==="FOUNDATION")progress=Math.max(1,progress-1);
    if(eventKey==="PUBLIC_FESTIVAL"&&action.stage==="SPLENDOR")progress+=2;
    const field=action.stage==="FOUNDATION"?"foundation":action.stage==="STRUCTURE"?"structure":"splendor";
    const before=player[field];player[field]=Math.min(8,player[field]+progress);const applied=player[field]-before;
    const rollText=roll===null?"":` • d20: ${roll}`;
    privateResults[player.countryId]=`${CONSTRUCTION_STAGES[action.stage].label} aşamasında ${CONSTRUCTION_METHODS[action.method].label}: +${applied} ilerleme${quality?` • +${quality} kalite`:""}${rollText}.`;
    publicLines.push(`${CONSTRUCTION_STAGES[action.stage].emoji} **${player.countryName}**, ${CONSTRUCTION_STAGES[action.stage].label} aşamasında **+${applied}** ilerleme sağladı${quality?` ve kaliteyi +${quality} yükseltti`:""}.`);
  }
  return{players,publicLines,privateResults};
}
