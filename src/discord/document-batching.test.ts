import { describe, expect, it } from "vitest";
import { EmbedBuilder } from "discord.js";
import { batchDocumentEmbeds, DISCORD_EMBED_TEXT_PER_MESSAGE, embedTextLength } from "./document.js";

describe("devlet belgesi Discord paketleme sınırları", () => {
  it("çok yerleşkeli belgeleri toplam karakter sınırına göre böler", () => {
    const embeds = Array.from({ length: 7 }, (_, index) => new EmbedBuilder()
      .setTitle(`Yerleşke ${index + 1}`)
      .setDescription("x".repeat(950)));
    const batches = batchDocumentEmbeds(embeds);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toEqual(embeds);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(10);
      expect(batch.reduce((sum, embed) => sum + embedTextLength(embed), 0)).toBeLessThan(DISCORD_EMBED_TEXT_PER_MESSAGE);
    }
  });

  it("on bir kısa embedi mesaj başına en fazla on olacak şekilde böler", () => {
    const embeds = Array.from({ length: 11 }, (_, index) => new EmbedBuilder().setDescription(String(index)));
    expect(batchDocumentEmbeds(embeds).map((batch) => batch.length)).toEqual([10, 1]);
  });
});
