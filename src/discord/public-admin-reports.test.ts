import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./handler.ts", import.meta.url), "utf8");

describe("kanalda yayımlanan yönetici raporları", () => {
  it("tur ilerletme dökümünü ve bütün devam kartlarını herkese açık yollar", () => {
    expect(source).toContain('interaction.deferReply(sub === "tur-ilerlet" ? {} : { flags: MessageFlags.Ephemeral })');
    expect(source).toMatch(/for \(const extraEmbed of announcementCards\.slice\(1\)\) \{\s+await interaction\.followUp\(\{ embeds: \[extraEmbed\] \}\);/);
  });

  it("büyük güç puanlarını ve devam sayfalarını herkese açık yollar", () => {
    expect(source).toContain('interaction.deferReply(subcommand === "puanlar" ? {} : { flags: MessageFlags.Ephemeral })');
    expect(source).toContain('`${ranking.length} aktif devlet • Bu kanaldaki herkes tarafından görülebilir`');
    expect(source).toContain("publicPages ? {} : { flags: MessageFlags.Ephemeral }");
  });
});
