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

export interface DynastyKinshipMember{
  id:string;
  gender:DynastyGender;
  relation:string;
  is_monarch:boolean;
  spouse_id:string|null;
  mother_id:string|null;
  father_id:string|null;
  status?:DynastyMemberStatus;
}

const parentIds=(member:DynastyKinshipMember|undefined):string[]=>member
  ?[member.mother_id,member.father_id].filter((id):id is string=>Boolean(id))
  :[];

function ancestorDistances(
  memberId:string,byId:Map<string,DynastyKinshipMember>,maximumDepth=12
):Map<string,number>{
  const result=new Map<string,number>();
  const queue=parentIds(byId.get(memberId)).map((id)=>({id,distance:1}));
  while(queue.length){
    const current=queue.shift()!;
    const known=result.get(current.id);
    if(current.distance>maximumDepth||known!==undefined&&known<=current.distance)continue;
    result.set(current.id,current.distance);
    for(const parentId of parentIds(byId.get(current.id)))queue.push({id:parentId,distance:current.distance+1});
  }
  return result;
}

function siblings(firstId:string,secondId:string,byId:Map<string,DynastyKinshipMember>):boolean{
  if(firstId===secondId)return false;
  const firstParents=new Set(parentIds(byId.get(firstId)));
  return parentIds(byId.get(secondId)).some((id)=>firstParents.has(id));
}

function descendantLabel(distance:number,gender:DynastyGender):string{
  if(distance===1)return gender==="MALE"?"oğlu":"kızı";
  if(distance===2)return"torunu";
  if(distance===3)return"büyük torunu";
  return distance+". kuşak altsoyu";
}

function ancestorLabel(
  distance:number,target:DynastyKinshipMember,ruler:DynastyKinshipMember,byId:Map<string,DynastyKinshipMember>
):string{
  if(distance===1)return target.gender==="MALE"?"babası":"annesi";
  if(distance===2){
    const mother=byId.get(ruler.mother_id??"");
    if(parentIds(mother).includes(target.id))return target.gender==="MALE"?"dedesi":"anneannesi";
    const father=byId.get(ruler.father_id??"");
    if(parentIds(father).includes(target.id))return target.gender==="MALE"?"dedesi":"babaannesi";
    return target.gender==="MALE"?"dedesi":"büyükannesi";
  }
  if(distance===3)return target.gender==="MALE"?"büyük dedesi":"büyükannesi";
  return distance+". kuşak atası";
}

function collateralLabel(
  ruler:DynastyKinshipMember,target:DynastyKinshipMember,byId:Map<string,DynastyKinshipMember>
):string|null{
  if(siblings(ruler.id,target.id,byId))return target.gender==="MALE"?"erkek kardeşi":"kız kardeşi";

  const targetParents=parentIds(target);
  if(targetParents.some((parentId)=>siblings(ruler.id,parentId,byId)))return"yeğeni";

  for(const [parentId,side] of [[ruler.father_id,"PATERNAL"],[ruler.mother_id,"MATERNAL"]] as const){
    if(!parentId||!siblings(parentId,target.id,byId))continue;
    if(side==="PATERNAL")return target.gender==="MALE"?"amcası":"halası";
    return target.gender==="MALE"?"dayısı":"teyzesi";
  }

  const rulerParents=parentIds(ruler);
  if(targetParents.some((targetParent)=>rulerParents.some((rulerParent)=>siblings(rulerParent,targetParent,byId))))return"kuzeni";

  const rulerAncestors=ancestorDistances(ruler.id,byId);
  const targetAncestors=ancestorDistances(target.id,byId);
  const common=[...rulerAncestors.entries()]
    .filter(([id])=>targetAncestors.has(id))
    .map(([id,rulerDistance])=>({id,rulerDistance,targetDistance:targetAncestors.get(id)!}))
    .sort((left,right)=>left.rulerDistance+left.targetDistance-(right.rulerDistance+right.targetDistance))[0];
  if(!common)return null;
  const degree=Math.max(1,Math.min(common.rulerDistance,common.targetDistance)-1);
  const removal=common.targetDistance-common.rulerDistance;
  const cousin=degree===1?"kuzeni":degree+". dereceden kuzeni";
  if(removal===0)return cousin;
  if(removal===1)return cousin+"nin "+(target.gender==="MALE"?"oğlu":"kızı");
  if(removal>1)return cousin+"nin "+removal+". kuşak altsoyu";
  if(removal===-1)return"ebeveyninin "+cousin;
  return Math.abs(removal)+" kuşak üstten "+cousin;
}

function bloodRelation(
  ruler:DynastyKinshipMember,target:DynastyKinshipMember,byId:Map<string,DynastyKinshipMember>
):string|null{
  if(target.id===ruler.id)return"Hükümdar";
  const targetAncestors=ancestorDistances(target.id,byId);
  const descendantDistance=targetAncestors.get(ruler.id);
  if(descendantDistance!==undefined)return descendantLabel(descendantDistance,target.gender);
  const rulerAncestors=ancestorDistances(ruler.id,byId);
  const ancestorDistance=rulerAncestors.get(target.id);
  if(ancestorDistance!==undefined)return ancestorLabel(ancestorDistance,target,ruler,byId);
  return collateralLabel(ruler,target,byId);
}

function marriedRelation(
  ruler:DynastyKinshipMember,target:DynastyKinshipMember,byId:Map<string,DynastyKinshipMember>
):string|null{
  if(!target.spouse_id)return null;
  const spouse=byId.get(target.spouse_id);
  if(!spouse)return null;
  const relation=bloodRelation(ruler,spouse,byId);
  if(!relation)return null;
  if(relation==="Hükümdar")return"eşi";
  if(relation==="oğlu"||relation==="kızı")return target.gender==="FEMALE"?"gelini":"damadı";
  if(relation==="erkek kardeşi"||relation==="kız kardeşi")return target.gender==="FEMALE"?"yengesi":"eniştesi";
  if(relation==="babası"||relation==="annesi")return target.gender==="FEMALE"?"üvey annesi":"üvey babası";
  if(relation==="amcası"||relation==="dayısı")return"yengesi";
  if(relation==="halası"||relation==="teyzesi")return"eniştesi";
  if(relation.includes("torunu"))return"torununun eşi";
  if(relation.includes("yeğeni"))return"yeğeninin eşi";
  if(relation.includes("kuzeni"))return"kuzeninin eşi";
  return relation+" olan kişinin eşi";
}

function fallbackRelation(relation:string):string{
  const normalized=relation.trim().toLocaleLowerCase("tr-TR");
  return normalized==="hanedan akrabası"||normalized==="hanedan üyesi"
    ?"Soy bağı belirlenemedi"
    :relation;
}

export function automaticDynastyRelations<T extends DynastyKinshipMember>(members:readonly T[]):T[]{
  const byId=new Map<string,DynastyKinshipMember>(members.map((member)=>[member.id,member]));
  const ruler=members.find((member)=>member.is_monarch&&member.status!=="DEAD");
  if(!ruler)return members.map((member)=>({...member,relation:fallbackRelation(member.relation)}));
  return members.map((member)=>{
    const blood=bloodRelation(ruler,member,byId);
    const relation=blood==="Hükümdar"?blood:blood?"Hükümdarın "+blood:null;
    const marriage=relation??marriedRelation(ruler,member,byId);
    return{...member,relation:marriage&&marriage!=="Hükümdar"&&!marriage.startsWith("Hükümdarın ")
      ?"Hükümdarın "+marriage
      :marriage??fallbackRelation(member.relation)};
  });
}

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

export function orderedDynastyCoupleIds(firstMemberId:string,secondMemberId:string):[string,string]{
  return firstMemberId.localeCompare(secondMemberId)<=0
    ?[firstMemberId,secondMemberId]
    :[secondMemberId,firstMemberId];
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
