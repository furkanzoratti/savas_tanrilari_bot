export type SteppeTitleTier="KHAN"|"LANDHOLDER";
export type SteppeWarCallResponse="FULL"|"LIMITED"|"NEUTRAL"|"REFUSE";

export const STEPPE_TITLE_LABELS:Record<SteppeTitleTier,string>={
  KHAN:"Han",LANDHOLDER:"Toprak Ağası"
};

export const STEPPE_WAR_CALL_RESPONSES:Record<SteppeWarCallResponse,{
  label:string;loyaltyDelta:number;relationDelta:number;authorityDelta:number;color:number;
}>={
  FULL:{label:"Tam Katılım",loyaltyDelta:6,relationDelta:5,authorityDelta:2,color:0x2e8b57},
  LIMITED:{label:"Sınırlı Destek",loyaltyDelta:1,relationDelta:1,authorityDelta:0,color:0xd4a72c},
  NEUTRAL:{label:"Tarafsız Kal",loyaltyDelta:-4,relationDelta:-5,authorityDelta:-1,color:0x747f8d},
  REFUSE:{label:"Çağrıyı Reddet",loyaltyDelta:-10,relationDelta:-15,authorityDelta:-3,color:0xb22222}
};

export const STEPPE_UNANSWERED_WAR_CALL={loyaltyDelta:-6,relationDelta:-8,authorityDelta:-2} as const;

export function clampSteppeAuthority(value:number):number{return Math.max(0,Math.min(100,Math.trunc(value)));}
export function clampSteppeLoyalty(value:number):number{return Math.max(0,Math.min(100,Math.trunc(value)));}
export function clampSteppeRelation(value:number):number{return Math.max(-100,Math.min(100,Math.trunc(value)));}

export function steppeLoyaltyLabel(value:number):string{
  if(value>=75)return"Sadık";
  if(value>=50)return"Bağlı";
  if(value>=25)return"Mesafeli";
  return"Başkaldırı eğilimli";
}
