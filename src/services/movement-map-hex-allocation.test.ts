import {describe,expect,it} from "vitest";
import {claimNearestAvailableLandHex,type SettlementMapHex} from "./movement-map-hex-allocation.js";

const hexes:SettlementMapHex[]=[
  {code:"A01",type:"LAND",playable:true,center:{pixelX:0,pixelY:0}},
  {code:"B01",type:"LAND",playable:true,center:{pixelX:10,pixelY:0}},
  {code:"C01",type:"SEA",playable:true,center:{pixelX:5,pixelY:0}},
  {code:"D01",type:"LAND",playable:false,center:{pixelX:2,pixelY:0}},
  {code:"E01",type:"COAST",playable:true,center:{pixelX:20,pixelY:0}}
];

describe("yerleşke hex tahsisi",()=>{
  it("istenen kara hexi boşsa doğrudan ayırır",()=>{
    const occupied=new Set<string>();
    expect(claimNearestAvailableLandHex(hexes,"A01",occupied)).toBe("A01");
    expect(occupied.has("A01")).toBe(true);
  });

  it("istenen hex doluysa en yakın boş ve geçilebilir kara hexini ayırır",()=>{
    const occupied=new Set<string>(["A01"]);
    expect(claimNearestAvailableLandHex(hexes,"A01",occupied)).toBe("B01");
    expect(occupied.has("B01")).toBe(true);
  });

  it("kıyı-karma hexini yerleşke için geçilebilir kara olarak kabul eder",()=>{
    const occupied=new Set<string>(["A01","B01"]);
    expect(claimNearestAvailableLandHex(hexes,"A01",occupied)).toBe("E01");
  });
});
