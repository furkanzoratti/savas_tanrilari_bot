import type { Guild } from "discord.js";

const COUNTRY_FLAG_EMOJI_NAMES: Record<string, string> = {
  "gaut kralligi": "gaut",
  "xianbei konfederasyonu": "xianbei",
  "iberya": "iberya2",
  "trakya": "trakya",
  "sebe": "sebe",
  "buyuk kartaca": "buyukkartaca",
  "fenike aram": "fenikearam",
  "fenike-aram": "fenikearam",
  "roma": "roma",
  "saketler": "sakatlar",
  "greko-baktriya": "grekobaktriya",
  "bosporos kralligi": "bosporoc",
  "karnutlar": "karnut",
  "persis": "pers",
  "boylar": "boylar",
  "buyuk britanya": "britanya",
  "sardes": "sardes",
  "satraplar": "satraplar",
  "nil imparatorlugu": "nilimp",
  "sarmatya": "sarmatya"
};

function normalizeCountryName(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
    .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
    .replace(/\s+/g, " ");
}

export function countryFlagEmojiName(countryName: string): string | null {
  return COUNTRY_FLAG_EMOJI_NAMES[normalizeCountryName(countryName)] ?? null;
}

export function countryFlagEmoji(guild: Guild | null, countryName: string, fallback: string): string {
  const emojiName = countryFlagEmojiName(countryName);
  if (!emojiName || !guild) return fallback;
  const emoji = guild.emojis.cache.find((item) => item.name?.toLocaleLowerCase("tr-TR") === emojiName);
  return emoji?.toString() ?? fallback;
}
