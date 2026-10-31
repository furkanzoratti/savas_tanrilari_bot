export const MISSIONARY_BASE_PROGRESS=8;

export function missionaryPopulationPenalty(population:number):number{
  if(population>=400_000)return 4;
  if(population>=200_000)return 3;
  if(population>=100_000)return 2;
  if(population>=50_000)return 1;
  return 0;
}

export function missionaryBeliefPenalty(resistingPercent:number):number{
  if(resistingPercent>=80)return 4;
  if(resistingPercent>=60)return 3;
  if(resistingPercent>=40)return 2;
  if(resistingPercent>0)return 1;
  return 0;
}
