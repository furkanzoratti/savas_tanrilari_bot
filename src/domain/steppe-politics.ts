export type SteppeTitleTier="KHAN"|"LANDHOLDER";
export type SteppeWarCallResponse="FULL"|"LIMITED"|"NEUTRAL"|"REFUSE";
export type SteppeConflictType="LANDHOLDER_FEUD"|"KHAN_SUPPRESSION"|"LANDHOLDER_REVOLT"|"KHAN_WAR";

export const STEPPE_TITLE_LABELS:Record<SteppeTitleTier,string>={
  KHAN:"Han",LANDHOLDER:"Toprak Ağası"
};

export const STEPPE_WAR_CALL_RESPONSES:Record<SteppeWarCallResponse,{
  label:string;authorityDelta:number;color:number;
}>={
  FULL:{label:"Tam Katılım",authorityDelta:0,color:0x2e8b57},
  LIMITED:{label:"Sınırlı Destek",authorityDelta:-1,color:0xd4a72c},
  NEUTRAL:{label:"Tarafsız Kal",authorityDelta:-3,color:0x747f8d},
  REFUSE:{label:"Çağrıyı Reddet",authorityDelta:-6,color:0xb22222}
};

export const STEPPE_UNANSWERED_WAR_CALL={authorityDelta:-4} as const;

export const STEPPE_CONFLICT_LABELS:Record<SteppeConflictType,string>={
  LANDHOLDER_FEUD:"Toprak Ağaları Çatışması",
  KHAN_SUPPRESSION:"Hanın Tedip Seferi",
  LANDHOLDER_REVOLT:"Hana Başkaldırı",
  KHAN_WAR:"Hanlar Arası Savaş"
};

export function clampSteppeAuthority(value:number):number{return Math.max(0,Math.min(100,Math.trunc(value)));}
