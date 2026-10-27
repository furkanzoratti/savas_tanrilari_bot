import {clampWarScore,type WarSide} from "./war-objectives.js";

export const WAR_SCORE_MODEL_VERSION=5;
export const MAX_BATTLE_SCORE_COMPONENT=40;
export const INDEMNITY_GOLD_PER_WAR_SCORE=1_000;
export const MIN_SIEGE_DEFENDERS_FOR_BATTLE_SCORE=5_000;

export interface ProvinceWarValueInput{
  id:string;
  countryId:string;
  side:WarSide;
  population:number;
  income:number;
  infrastructure:number;
  capital:boolean;
  coastal:boolean;
  greatProject:boolean;
  warGoal:boolean;
}

export interface ProvinceWarValue extends ProvinceWarValueInput{
  occupationScore:number;
  countryOccupationScore:number;
  peaceCost:number;
}

function safeShare(value:number,total:number,count:number):number{
  return total>0?Math.max(0,value)/total:1/Math.max(1,count);
}

function occupationWeight(province:ProvinceWarValueInput):number{
  return 10+Math.sqrt(Math.max(0,province.population)/1_000)*3
    +Math.sqrt(Math.max(0,province.income))*1.5
    +Math.max(0,province.infrastructure)*2
    +(province.capital?15:0)+(province.coastal?3:0)+(province.greatProject?10:0)+(province.warGoal?8:0);
}

function allocateHundred(provinces:ProvinceWarValueInput[]):Map<string,number>{
  const result=new Map<string,number>();
  if(!provinces.length)return result;
  const weighted=provinces.map((province)=>({province,weight:occupationWeight(province)}));
  const total=weighted.reduce((sum,item)=>sum+item.weight,0);
  const allocations=weighted.map((item)=>{
    const exact=total>0?item.weight/total*100:100/weighted.length;
    return{...item,points:Math.floor(exact),fraction:exact-Math.floor(exact)};
  });
  let remainder=100-allocations.reduce((sum,item)=>sum+item.points,0);
  allocations.sort((first,second)=>second.fraction-first.fraction||first.province.id.localeCompare(second.province.id));
  for(let index=0;remainder>0;index=(index+1)%allocations.length,remainder-=1)allocations[index]!.points+=1;
  for(const allocation of allocations)result.set(allocation.province.id,allocation.points);
  return result;
}

export function provinceWarValues(provinces:ProvinceWarValueInput[]):ProvinceWarValue[]{
  const occupationById=new Map<string,number>();
  for(const side of ["ATTACKER","DEFENDER"] as const){
    for(const [id,points] of allocateHundred(provinces.filter((province)=>province.side===side)))occupationById.set(id,points);
  }
  const byCountry=new Map<string,ProvinceWarValueInput[]>();
  for(const province of provinces)byCountry.set(province.countryId,[...(byCountry.get(province.countryId)??[]),province]);
  const countryOccupationById=new Map<string,number>();
  const peaceById=new Map<string,number>();
  for(const countryProvinces of byCountry.values()){
    for(const [id,points] of allocateHundred(countryProvinces))countryOccupationById.set(id,points);
    const count=countryProvinces.length;
    const populationTotal=countryProvinces.reduce((sum,item)=>sum+Math.max(0,item.population),0);
    const incomeTotal=countryProvinces.reduce((sum,item)=>sum+Math.max(0,item.income),0);
    const infrastructureTotal=countryProvinces.reduce((sum,item)=>sum+Math.max(0,item.infrastructure),0);
    for(const province of countryProvinces){
      let cost=15/count
        +40*safeShare(province.population,populationTotal,count)
        +25*safeShare(province.income,incomeTotal,count)
        +10*safeShare(province.infrastructure,infrastructureTotal,count)
        +(province.capital?8:0)+(province.coastal?2:0)+(province.greatProject?6:0);
      if(province.warGoal)cost*=.75;
      peaceById.set(province.id,Math.max(3,Math.min(60,Math.ceil(cost))));
    }
  }
  return provinces.map((province)=>({...province,
    occupationScore:occupationById.get(province.id)??0,
    countryOccupationScore:countryOccupationById.get(province.id)??0,
    peaceCost:peaceById.get(province.id)??3
  }));
}

export function battleWarScorePoints(input:{
  winnerInitial:number;loserInitial:number;winnerLosses:number;loserLosses:number;loserRemaining:number;
}):number{
  const winnerInitial=Math.max(0,input.winnerInitial);
  const loserInitial=Math.max(0,input.loserInitial);
  if(!winnerInitial||!loserInitial)return 0;
  const engaged=winnerInitial+loserInitial;
  const sizePoints=engaged<2_000?1:engaged<5_000?2:engaged<10_000?3:engaged<20_000?4:
    engaged<40_000?6:engaged<75_000?8:engaged<150_000?10:12;
  const winnerLossRate=Math.min(1,Math.max(0,input.winnerLosses)/winnerInitial);
  const loserLossRate=Math.min(1,Math.max(0,input.loserLosses)/loserInitial);
  const advantage=loserLossRate-winnerLossRate;
  const decisiveBonus=advantage>=.6?3:advantage>=.35?2:advantage>=.15?1:0;
  const annihilationBonus=input.loserRemaining<=0?2:0;
  return Math.max(1,Math.min(15,sizePoints+decisiveBonus+annihilationBonus));
}

export function battleQualifiesForWarScore(terrain:string,defenderInitial:number):boolean{
  return terrain!=="SIEGE"||Math.max(0,Math.trunc(defenderInitial))>=MIN_SIEGE_DEFENDERS_FOR_BATTLE_SCORE;
}

export function calculateWarBalance(input:{
  attackerOccupation:number;defenderOccupation:number;battleNet:number;
}):number{
  const attackerOccupation=Math.max(0,Math.min(100,Math.trunc(input.attackerOccupation)));
  const defenderOccupation=Math.max(0,Math.min(100,Math.trunc(input.defenderOccupation)));
  if(attackerOccupation===100&&defenderOccupation<100)return 100;
  if(defenderOccupation===100&&attackerOccupation<100)return -100;
  const battleNet=Math.max(-MAX_BATTLE_SCORE_COMPONENT,Math.min(MAX_BATTLE_SCORE_COMPONENT,Math.trunc(input.battleNet)));
  return clampWarScore(attackerOccupation-defenderOccupation+battleNet);
}

export function availableWarScore(attackerScore:number,side:WarSide):number{
  return Math.max(0,side==="ATTACKER"?Math.trunc(attackerScore):-Math.trunc(attackerScore));
}

export function indemnityWarScoreCost(amount:number):number{
  return amount<=0?0:Math.ceil(amount/INDEMNITY_GOLD_PER_WAR_SCORE);
}

export function peaceDemandWarScoreCost(termCosts:number[]):number{
  return termCosts.reduce((total,cost)=>total+Math.max(0,Math.trunc(cost)),0);
}

export function fullAnnexationWarScoreCosts(rawCosts:number[]):number[]{
  if(!rawCosts.length)return[];
  const weights=rawCosts.map((cost)=>Math.max(0,Math.abs(Math.trunc(cost))));
  const total=weights.reduce((sum,cost)=>sum+cost,0);
  if(total<=0)return rawCosts.map(()=>0);
  const allocations=weights.map((weight,index)=>{
    const exact=weight/total*100;
    const points=Math.floor(exact);
    return{index,points,fraction:exact-points};
  });
  let remainder=100-allocations.reduce((sum,item)=>sum+item.points,0);
  allocations.sort((left,right)=>right.fraction-left.fraction||left.index-right.index);
  for(let index=0;remainder>0;index=(index+1)%allocations.length,remainder-=1)allocations[index]!.points+=1;
  const result=Array<number>(rawCosts.length).fill(0);
  for(const allocation of allocations)result[allocation.index]=allocation.points;
  return result;
}
