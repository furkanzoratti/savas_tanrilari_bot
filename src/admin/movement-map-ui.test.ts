import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("hareket haritası GM yerleştirme arayüzü",()=>{
  const html=readFileSync(new URL("./public/movement-map.html",import.meta.url),"utf8");
  const script=readFileSync(new URL("./public/movement-map.js",import.meta.url),"utf8");

  it("ülke, tür ve birlik seçerek doğrudan haritaya yerleştirmeyi sunar",()=>{
    expect(html).toContain('id="gmPlacement"');
    expect(html).toContain('id="placementCountry"');
    expect(html).toContain('id="placementKind"');
    expect(html).toContain('id="placementForce"');
    expect(script).toContain("startPlacementMode");
    expect(script).toContain("placeSelectedAt");
    expect(script).toContain('/api/movement-map/forces/${state.selected.kind}/${state.selected.id}/position');
  });

  it("kara ve deniz objelerini ayrı simgeler ve ülke bayrağıyla çizer",()=>{
    expect(script).toContain("drawArmyMarker");
    expect(script).toContain("drawFleetMarker");
    expect(script).toContain("drawFlagBadge");
    expect(script).toContain("r56-political-v8-coastal-grid-v3");
  });

  it("işgal maskesine deniz veya boş alanı dahil etmez",()=>{
    expect(script).toContain("isPoliticalFill");
    expect(script).toContain("POLITICAL_SEA");
    expect(script).toContain("state.territoryMaskCache.set(cacheKey,null)");
    expect(script).toContain('mode==="OWNER"');
    expect(script).toContain('strokeStyle="rgba(0,0,0,.92)"');
  });

  it("siyasi haritayı gerçek bölge maskesiyle boyar ve işgali çapraz tarar",()=>{
    expect(html).toContain("Siyasi Harita");
    expect(html).not.toContain("Siyasi değişimler");
    expect(script).toContain("politicalRegionMask");
    expect(script).toContain("politicalCountryColor");
    expect(script).toContain('mode==="OWNER"');
    expect(script).toContain('politicalPatch(territory,"OCCUPATION"');
    expect(script).toContain("ownerColorMismatch");
    expect(script).toContain('current.type==="COAST"?"Kıyı • Kara ve deniz"');
    expect(script).toContain("refreshPoliticalState");
    expect(script).not.toContain('territory.occupier_country_id?".42":".28"');
  });
});
