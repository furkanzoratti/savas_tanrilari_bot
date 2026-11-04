export type SettlementMapHex={
  code:string;
  type:"LAND"|"SEA"|"IMPASSABLE";
  playable:boolean;
  center:{pixelX:number;pixelY:number};
};

export function claimNearestAvailableLandHex(
  hexes:SettlementMapHex[],
  requestedCode:string,
  occupied:Set<string>
):string|null{
  const requested=hexes.find((hex)=>hex.code===requestedCode);
  if(!requested)return null;
  let selected:SettlementMapHex|null=null;
  let selectedDistance=Number.POSITIVE_INFINITY;
  for(const candidate of hexes){
    if(candidate.type!=="LAND"||!candidate.playable||occupied.has(candidate.code))continue;
    const distance=(candidate.center.pixelX-requested.center.pixelX)**2+(candidate.center.pixelY-requested.center.pixelY)**2;
    if(distance<selectedDistance||(distance===selectedDistance&&candidate.code.localeCompare(selected?.code??"")<0)){
      selected=candidate;
      selectedDistance=distance;
    }
  }
  if(!selected)return null;
  occupied.add(selected.code);
  return selected.code;
}
