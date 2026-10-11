import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("gecikmeye duyarlı Discord komutları",()=>{
  it("Akademi ve otomatik alımı yönlendirmeden önce yanıtlar",()=>{
    const source=readFileSync(new URL("./handler.ts",import.meta.url),"utf8");
    expect(source).toContain('["akademi","otomatik-alim"].includes(interaction.commandName)');
    expect(source).toContain('interaction.commandName==="akademi"&&interaction.options.getSubcommand(false)==="egit"');
    expect(source).toContain("await interaction.deferReply(publicAcademyTraining?{}:{flags:MessageFlags.Ephemeral})");
  });

  it("alt işleyiciler önceden yanıtlanmış etkileşimi ikinci kez ertelemez",()=>{
    const city=readFileSync(new URL("./city-ui.ts",import.meta.url),"utf8");
    const autoPurchase=readFileSync(new URL("./player-auto-purchase-ui.ts",import.meta.url),"utf8");
    expect(city).toContain("if(!interaction.deferred&&!interaction.replied)");
    expect(autoPurchase).toContain("if(!interaction.deferred&&!interaction.replied)");
  });
});
