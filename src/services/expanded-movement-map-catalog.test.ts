import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

type Hex={code:string;type:"LAND"|"SEA"|"IMPASSABLE"};
type Catalog={mapVersion:string;grid:{width:number;height:number;columns:number;rows:number};legacyTransform?:{coordinateSystem:string};settlements:Record<string,{hexCode:string}>;hexes:Hex[]};

describe("R56 Expanded hareket haritası kataloğu",()=>{
  const catalog=JSON.parse(readFileSync(new URL("../../assets/hex-map-r56-expanded.json",import.meta.url),"utf8")) as Catalog;

  it("tam boyutlu harita ve tüm yerleşke bağlarını taşır",()=>{
    expect(catalog.mapVersion).toBe("r56-expanded-v7");
    expect(catalog.grid).toMatchObject({width:12928,height:6670,columns:154,rows:69});
    expect(catalog.hexes).toHaveLength(10626);
    expect(Object.keys(catalog.settlements)).toHaveLength(209);
    expect(catalog.legacyTransform?.coordinateSystem).toBe("pixel");
  });

  it("yerleşkeleri geçilebilir kara hexlerine bağlar",()=>{
    const hexes=new Map(catalog.hexes.map((hex)=>[hex.code,hex]));
    expect(Object.values(catalog.settlements).every((item)=>hexes.get(item.hexCode)?.type==="LAND")).toBe(true);
    expect(catalog.settlements.Camulodunon?.hexCode).toBe("L31");
    expect(catalog.settlements.Roma?.hexCode).toBe("U43");
    expect(catalog.settlements.Alexandria?.hexCode).toBe("AJ54");
  });
});
