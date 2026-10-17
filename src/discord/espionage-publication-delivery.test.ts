import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("casusluk görselli olay teslimi",()=>{
  it("sonuçları görev ve casus akıbeti görselleriyle yerleşke kanalına yollar",()=>{
    const ui=read("./espionage-ui.ts");
    const service=read("../services/espionage-service.ts");
    const handler=read("./handler.ts");
    expect(ui).toContain("publishPendingEspionagePublications");
    expect(ui).toContain("const embeds=[resultEmbed]");
    expect(ui).toContain("if (disclosure)");
    expect(ui).toContain("await channel.send({embeds,files})");
    expect(ui).toContain("espionagePublicDetectionImage");
    expect(ui).toContain("if (!channelId)");
    expect(ui).toContain("await espionageService.markPublicPosted(operation.id)");
    expect(ui).toContain("await espionageService.markPublicFailed(operation.id");
    expect(ui).toContain("await espionageService.markPublicSkipped(operation.id");
    expect(service).toContain("operation.public_posted_at IS NULL");
    expect(handler).toContain("await publishPendingEspionagePublications(client,guildId)");
    expect(handler).toContain("const characterAutomation = await processDueCharacterSystems(interaction.client, interaction.guildId, result.turn, result.acquisition)");
  });
});
