import { EmbedBuilder, type APIEmbed } from "discord.js";

export const DISCORD_EMBED_TEXT_LIMIT = 6_000;
const SAFE_EMBED_TEXT_LIMIT = 5_900;

export function embedTextLength(embed: EmbedBuilder | APIEmbed): number {
  const data = embed instanceof EmbedBuilder ? embed.toJSON() : embed;
  return (data.title?.length ?? 0)
    + (data.description?.length ?? 0)
    + (data.footer?.text.length ?? 0)
    + (data.author?.name.length ?? 0)
    + (data.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
}

export function truncateEmbedText(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return "…".slice(0, max);
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Discord bir embeddeki bütün metin alanlarının toplamını 6.000 karakterle
 * sınırlar. İçerik veritabanından geldiği için tek tek alanlar geçerli olsa
 * bile toplam sınır aşılabilir. Bu son güvenlik katmanı, en uzun ayrıntıları
 * önce kısaltarak gönderinin tamamen reddedilmesini önler.
 */
export function fitEmbedToDiscordLimit(embed: EmbedBuilder, limit = SAFE_EMBED_TEXT_LIMIT): EmbedBuilder {
  const data = embed.toJSON();
  if (data.title) data.title = truncateEmbedText(data.title, 256);
  if (data.description) data.description = truncateEmbedText(data.description, 4_096);
  if (data.author?.name) data.author.name = truncateEmbedText(data.author.name, 256);
  if (data.footer?.text) data.footer.text = truncateEmbedText(data.footer.text, 2_048);
  data.fields = (data.fields ?? []).slice(0, 25).map((field) => ({
    ...field,
    name: truncateEmbedText(field.name, 256),
    value: truncateEmbedText(field.value, 1_024)
  }));

  let excess = embedTextLength(data) - Math.min(limit, DISCORD_EMBED_TEXT_LIMIT);
  if (excess <= 0) return EmbedBuilder.from(data);

  // Ayrıntı alanlarını, en uzun olandan başlayarak okunabilir bir alt sınıra
  // kadar küçült. Böylece başlık ve ana savaş anlatımı mümkün olduğunca kalır.
  while (excess > 0 && data.fields.length) {
    let index = -1;
    let reducible = 0;
    data.fields.forEach((field, candidate) => {
      const available = Math.max(0, field.value.length - 160);
      if (available > reducible) {
        reducible = available;
        index = candidate;
      }
    });
    if (index < 0 || reducible <= 0) break;
    const reduction = Math.min(excess, reducible);
    data.fields[index]!.value = truncateEmbedText(data.fields[index]!.value, data.fields[index]!.value.length - reduction);
    excess -= reduction;
  }

  if (excess > 0 && data.description) {
    const reduction = Math.min(excess, Math.max(0, data.description.length - 320));
    data.description = truncateEmbedText(data.description, data.description.length - reduction);
    excess -= reduction;
  }
  if (excess > 0 && data.footer?.text) {
    const reduction = Math.min(excess, Math.max(0, data.footer.text.length - 80));
    data.footer.text = truncateEmbedText(data.footer.text, data.footer.text.length - reduction);
    excess -= reduction;
  }

  return EmbedBuilder.from(data);
}
