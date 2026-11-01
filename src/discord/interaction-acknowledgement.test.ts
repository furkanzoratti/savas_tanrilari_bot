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

  it("Büyük Oyunlar yenileme ve form gönderimlerini ağır işlemlerden önce onaylar",()=>{
    const source=readFileSync(new URL("./great-games-ui-v2.ts",import.meta.url),"utf8");
    const refresh=source.slice(source.indexOf('if (action === "public-refresh")'),source.indexOf('if (action === "start")'));
    expect(refresh.indexOf("await interaction.deferUpdate()"))
      .toBeLessThan(refresh.indexOf("await publicGamePayload"));

    const modal=source.slice(source.indexOf("export async function handleGreatGamesModal"));
    expect(modal.indexOf("await interaction.deferUpdate()"))
      .toBeLessThan(modal.indexOf("await ownCountry"));
    expect(modal).toContain("else await interaction.deferReply({flags:MessageFlags.Ephemeral})");
    expect(modal).toContain('new Set(["gladiator-bet","chariot-bet","bid","action"])');

    const couponSelect=source.slice(
      source.indexOf('if(interaction.customId.startsWith("ggs2|gladiator-coupon|"))'),
      source.indexOf('if (interaction.customId.startsWith("ggs2|gladiator-fighter|"))')
    );
    expect(couponSelect.indexOf("await interaction.deferUpdate()"))
      .toBeLessThan(couponSelect.indexOf("await ownCountry"));
  });
});
