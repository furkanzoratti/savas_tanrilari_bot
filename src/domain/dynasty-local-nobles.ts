import {CULTURE_GROUPS,type CultureGroup} from "./cultures.js";
import {culturalDynastyNameCandidates} from "./dynasty-names.js";
import {MINIMUM_MARRIAGE_AGE,type DynastyGender} from "./dynasty.js";

export interface LocalNobleCandidate{
  key:string;
  name:string;
  gender:DynastyGender;
  age:number;
  title:"Soylu Bey"|"Soylu Hanım";
  cultureGroup:CultureGroup;
  cultureLabel:string;
}

const AGE_OFFSETS=[-6,-3,0,3,6,9] as const;

function stableHash(value:string):number{
  let hash=2166136261;
  for(let index=0;index<value.length;index+=1){
    hash^=value.charCodeAt(index);
    hash=Math.imul(hash,16777619);
  }
  return hash>>>0;
}

function normalized(value:string):string{return value.trim().toLocaleLowerCase("tr-TR");}

function unusedName(base:string,used:Set<string>):string{
  if(!used.has(normalized(base))){used.add(normalized(base));return base;}
  for(let suffix=2;;suffix+=1){
    const candidate=base+" "+suffix;
    if(!used.has(normalized(candidate))){used.add(normalized(candidate));return candidate;}
  }
}

export function localNobleMarriageCandidates(input:{
  dynastyId:string;memberId:string;memberGender:DynastyGender;memberAge:number;
  cultureGroup:CultureGroup;currentTurn:number;usedNames:Iterable<string>;
}):LocalNobleCandidate[]{
  const gender: DynastyGender=input.memberGender==="MALE"?"FEMALE":"MALE";
  const title=gender==="MALE"?"Soylu Bey":"Soylu Hanım";
  const seed=[input.dynastyId,input.memberId,input.cultureGroup,input.currentTurn].join("|");
  const names=[...culturalDynastyNameCandidates(input.cultureGroup,gender)];
  const nameOffset=stableHash(seed+"|names")%names.length;
  const ageOffset=stableHash(seed+"|ages")%AGE_OFFSETS.length;
  const used=new Set([...input.usedNames].map(normalized));
  return names.map((_,index)=>{
    const name=unusedName(names[(nameOffset+index)%names.length]!,used);
    const delta=AGE_OFFSETS[(ageOffset+index)%AGE_OFFSETS.length]!;
    const age=Math.max(MINIMUM_MARRIAGE_AGE,Math.min(90,input.memberAge+delta));
    const fingerprint=stableHash([seed,index,name,gender,age].join("|")).toString(36);
    return{
      key:`${input.currentTurn}.${index}.${fingerprint}`,name,gender,age,title,
      cultureGroup:input.cultureGroup,cultureLabel:CULTURE_GROUPS[input.cultureGroup].label
    };
  });
}
