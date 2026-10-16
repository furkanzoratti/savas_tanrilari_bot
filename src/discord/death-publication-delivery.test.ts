import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const ui=readFileSync(new URL("./death-publication-ui.ts",import.meta.url),"utf8");
const handler=readFileSync(new URL("./handler.ts",import.meta.url),"utf8");

describe("ölüm olayı yayın teslimi",()=>{
  it("yerleşke olay kanalını ve mevcut ölüm görsellerini kullanır",()=>{
    expect(ui).toContain("publishPendingDeathPublications");
    expect(ui).toContain("dynasty-death-male-banner.png");
    expect(ui).toContain("dynasty-death-female-banner.png");
    expect(ui).toContain("dynasty-deaths-banner.png");
    expect(ui).toContain("publication.was_monarch");
  });

  it("tur karakter otomasyonundan sonra bekleyen ölüm olaylarını yayımlar",()=>{
    expect(handler).toContain("await publishPendingDeathPublications(client,guildId)");
    expect(handler).toContain("deathPublicationsPublished");
  });
});
