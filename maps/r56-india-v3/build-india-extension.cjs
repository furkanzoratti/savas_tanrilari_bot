const fs = require("node:fs");
const path = require("node:path");
let sharp;
try { sharp = require("sharp"); }
catch { sharp = require("C:/Users/Frank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"); }

const ROOT = __dirname;
const OLD_BASE = path.join(ROOT, "..", "r56", "qgis", "kaynak", "amrp-toprak.png");
const OLD_HEX_JSON = path.join(ROOT, "..", "..", "assets", "hex-map-r56.json");
const NATURAL_EARTH = path.join(ROOT, "source", "natural-earth-countries.geojson");
const REGION_FILE = path.join(ROOT, "source", "india-regions.json");
const OUTPUT_DIR = path.join(ROOT, "output");
const BASE_OUTPUT = path.join(OUTPUT_DIR, "amrp-toprak-india-v3.png");
const HEX_OUTPUT = path.join(OUTPUT_DIR, "NEWHEXMAP-INDIA-v3.png");
const JSON_OUTPUT = path.join(OUTPUT_DIR, "hex-map-r56-india-v3.json");
const REPORT_OUTPUT = path.join(OUTPUT_DIR, "india-v3-report.json");

const OLD_WIDTH = 4064;
const OLD_HEIGHT = 3328;
const WIDTH = 5376;
const HEIGHT = 3456;
const SOURCE_WIDTH = WIDTH / 2;
const SOURCE_HEIGHT = HEIGHT / 2;
const RADIUS = 56;
const H_STEP = RADIUS * 1.5;
const V_STEP = RADIUS * Math.sqrt(3);
const COLUMNS = 64;
const ROWS = 36;
const SEA = [34, 105, 170, 255];
const VOID = [64, 64, 64, 255];
const BLACK = [0, 0, 0, 255];
const LAND_ADMINS = new Set(["India", "Pakistan", "Bangladesh", "Nepal", "Bhutan"]);
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// Affine calibration from known cities already present on the AMRP map.
const X_LON = 22.75254487127015;
const X_LAT = 1.0214014147498789;
const X_OFFSET = 377.3170619823777;
const Y_LON = 1.6031922933085685;
const Y_LAT = 27.073497871707495;
const Y_OFFSET = -396.12088204488714;
const DET = X_LON * Y_LAT - X_LAT * Y_LON;

const escapeXml = (value) => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function project(lon, lat) {
  const x = X_LON * lon + X_LAT * lat + X_OFFSET;
  const yFromBottom = Y_LON * lon + Y_LAT * lat + Y_OFFSET;
  return { x, y: OLD_HEIGHT / 2 - yFromBottom };
}

function inverseProject(x, y) {
  const xValue = x - X_OFFSET;
  const yValue = OLD_HEIGHT / 2 - y - Y_OFFSET;
  return {
    lon: (xValue * Y_LAT - X_LAT * yValue) / DET,
    lat: (X_LON * yValue - xValue * Y_LON) / DET
  };
}

function ringsFor(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function geometryPath(geometry) {
  return ringsFor(geometry).map((polygon) => polygon.map((ring) => {
    const points = ring.map(([lon, lat]) => project(lon, lat));
    if (!points.length) return "";
    return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}${points.slice(1).map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`).join("")}Z`;
  }).join("")).join("");
}

function hexColor(value) {
  const normalized = value.replace(/^#/, "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255
  ];
}

function setRgba(buffer, x, y, color) {
  const index = (y * SOURCE_WIDTH + x) * 4;
  buffer[index] = color[0];
  buffer[index + 1] = color[1];
  buffer[index + 2] = color[2];
  buffer[index + 3] = color[3];
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function idFor(q, r) {
  return `R56-Q${q}-R${r}`;
}

function hexPolygon(cx, cy) {
  return Array.from({ length: 6 }, (_, side) => {
    const angle = side * Math.PI / 3;
    return [Number((cx + RADIUS * Math.cos(angle)).toFixed(3)), Number((cy + RADIUS * Math.sin(angle)).toFixed(3))];
  });
}

function samplePoints(cx, cy) {
  const points = [[cx, cy]];
  for (const ratio of [0.30, 0.58, 0.82]) {
    for (let side = 0; side < 12; side += 1) {
      const angle = side * Math.PI / 6;
      points.push([cx + RADIUS * ratio * Math.cos(angle), cy + RADIUS * ratio * Math.sin(angle)]);
    }
  }
  return points;
}

function regionAt(regionIds, pixelX, pixelY) {
  const x = Math.max(0, Math.min(SOURCE_WIDTH - 1, Math.round(pixelX / 2)));
  const y = Math.max(0, Math.min(SOURCE_HEIGHT - 1, Math.round(pixelY / 2)));
  return regionIds[y * SOURCE_WIDTH + x];
}

function typeAt(regionIds, backgroundIds, pixelX, pixelY) {
  const x = Math.max(0, Math.min(SOURCE_WIDTH - 1, Math.round(pixelX / 2)));
  const y = Math.max(0, Math.min(SOURCE_HEIGHT - 1, Math.round(pixelY / 2)));
  const index = y * SOURCE_WIDTH + x;
  if (regionIds[index] >= 0) return "LAND";
  return backgroundIds[index] === 1 ? "SEA" : "IMPASSABLE";
}

function classifyNewHex(regionIds, backgroundIds, cx, cy) {
  const samples = samplePoints(cx, cy).filter(([x, y]) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT);
  const centerRegion = regionAt(regionIds, cx, cy);
  const counts = { LAND: 0, SEA: 0, IMPASSABLE: 0 };
  for (const [x, y] of samples) counts[typeAt(regionIds, backgroundIds, x, y)] += 1;
  let type;
  if (centerRegion >= 0) type = "LAND";
  else if (counts.IMPASSABLE / Math.max(1, samples.length) >= 0.58) type = "IMPASSABLE";
  else type = counts.SEA >= counts.LAND ? "SEA" : "LAND";
  return {
    type,
    regionIndex: centerRegion >= 0 ? centerRegion : null,
    coastal: type !== "IMPASSABLE" && counts.LAND > 0 && counts.SEA > 0
  };
}

function nearestAvailableHex(hexes, regionKey, pixelX, pixelY, used) {
  const candidates = hexes
    .filter((hex) => hex.type === "LAND" && hex.regionKey === regionKey && !used.has(hex.id))
    .map((hex) => ({ hex, distance: Math.hypot(hex.center.pixelX - pixelX, hex.center.pixelY - pixelY) }))
    .sort((a, b) => a.distance - b.distance);
  if (candidates[0] && candidates[0].distance <= 70) return candidates[0];
  return hexes
    .filter((hex) => hex.column >= 49 && !used.has(hex.id))
    .map((hex) => ({ hex, distance: Math.hypot(hex.center.pixelX - pixelX, hex.center.pixelY - pixelY) }))
    .sort((a, b) => a.distance - b.distance)[0];
}

function drawHexSvg(hexes) {
  const items = [];
  for (const hex of hexes) {
    const points = hex.polygon.map(([x, y]) => `${x},${y}`).join(" ");
    items.push(`<polygon points="${points}" fill="none" stroke="#292929" stroke-width="4" stroke-linejoin="round"/>`);
    items.push(`<text x="${hex.center.pixelX}" y="${hex.center.pixelY + 7}" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="#d7d7d7" stroke="#202020" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${hex.code}</text>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${items.join("")}</svg>`);
}

async function main() {
  const regionSource = JSON.parse(fs.readFileSync(REGION_FILE, "utf8"));
  const countries = new Map(regionSource.countries.map((country) => [country.key, country]));
  const regions = regionSource.regions.map((region, index) => ({
    ...region,
    index,
    countryDefinition: countries.get(region.country),
    projected: project(region.lon, region.lat)
  }));
  const regionByKey = new Map(regions.map((region) => [region.key, region]));

  const naturalEarth = JSON.parse(fs.readFileSync(NATURAL_EARTH, "utf8"));
  const landFeatures = naturalEarth.features.filter((feature) => LAND_ADMINS.has(feature.properties.ADMIN));
  const landPath = landFeatures.map((feature) => geometryPath(feature.geometry)).join("");
  const maskSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" viewBox="0 0 ${SOURCE_WIDTH} ${SOURCE_HEIGHT}"><path d="${landPath}" fill="#fff" fill-rule="evenodd"/></svg>`);
  const landMask = await sharp(maskSvg).greyscale().raw().toBuffer();

  const oldImage = await sharp(OLD_BASE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (oldImage.info.width !== OLD_WIDTH || oldImage.info.height !== OLD_HEIGHT) {
    throw new Error(`Beklenmeyen eski harita boyutu: ${oldImage.info.width}x${oldImage.info.height}`);
  }

  const overlay = Buffer.alloc(SOURCE_WIDTH * SOURCE_HEIGHT * 4);
  const regionIds = new Int16Array(SOURCE_WIDTH * SOURCE_HEIGHT);
  const backgroundIds = new Int8Array(SOURCE_WIDTH * SOURCE_HEIGHT);
  regionIds.fill(-1);
  backgroundIds.fill(-1);

  const colors = regions.map((region) => hexColor(region.countryDefinition.color));
  const seamStart = 1500;
  const oldSourceWidth = OLD_WIDTH / 2;
  for (let y = 0; y < SOURCE_HEIGHT; y += 1) {
    for (let x = seamStart; x < SOURCE_WIDTH; x += 1) {
      const index = y * SOURCE_WIDTH + x;
      const { lon, lat } = inverseProject(x, y);
      const northLimit = lon < 75 ? 39 : lon < 83 ? 35 - (lon - 75) * 0.45 : 31 - (lon - 83) * 0.22;
      const background = lat > northLimit ? VOID : SEA;
      backgroundIds[index] = background === SEA ? 1 : 0;
      const onLand = landMask[index] > 96 && lon >= 67.5 && lon <= 96.5 && lat >= 7.5 && lat <= 38.5;

      let oldBackground = true;
      let oldWasSea = false;
      if (x < oldSourceWidth && y < OLD_HEIGHT / 2) {
        const oldX = Math.min(OLD_WIDTH - 1, x * 2 + 1);
        const oldY = Math.min(OLD_HEIGHT - 1, y * 2 + 1);
        const oldIndex = (oldY * OLD_WIDTH + oldX) * oldImage.info.channels;
        const r = oldImage.data[oldIndex];
        const g = oldImage.data[oldIndex + 1];
        const b = oldImage.data[oldIndex + 2];
        const isSea = Math.hypot(r - SEA[0], g - SEA[1], b - SEA[2]) < 38;
        const isVoid = Math.max(r, g, b) - Math.min(r, g, b) < 12 && r >= 40 && r <= 80;
        oldBackground = isSea || isVoid;
        oldWasSea = isSea;
      }

      const forceEdgeBlend = x >= oldSourceWidth - 6 || (y >= OLD_HEIGHT / 2 - 6 && x >= 1450);
      if (x < oldSourceWidth && !oldBackground && !forceEdgeBlend) continue;
      if (!onLand) {
        if (x >= oldSourceWidth || oldBackground || forceEdgeBlend) setRgba(overlay, x, y, oldWasSea && !forceEdgeBlend ? SEA : background);
        continue;
      }

      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const region of regions) {
        const dx = x - region.projected.x;
        const dy = (y - region.projected.y) * 1.10;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = region.index;
        }
      }
      regionIds[index] = nearestIndex;
      setRgba(overlay, x, y, colors[nearestIndex]);
    }
  }

  const bordered = Buffer.from(overlay);
  for (let y = 1; y < SOURCE_HEIGHT - 1; y += 1) {
    for (let x = seamStart + 1; x < SOURCE_WIDTH - 1; x += 1) {
      const index = y * SOURCE_WIDTH + x;
      const region = regionIds[index];
      if (region < 0) continue;
      const neighbors = [index - 1, index + 1, index - SOURCE_WIDTH, index + SOURCE_WIDTH];
      if (neighbors.some((neighbor) => regionIds[neighbor] !== region)) setRgba(bordered, x, y, BLACK);
    }
  }

  const extension = await sharp(bordered, { raw: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, channels: 4 } })
    .resize(WIDTH, HEIGHT, { kernel: "nearest" }).png().toBuffer();
  const baseCanvas = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r: VOID[0], g: VOID[1], b: VOID[2] } }
  }).composite([{ input: OLD_BASE, left: 0, top: 0 }, { input: extension, left: 0, top: 0 }]).png().toBuffer();

  const settlementItems = [];
  for (const region of regions) {
    const x = region.projected.x * 2;
    const y = region.projected.y * 2;
    const rightAligned = x > WIDTH - 360;
    settlementItems.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#111" stroke="#fff" stroke-width="3"/>`);
    settlementItems.push(`<text x="${(x + (rightAligned ? -13 : 13)).toFixed(1)}" y="${(y - 11).toFixed(1)}" text-anchor="${rightAligned ? "end" : "start"}" font-family="Arial, sans-serif" font-size="29" font-weight="700" fill="#171717" stroke="#fff" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${escapeXml(region.settlement)}</text>`);
  }
  const settlementOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${settlementItems.join("")}</svg>`);
  const labeledBase = await sharp(baseCanvas).composite([{ input: settlementOverlay }]).png({ compressionLevel: 9 }).toBuffer();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(BASE_OUTPUT, labeledBase);

  const oldMap = JSON.parse(fs.readFileSync(OLD_HEX_JSON, "utf8"));
  const oldHexByPosition = new Map(oldMap.hexes.map((hex) => [`${hex.column}:${hex.row}`, hex]));
  const hexes = [];
  for (let column = 0; column < COLUMNS; column += 1) {
    const cx = column * H_STEP;
    const offsetY = column % 2 === 0 ? 0 : V_STEP / 2;
    for (let row = 0; row < ROWS; row += 1) {
      const cy = row * V_STEP + offsetY;
      const q = column;
      const r = row - ((column - (column & 1)) / 2);
      const oldHex = oldHexByPosition.get(`${column}:${row}`);
      const classification = classifyNewHex(regionIds, backgroundIds, cx, cy);
      if (oldHex && (column < 49 || classification.type === "IMPASSABLE")) {
        hexes.push({ ...oldHex, polygon: hexPolygon(cx, cy), neighbors: [] });
        continue;
      }
      const region = classification.regionIndex === null ? null : regions[classification.regionIndex];
      hexes.push({
        id: idFor(q, r),
        code: `${columnName(column)}${String(row + 1).padStart(2, "0")}`,
        q, r, column, row,
        center: {
          x: Number(cx.toFixed(3)),
          y: Number((HEIGHT - cy).toFixed(3)),
          pixelX: Number(cx.toFixed(3)),
          pixelY: Number(cy.toFixed(3))
        },
        polygon: hexPolygon(cx, cy),
        type: classification.type,
        playable: classification.type !== "IMPASSABLE",
        coastal: classification.coastal,
        terrain: region?.terrain ?? null,
        moveCost: classification.type !== "IMPASSABLE" ? 1 : null,
        regionKey: region?.key ?? null,
        province: region ? "India" : null,
        resource: region?.resource ?? null,
        owner: null,
        settlements: [],
        neighbors: []
      });
    }
  }

  const hexById = new Map(hexes.map((hex) => [hex.id, hex]));
  for (const hex of hexes) {
    if (!hex.playable) continue;
    hex.neighbors = DIRECTIONS
      .map(([dq, dr]) => hexById.get(idFor(hex.q + dq, hex.r + dr)))
      .filter((neighbor) => neighbor?.playable)
      .map((neighbor) => neighbor.id);
  }

  const settlementIndex = { ...oldMap.settlements };
  const usedHexes = new Set(Object.values(oldMap.settlements).map((item) => item.hexId));
  const bindings = [];
  for (const region of regions) {
    const pixelX = region.projected.x * 2;
    const pixelY = region.projected.y * 2;
    const selected = nearestAvailableHex(hexes, region.key, pixelX, pixelY, usedHexes);
    if (!selected) throw new Error(`${region.settlement} için kara Hex'i bulunamadı.`);
    const { hex, distance } = selected;
    if (hex.regionKey !== region.key) {
      hex.type = "LAND";
      hex.playable = true;
      hex.coastal = true;
      hex.terrain = region.terrain;
      hex.moveCost = 1;
      hex.regionKey = region.key;
      hex.province = "India";
      hex.resource = region.resource;
    }
    usedHexes.add(hex.id);
    const settlement = {
      name: region.settlement,
      regionKey: region.key,
      province: "India",
      sourceOwner: region.countryDefinition.name,
      source: { lon: region.lon, lat: region.lat },
      pixel: { x: Number(pixelX.toFixed(3)), y: Number(pixelY.toFixed(3)) },
      bindingDistance: Number(distance.toFixed(3))
    };
    hex.settlements.push(settlement);
    settlementIndex[region.settlement] = {
      hexId: hex.id,
      hexCode: hex.code,
      regionKey: region.key,
      pixel: settlement.pixel
    };
    bindings.push({ settlement: region.settlement, country: region.countryDefinition.name, regionKey: region.key, hexCode: hex.code, distance: settlement.bindingDistance });
  }

  const map = {
    ...oldMap,
    mapVersion: "amrp-r56-india-v3",
    generatedAt: new Date().toISOString(),
    grid: {
      ...oldMap.grid,
      columns: COLUMNS,
      rows: ROWS,
      width: WIDTH,
      height: HEIGHT
    },
    sources: {
      ...oldMap.sources,
      image: "maps/r56-india-v3/output/amrp-toprak-india-v3.png",
      indiaRegions: "maps/r56-india-v3/source/india-regions.json",
      coastline: "Natural Earth 1:10m Admin 0 (public domain)"
    },
    settlements: settlementIndex,
    hexes
  };
  fs.writeFileSync(JSON_OUTPUT, `${JSON.stringify(map, null, 2)}\n`, "utf8");

  const hexOverlay = drawHexSvg(hexes);
  await sharp(labeledBase).composite([{ input: hexOverlay }]).png({ compressionLevel: 9 }).toFile(HEX_OUTPUT);

  const typeCounts = Object.fromEntries(["LAND", "SEA", "IMPASSABLE"].map((type) => [type, hexes.filter((hex) => hex.type === type).length]));
  const countryCounts = Object.fromEntries(regionSource.countries.map((country) => [
    country.name,
    regions.filter((region) => region.country === country.key).length
  ]));
  const report = {
    mapVersion: map.mapVersion,
    canvas: { width: WIDTH, height: HEIGHT },
    grid: { radius: RADIUS, columns: COLUMNS, rows: ROWS, totalHexes: hexes.length },
    preservedLegacyHexes: hexes.filter((hex) => hex.column < 49).length,
    typeCounts,
    countries: countryCounts,
    newCountries: regionSource.countries.length,
    newRegions: regions.length,
    bindings,
    outputs: {
      normalMap: path.relative(ROOT, BASE_OUTPUT).replace(/\\/g, "/"),
      hexMap: path.relative(ROOT, HEX_OUTPUT).replace(/\\/g, "/"),
      data: path.relative(ROOT, JSON_OUTPUT).replace(/\\/g, "/")
    }
  };
  fs.writeFileSync(REPORT_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
