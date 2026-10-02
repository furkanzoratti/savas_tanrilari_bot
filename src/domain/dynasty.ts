export type DynastyGender = "MALE" | "FEMALE";
export type DynastyHealth = "HEALTHY" | "SICK";
export type DynastyMemberStatus = "ALIVE" | "DEAD";
export type BirthComplication = "DEATH" | "ILLNESS" | "HEALTHY";

export const DYNASTY_GENDER_LABELS:Record<DynastyGender,string>={
  MALE:"Erkek",FEMALE:"Kadın"
};

export const DYNASTY_HEALTH_LABELS:Record<DynastyHealth,string>={
  HEALTHY:"Sağlıklı",SICK:"Hasta"
};

export const BIRTH_ATTEMPT_COOLDOWN_TURNS=2;
export const MATERNAL_ILLNESS_COOLDOWN_TURNS=3;
export const MINIMUM_PARENT_AGE=18;
export const MAXIMUM_BIRTH_PARENT_AGE=44;
export const MINIMUM_MARRIAGE_AGE=16;

export function dynastyMemberCanMarry(age:number|null,status:DynastyMemberStatus,spouseId:string|null):boolean{
  return status==="ALIVE"&&age!==null&&age>=MINIMUM_MARRIAGE_AGE&&spouseId===null;
}

export function dynastyMemberCanBeBirthParent(input:{
  memberId:string;monarchId:string;status:DynastyMemberStatus;spouseId:string|null;
  motherId:string|null;fatherId:string|null;
}):boolean{
  const isMonarch=input.memberId===input.monarchId;
  const isMonarchChild=input.motherId===input.monarchId||input.fatherId===input.monarchId;
  return input.status==="ALIVE"&&Boolean(input.spouseId)&&(isMonarch||isMonarchChild);
}

export function dynastyDeathFailureMaximum(age:number):number{
  if(age<=60)return 0;
  if(age<=64)return 1;
  if(age<=69)return 2;
  if(age<=74)return 4;
  if(age<=79)return 7;
  return 10;
}

export function dynastyDeathSaveFailed(age:number,roll:number):boolean{
  return roll<=dynastyDeathFailureMaximum(age);
}

export function birthAgeModifier(age:number):number|null{
  if(age<MINIMUM_PARENT_AGE||age>MAXIMUM_BIRTH_PARENT_AGE)return null;
  if(age<=29)return 3;
  if(age<=34)return 1;
  if(age<=39)return -2;
  return -5;
}

export function birthAttemptSucceeded(age:number,roll:number):boolean{
  const modifier=birthAgeModifier(age);
  return modifier!==null&&roll+modifier>=11;
}

export function birthComplication(roll:number):BirthComplication{
  if(roll===1)return "DEATH";
  if(roll<=4)return "ILLNESS";
  return "HEALTHY";
}

export function newbornGender(roll:number):DynastyGender{
  return roll===1?"MALE":"FEMALE";
}
