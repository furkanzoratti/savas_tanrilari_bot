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
});
