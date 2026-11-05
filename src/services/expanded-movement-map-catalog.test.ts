import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

type Hex={code:string;type:"LAND"|"SEA"|"COAST"|"IMPASSABLE"};
type Catalog={mapVersion:string;grid:{width:number;height:number;columns:number;rows:number};legacyTransform?:{coordinateSystem:string};settlements:Record<string,{hexCode:string;pixel:{x:number;y:number}}>;hexes:Hex[]};

describe("R56 Expanded hareket haritası kataloğu",()=>{
  const catalog=JSON.parse(readFileSync(new URL("../../assets/hex-map-r56-expanded.json",import.meta.url),"utf8")) as Catalog;

  it("tam boyutlu harita ve tüm yerleşke bağlarını taşır",()=>{
    expect(catalog.mapVersion).toBe("r56-political-v8-coastal-grid-v3");
    expect(catalog.grid).toMatchObject({width:12928,height:6670,columns:154,rows:69});
    expect(catalog.hexes).toHaveLength(10626);
    expect(Object.keys(catalog.settlements)).toHaveLength(230);
    expect(catalog.legacyTransform?.coordinateSystem).toBe("pixel");
  });

  it("yerleşkeleri geçilebilir kara hexlerine bağlar",()=>{
    const hexes=new Map(catalog.hexes.map((hex)=>[hex.code,hex]));
    expect(Object.values(catalog.settlements).every((item)=>["LAND","COAST"].includes(hexes.get(item.hexCode)?.type??""))).toBe(true);
    expect(new Set(Object.values(catalog.settlements).map((item)=>item.hexCode)).size).toBe(Object.keys(catalog.settlements).length);
    expect(catalog.settlements.Camulodunon?.hexCode).toBe("N32");
    expect(catalog.settlements.Roma?.hexCode).toBe("U43");
    expect(catalog.settlements.Alexandria?.hexCode).toBe("AJ54");
    expect(catalog.settlements.Zarmizegetusa?.hexCode).toBe("AE38");
    expect(catalog.settlements.Malva?.hexCode).toBe("AG40");
    expect(catalog.settlements.Pulpudeva?.hexCode).toBe("AF42");
  });

  it("Orta Asya yerleşkelerini etkin kara hexlerine bağlar",()=>{
    const hexes=new Map(catalog.hexes.map((hex)=>[hex.code,hex]));
    for(const name of ["Uda Otlakları","Baykal Kışlağı","Angara Geçidi","Barguzin Vadisi","Xianbei Dağı Ordugâhı","Nen Nehri Pazarı","Longcheng Ordugâhı"]){
      expect(catalog.settlements[name],name).toBeDefined();
      expect(["LAND","COAST"],name).toContain(hexes.get(catalog.settlements[name].hexCode)?.type);
    }
  });
});

describe("R56 Expanded deploy paketi",()=>{
  it("yeni arka planı paketler ve eksik varlıkta paneli çökertmez",()=>{
    const dockerfile=readFileSync(new URL("../../Dockerfile",import.meta.url),"utf8");
    const server=readFileSync(new URL("../admin/server.ts",import.meta.url),"utf8");
    expect(dockerfile).toContain("COPY maps/r56/R56-POLITICAL-v8.png ./maps/r56/R56-POLITICAL-v8.png");
    expect(server).toContain("MAP_ASSET_UNAVAILABLE");
    expect(server).toContain("try{content=await readFile(file);}");
  });
});
