import { resolve } from "node:path";

export const TEMPLE_BANNER_NAME = "ancient-temple-city-banner.png";
export const BRAND_BANNER_NAME = "savas-tanrilari-role-play-banner.png";
export const TURN_BANNER_NAME = "amrp-turn-cycle-banner.png";
export const PACT_BANNER_NAME = "ancient-diplomatic-pact-banner.png";
export const STATE_PROFILE_BANNER_NAME = "ancient-state-profile-banner.png";
export const STATE_DETAIL_BANNER_NAME = "ancient-state-detail-banner.png";
export const WAR_DECLARATION_BANNER_NAME = "ancient-war-declaration-banner.png";
export const PEACE_TREATY_BANNER_NAME = "ancient-peace-treaty-banner.png";
export const NAVAL_RAID_BANNER_NAME = "amrp-naval-raid-banner.png";
export const LAND_RAID_BANNER_NAME = "amrp-land-raid-banner.png";
export const HARBOR_BLOCKADE_BANNER_NAME = "amrp-harbor-blockade-banner.png";
export const DYNASTY_BANNER_NAME = "ancient-dynasty-banner.png";
export const DYNASTY_MARRIAGE_BANNER_NAME = "ancient-dynastic-marriage-banner.png";
export const PORT_ACCESS_BANNER_NAME = "ancient-port-access-banner.png";
export const SETTLEMENTS_OVERVIEW_BANNER_NAME = "ancient-settlements-overview-banner.png";

export const ROMAN_VIEW_BANNER_NAMES={
  republic:"roman-republic-banner.png",
  family:"roman-family-banner.png",
  election:"roman-election-banner.png",
  business:"roman-business-banner.png",
  governorship:"roman-governorship-banner.png",
  offices:"roman-offices-banner.png"
} as const;
export type RomanViewBannerKey=keyof typeof ROMAN_VIEW_BANNER_NAMES;
export function romanViewAsset(key:RomanViewBannerKey):{name:string;path:string;url:string}{
  const name=ROMAN_VIEW_BANNER_NAMES[key];
  return{name,path:resolve(process.cwd(),"assets","roman",name),url:`attachment://${name}`};
}

export const DYNASTY_VIEW_BANNER_NAMES = {
  overview: "dynasty-overview-banner.png",
  person: "dynasty-person-banner.png",
  familyTree: "dynasty-family-tree-banner.png",
  succession: "dynasty-succession-banner.png",
  marriages: "dynasty-marriages-banner.png",
  children: "dynasty-children-banner.png",
  deaths: "dynasty-deaths-banner.png",
  history: "dynasty-history-banner.png",
  status: "dynasty-status-banner.png"
} as const;

export type DynastyViewBannerKey = keyof typeof DYNASTY_VIEW_BANNER_NAMES;

export function dynastyViewAsset(key: DynastyViewBannerKey): { name: string; path: string; url: string } {
  const name = DYNASTY_VIEW_BANNER_NAMES[key];
  return { name, path: resolve(process.cwd(), "assets", name), url: `attachment://${name}` };
}

export const TEMPLE_BANNER_PATH = resolve(process.cwd(), "assets", TEMPLE_BANNER_NAME);
export const BRAND_BANNER_PATH = resolve(process.cwd(), "assets", BRAND_BANNER_NAME);
export const TURN_BANNER_PATH = resolve(process.cwd(), "assets", TURN_BANNER_NAME);
export const PACT_BANNER_PATH = resolve(process.cwd(), "assets", PACT_BANNER_NAME);
export const STATE_PROFILE_BANNER_PATH = resolve(process.cwd(), "assets", STATE_PROFILE_BANNER_NAME);
export const STATE_DETAIL_BANNER_PATH = resolve(process.cwd(), "assets", STATE_DETAIL_BANNER_NAME);
export const WAR_DECLARATION_BANNER_PATH = resolve(process.cwd(), "assets", WAR_DECLARATION_BANNER_NAME);
export const PEACE_TREATY_BANNER_PATH = resolve(process.cwd(), "assets", PEACE_TREATY_BANNER_NAME);
export const NAVAL_RAID_BANNER_PATH = resolve(process.cwd(), "assets", NAVAL_RAID_BANNER_NAME);
export const LAND_RAID_BANNER_PATH = resolve(process.cwd(), "assets", LAND_RAID_BANNER_NAME);
export const HARBOR_BLOCKADE_BANNER_PATH = resolve(process.cwd(), "assets", HARBOR_BLOCKADE_BANNER_NAME);
export const DYNASTY_BANNER_PATH = resolve(process.cwd(), "assets", DYNASTY_BANNER_NAME);
export const DYNASTY_MARRIAGE_BANNER_PATH = resolve(process.cwd(), "assets", DYNASTY_MARRIAGE_BANNER_NAME);
export const PORT_ACCESS_BANNER_PATH = resolve(process.cwd(), "assets", PORT_ACCESS_BANNER_NAME);
export const SETTLEMENTS_OVERVIEW_BANNER_PATH = resolve(process.cwd(), "assets", SETTLEMENTS_OVERVIEW_BANNER_NAME);

export const TEMPLE_BANNER_URL = `attachment://${TEMPLE_BANNER_NAME}`;
export const BRAND_BANNER_URL = `attachment://${BRAND_BANNER_NAME}`;
export const TURN_BANNER_URL = `attachment://${TURN_BANNER_NAME}`;
export const PACT_BANNER_URL = `attachment://${PACT_BANNER_NAME}`;
export const STATE_PROFILE_BANNER_URL = `attachment://${STATE_PROFILE_BANNER_NAME}`;
export const STATE_DETAIL_BANNER_URL = `attachment://${STATE_DETAIL_BANNER_NAME}`;
export const WAR_DECLARATION_BANNER_URL = `attachment://${WAR_DECLARATION_BANNER_NAME}`;
export const PEACE_TREATY_BANNER_URL = `attachment://${PEACE_TREATY_BANNER_NAME}`;
export const NAVAL_RAID_BANNER_URL = `attachment://${NAVAL_RAID_BANNER_NAME}`;
export const LAND_RAID_BANNER_URL = `attachment://${LAND_RAID_BANNER_NAME}`;
export const HARBOR_BLOCKADE_BANNER_URL = `attachment://${HARBOR_BLOCKADE_BANNER_NAME}`;
export const DYNASTY_BANNER_URL = `attachment://${DYNASTY_BANNER_NAME}`;
export const DYNASTY_MARRIAGE_BANNER_URL = `attachment://${DYNASTY_MARRIAGE_BANNER_NAME}`;
export const PORT_ACCESS_BANNER_URL = `attachment://${PORT_ACCESS_BANNER_NAME}`;
export const SETTLEMENTS_OVERVIEW_BANNER_URL = `attachment://${SETTLEMENTS_OVERVIEW_BANNER_NAME}`;

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
