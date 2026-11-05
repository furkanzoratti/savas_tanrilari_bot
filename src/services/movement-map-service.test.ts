import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("görsel hareket haritası sunucu kapsamı",()=>{
  it("yerleşkeleri doğrudan bulunmayan guild_id alanından sorgulamaz",()=>{
    const source=readFileSync(new URL("./movement-map-service.ts",import.meta.url),"utf8");

    expect(source).not.toContain("settlement.guild_id");
    expect(source).not.toContain("FROM settlements WHERE guild_id");
    expect(source).toContain("JOIN countries country ON country.id=settlement.country_id");
    expect(source).toContain("WHERE country.guild_id=$1");
  });

  it("genişletilmiş R56 kataloğunu ve siyasi değişim katmanını kullanır",()=>{
    const source=readFileSync(new URL("./movement-map-service.ts",import.meta.url),"utf8");

    expect(source).toContain("hex-map-r56-expanded.json");
    expect(source).toContain("hex-settlement-aliases.json");
    expect(source).toContain("visual_map_territory_baselines");
    expect(source).toContain("settlement_occupations");
    expect(source).toContain("active_war.status='ACTIVE'");
    expect(source).toContain("owner_changed");
    expect(source).toContain("owner.map_color AS owner_map_color");
    expect(source).toContain("countryMapColor(country.name)");
    expect(source).toContain("supportsFormation");
    expect(source).toContain('hex.type==="COAST"');
    expect(source).toContain("(owner.capital_settlement_id=settlement.id) AS is_capital");
    expect(source).toContain("legacyTransform");
    expect(source).toContain("claimNearestAvailableLandHex");
    expect(source).toContain("__MIGRATING__");
    expect(source).not.toContain("DELETE FROM visual_map_settlement_positions");
  });
});
