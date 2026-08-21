import { resolve } from "node:path";

export const TEMPLE_BANNER_NAME = "ancient-temple-city-banner.png";
export const BRAND_BANNER_NAME = "savas-tanrilari-role-play-banner.png";

export const TEMPLE_BANNER_PATH = resolve(process.cwd(), "assets", TEMPLE_BANNER_NAME);
export const BRAND_BANNER_PATH = resolve(process.cwd(), "assets", BRAND_BANNER_NAME);

export const TEMPLE_BANNER_URL = `attachment://${TEMPLE_BANNER_NAME}`;
export const BRAND_BANNER_URL = `attachment://${BRAND_BANNER_NAME}`;
