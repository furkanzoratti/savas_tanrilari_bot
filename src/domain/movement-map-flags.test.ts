import {existsSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {movementMapFlagFilename,MOVEMENT_MAP_FLAG_FILENAMES} from "./movement-map-flags.js";

describe("hareket haritası ülke bayrakları",()=>{
  it("Türkçe ülke adlarını güvenli küçük bayrak dosyalarına bağlar",()=>{
    expect(movementMapFlagFilename("Büyük Kartaca")).toBe("buyuk-kartaca.webp");
    expect(movementMapFlagFilename("Nil İmparatorluğu")).toBe("nil-imparatorlugu.webp");
    expect(movementMapFlagFilename("İranşahr")).toBe("iransahr.webp");
    expect(movementMapFlagFilename("Persis")).toBe("iransahr.webp");
    expect(MOVEMENT_MAP_FLAG_FILENAMES.size).toBe(14);
  });

  it("bayrağı bulunmayan ülkeyi güvenli biçimde boş bırakır",()=>{
    expect(movementMapFlagFilename("Bilinmeyen Devlet")).toBeNull();
  });

  it("eşlenen bütün küçük bayrakları deploy varlıklarında bulundurur",()=>{
    for(const filename of MOVEMENT_MAP_FLAG_FILENAMES){
      expect(existsSync(new URL(`../../assets/movement-map-flags/${filename}`,import.meta.url))).toBe(true);
    }
  });
});
