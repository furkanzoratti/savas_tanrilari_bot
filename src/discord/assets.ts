import { resolve } from "node:path";

export const TEMPLE_BANNER_NAME = "ancient-temple-city-banner.png";
export const BRAND_BANNER_NAME = "savas-tanrilari-role-play-banner.png";

export const TEMPLE_BANNER_PATH = resolve(process.cwd(), "assets", TEMPLE_BANNER_NAME);
export const BRAND_BANNER_PATH = resolve(process.cwd(), "assets", BRAND_BANNER_NAME);

export const TEMPLE_BANNER_URL = `attachment://${TEMPLE_BANNER_NAME}`;
export const BRAND_BANNER_URL = `attachment://${BRAND_BANNER_NAME}`;

export function battlefieldAsset(terrain: string): { name: string; path: string } {
  const names: Record<string, string> = {
    OPEN_PLAIN: "open-plain.png", AMBUSH: "ambush.png", DESERT: "desert.png", FOREST: "forest.png", MARSH: "marsh.png",
    MOUNTAIN: "mountain.png", MOUNTAIN_PASS: "mountain-pass.png", RIVER_CROSSING: "river-crossing.png",
    SIEGE: "siege.png", NAVAL: "naval.png"
  };
  const name = names[terrain];
  if (!name) throw new Error(`Bilinmeyen savaş alanı: ${terrain}`);
  return { name, path: resolve(process.cwd(), "assets", "battlefields", name) };
}