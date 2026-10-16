import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("casusluk görselli olay teslimi",()=>{
  it("sonuçları görev ve casus akıbeti görselleriyle yerleşke kanalına yollar",()=>{
    const ui=read("./espionage-ui.ts");
    const service=read("../services/espionage-service.ts");
    const handler=read("./handler.ts");
    expect(ui).toContain("publishPendingEspionagePublications");
    expect(ui).toContain("embeds:[resultEmbed,fateEmbed]");
    expect(ui).toContain("espionagePublicDetectionImage");
    expect(service).toContain("operation.public_posted_at IS NULL");
    expect(service).toContain("settlement.espionage_event_channel_id IS NOT NULL");
    expect(handler).toContain("await publishPendingEspionagePublications(client,guildId)");
  });
});
