const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let sharp;
try { sharp = require("sharp"); }
catch { sharp = require("C:/Users/Frank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"); }

const ROOT = __dirname;
const SOURCE = "C:/Users/Frank/Desktop/toprak.png";
const EXPECTED_SOURCE_SHA256 = "AB050D93128E40BD24F59D1B9B765917F9F0FBA7875381ED03A070503A6DD2E6";
const OLD_HEX_JSON = path.join(ROOT, "..", "..", "assets", "hex-map-r56.json");
const REGIONS_JSON = path.join(ROOT, "..", "r56-india-v3", "source", "india-regions.json");
const OUTPUT = path.join(ROOT, "output");

const OLD_WIDTH = 4064;
const WIDTH = 5376;
const HEIGHT = 3328;
const RADIUS = 56;
const H_STEP = 84;
const V_STEP = 96.994845;
const COLUMNS = 64;
const ROWS = 36;
const VOID = [64, 64, 64, 255];
const SEA = [34, 105, 170, 255];
const BLACK = [0, 0, 0, 255];
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// The land opens exactly from the narrow eastern tip of the supplied map.
// Its western mouth (4054..4078 / 1810..1850) is deliberately left without
// a closing coastline stroke so the old and new land masses are continuous.
const LAND_PATH = [
  "M 3865 1608",
  "C 3975 1585, 4160 1520, 4285 1480",
  "C 4380 1435, 4475 1468, 4568 1438",
  "C 4665 1408, 4755 1452, 4848 1472",
  "C 4940 1445, 5035 1495, 5120 1540",
  "C 5205 1548, 5290 1615, 5335 1708",
  "C 5370 1790, 5328 1880, 5355 1970",
  "C 5382 2070, 5332 2208, 5235 2350",
  "C 5165 2445, 5120 2550, 5050 2695",
  "C 4970 2855, 4870 3055, 4748 3262",
  "C 4702 3312, 4640 3290, 4588 3228",
  "C 4500 3120, 4440 2940, 4375 2780",
  "C 4312 2622, 4240 2465, 4180 2318",
  "C 4090 2350, 4000 2410, 3912 2378",
  "C 3850 2240, 3838 1830, 3865 1608",
  "Z"
].join(" ");

const escapeXml = (value) => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

function rgba(hex) {
  const value = hex.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), 255];
}

function project(lon, lat) {
  return { x: 4055 + (lon - 67.3) * 48, y: 1510 + (35 - lat) * 62 };
}

function sourceClass(r, g, b) {
  if (Math.hypot(r - SEA[0], g - SEA[1], b - SEA[2]) < 32) return "SEA";
  if (Math.max(r, g, b) - Math.min(r, g, b) < 10 && r >= 46 && r <= 78) return "IMPASSABLE";
  return "LAND";
}

function seaLineAt(x) {
  // The visible gray/blue transition stays behind the new mainland; the
  // actual coastline is therefore the irregular black land outline, not a
  // diagonal canvas seam.
  const dx = x - 3835;
  return 2100 + Math.sin(dx / 57) * 12 + Math.sin(dx / 19) * 5;
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function hexPolygon(cx, cy) {
  return Array.from({ length: 6 }, (_, side) => {
    const angle = side * Math.PI / 3;
    return [Number((cx + RADIUS * Math.cos(angle)).toFixed(3)), Number((cy + RADIUS * Math.sin(angle)).toFixed(3))];
  });
}

function setPixel(buffer, width, x, y, color) {
  const i = (y * width + x) * 4;
  buffer[i] = color[0]; buffer[i + 1] = color[1]; buffer[i + 2] = color[2]; buffer[i + 3] = color[3];
}

function regionScore(region, x, y) {
  const dx = (x - region.x) / region.scaleX;
  const dy = (y - region.y) / region.scaleY;
  const wave = Math.sin(x / 71 + region.phase) * 0.075
    + Math.sin(y / 89 + region.phase * 1.73) * 0.065
    + Math.sin((x + y) / 123 + region.phase * 0.61) * 0.055;
  return dx * dx + dy * dy + wave;
}

function labelSvg(regions) {
  const nodes = [];
  for (const region of regions) {
    const fontSize = region.settlement.length > 11 ? 22 : 24;
    nodes.push(`<circle cx="${region.x.toFixed(1)}" cy="${region.y.toFixed(1)}" r="6" fill="#0b0b0b" stroke="#f2f2f2" stroke-width="3"/>`);
    nodes.push(`<text x="${(region.x + 11).toFixed(1)}" y="${(region.y - 7).toFixed(1)}" font-family="Arial,Segoe UI,sans-serif" font-size="${fontSize}" font-weight="700" fill="#e9e9e9" stroke="#282828" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${escapeXml(region.settlement)}</text>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${nodes.join("")}</svg>`);
}

function gridSvg(hexes) {
  const nodes = [];
  for (const hex of hexes) {
    nodes.push(`<polygon points="${hex.polygon.map(p => p.join(",")).join(" ")}" fill="none" stroke="#292929" stroke-width="4" stroke-linejoin="round"/>`);
    nodes.push(`<text x="${hex.center.pixelX}" y="${hex.center.pixelY + 7}" text-anchor="middle" font-family="Arial,Segoe UI,sans-serif" font-size="24" font-weight="800" fill="#d7d7d7" stroke="#202020" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${hex.code}</text>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${nodes.join("")}</svg>`);
}

function sampleHex(mask, regionIds, oldRaw, cx, cy) {
  const samples = [[0, 0], [24, 0], [-24, 0], [12, 21], [-12, 21], [12, -21], [-12, -21]];
  const counts = { LAND: 0, SEA: 0, IMPASSABLE: 0 };
  const regionCounts = new Map();
  for (const [dx, dy] of samples) {
    const x = Math.max(0, Math.min(WIDTH - 1, Math.round(cx + dx)));
    const y = Math.max(0, Math.min(HEIGHT - 1, Math.round(cy + dy)));
    const idx = y * WIDTH + x;
    if (mask[idx] > 0) {
      counts.LAND += 1;
      const id = regionIds[idx];
      regionCounts.set(id, (regionCounts.get(id) || 0) + 1);
    } else if (x < OLD_WIDTH) {
      const oi = (y * OLD_WIDTH + x) * 4;
      counts[sourceClass(oldRaw[oi], oldRaw[oi + 1], oldRaw[oi + 2])] += 1;
    } else {
      const seaLine = seaLineAt(x);
      counts[y >= seaLine ? "SEA" : "IMPASSABLE"] += 1;
    }
  }
  const type = counts.LAND >= 3 ? "LAND" : counts.SEA >= counts.IMPASSABLE ? "SEA" : "IMPASSABLE";
  const regionIndex = type === "LAND" && regionCounts.size
    ? [...regionCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : -1;
  return { type, regionIndex };
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const actualHash = hashFile(SOURCE);
  if (actualHash !== EXPECTED_SOURCE_SHA256) throw new Error(`toprak.png değişti: ${actualHash}`);

  const definitions = JSON.parse(fs.readFileSync(REGIONS_JSON, "utf8"));
  const countryMap = new Map(definitions.countries.map(c => [c.key, c]));
  const offsets = {
    india_kalinga_tosali: [38, -28], india_kalinga_dantapura: [-22, 55],
    india_satavahana_pratishthana: [-35, -20], india_satavahana_amaravati: [25, 20],
    india_chola_urayur: [32, -28], india_pandya_madurai: [45, 38], india_chera_muziris: [-62, 22]
  };
  const regions = definitions.regions.map((entry, index) => {
    const p = project(entry.lon, entry.lat);
    const [ox, oy] = offsets[entry.key] || [0, 0];
    return {
      ...entry, index, x: p.x + ox, y: p.y + oy,
      color: rgba(countryMap.get(entry.country).color),
      countryName: countryMap.get(entry.country).name,
      phase: 0.9 + index * 1.137,
      scaleX: entry.country === "maurya" ? 205 : 150,
      scaleY: entry.country === "maurya" ? 235 : 175
    };
  });

  const source = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (source.info.width !== OLD_WIDTH || source.info.height !== HEIGHT) throw new Error("Kaynak ölçüsü 4064x3328 değil.");

  const maskSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><path d="${LAND_PATH}" fill="#fff"/></svg>`);
  const landMask = await sharp(maskSvg).flatten({ background: "#000000" }).greyscale().raw().toBuffer();
  const regionIds = new Int16Array(WIDTH * HEIGHT); regionIds.fill(-1);
  const canvas = Buffer.alloc(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y += 1) {
    const sourceStart = y * OLD_WIDTH * 4;
    source.data.copy(canvas, y * WIDTH * 4, sourceStart, sourceStart + OLD_WIDTH * 4);
    for (let x = 3835; x < OLD_WIDTH; x += 1) {
      const oi = (y * OLD_WIDTH + x) * 4;
      if (sourceClass(source.data[oi], source.data[oi + 1], source.data[oi + 2]) === "IMPASSABLE" && y >= seaLineAt(x)) {
        setPixel(canvas, WIDTH, x, y, SEA);
      }
    }
    for (let x = OLD_WIDTH; x < WIDTH; x += 1) {
      const seaLine = seaLineAt(x);
      setPixel(canvas, WIDTH, x, y, y >= seaLine ? SEA : VOID);
    }
  }

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 3835; x < WIDTH; x += 1) {
      const idx = y * WIDTH + x;
      if (landMask[idx] < 128) continue;
      let best = 0;
      let score = Number.POSITIVE_INFINITY;
      for (const region of regions) {
        const value = regionScore(region, x, y);
        if (value < score) { score = value; best = region.index; }
      }
      regionIds[idx] = best;
      if (x < OLD_WIDTH) {
        const oi = (y * OLD_WIDTH + x) * 4;
        if (sourceClass(source.data[oi], source.data[oi + 1], source.data[oi + 2]) === "LAND") continue;
      }
      setPixel(canvas, WIDTH, x, y, regions[best].color);
    }
  }

  // One-pixel frontier seed, dilated to an 8–9 px line: same visual weight as the supplied map.
  const frontier = Buffer.alloc(WIDTH * HEIGHT);
  for (let y = 1; y < HEIGHT - 1; y += 1) {
    for (let x = 3835; x < WIDTH - 1; x += 1) {
      const idx = y * WIDTH + x;
      const id = regionIds[idx];
      if (id < 0) continue;
      const outer = regionIds[idx - 1] < 0 || regionIds[idx + 1] < 0 || regionIds[idx - WIDTH] < 0 || regionIds[idx + WIDTH] < 0;
      const inner = regionIds[idx - 1] !== id || regionIds[idx + 1] !== id || regionIds[idx - WIDTH] !== id || regionIds[idx + WIDTH] !== id;
      if (outer || inner) frontier[idx] = 255;
    }
  }
  const thickFrontier = await sharp(frontier, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } }).dilate(4).raw().toBuffer();
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 3830; x < WIDTH; x += 1) {
      const idx = y * WIDTH + x;
      if (x < OLD_WIDTH) {
        const oi = (y * OLD_WIDTH + x) * 4;
        if (sourceClass(source.data[oi], source.data[oi + 1], source.data[oi + 2]) === "LAND") continue;
      }
      if (thickFrontier[idx] > 0) setPixel(canvas, WIDTH, x, y, BLACK);
    }
  }

  const basePath = path.join(OUTPUT, "amrp-toprak-india-v4.png");
  await sharp(canvas, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .composite([{ input: labelSvg(regions) }]).png().toFile(basePath);

  const oldMap = JSON.parse(fs.readFileSync(OLD_HEX_JSON, "utf8"));
  const hexes = oldMap.hexes.filter(h => h.q <= 48).map(h => ({ ...h, neighbors: [] }));
  for (let q = 49; q < COLUMNS; q += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const r = row - Math.floor(q / 2);
      const cx = q * H_STEP;
      const cy = row * V_STEP + (q % 2 ? V_STEP / 2 : 0);
      const sampled = sampleHex(landMask, regionIds, source.data, cx, cy);
      const region = sampled.regionIndex >= 0 ? regions[sampled.regionIndex] : null;
      hexes.push({
        id: `R56-Q${q}-R${r}`,
        code: `${columnName(q)}${String(row + 1).padStart(2, "0")}`,
        q, r, column: q, row,
        center: { x: Number(cx.toFixed(3)), y: Number((HEIGHT - cy).toFixed(3)), pixelX: Number(cx.toFixed(3)), pixelY: Number(cy.toFixed(3)) },
        polygon: hexPolygon(cx, cy), type: sampled.type,
        playable: sampled.type !== "IMPASSABLE",
        coastal: false,
        terrain: region ? region.terrain : null,
        moveCost: sampled.type === "IMPASSABLE" ? null : 1,
        regionKey: region ? region.key : null,
        province: region ? region.countryName : null,
        resource: region ? region.resource : null,
        owner: null, settlements: [], neighbors: []
      });
    }
  }

  const byAxial = new Map(hexes.map(h => [`${h.q},${h.r}`, h]));
  for (const hex of hexes) {
    hex.neighbors = DIRECTIONS.map(([dq, dr]) => byAxial.get(`${hex.q + dq},${hex.r + dr}`)).filter(Boolean).map(h => h.id);
  }
  const byId = new Map(hexes.map(h => [h.id, h]));
  for (const hex of hexes) {
    if (hex.q >= 49 && hex.type === "LAND") hex.coastal = hex.neighbors.some(id => byId.get(id)?.type === "SEA");
  }

  const settlementIndex = { ...oldMap.settlements };
  const used = new Set();
  for (const region of regions) {
    let choices = hexes.filter(h => h.q >= 49 && h.type === "LAND" && h.regionKey === region.key && !used.has(h.id));
    if (!choices.length) choices = hexes.filter(h => h.q >= 49 && h.type === "LAND" && !used.has(h.id));
    choices.sort((a, b) => Math.hypot(a.center.pixelX - region.x, a.center.pixelY - region.y) - Math.hypot(b.center.pixelX - region.x, b.center.pixelY - region.y));
    const hex = choices[0];
    if (!hex) throw new Error(`Yerleşke Hex'e bağlanamadı: ${region.settlement}`);
    used.add(hex.id);
    const item = {
      name: region.settlement, regionKey: region.key, province: region.countryName,
      sourceOwner: region.countryName,
      source: { lon: region.lon, lat: region.lat },
      pixel: { x: Number(region.x.toFixed(3)), y: Number(region.y.toFixed(3)) },
      bindingDistance: Number(Math.hypot(hex.center.pixelX - region.x, hex.center.pixelY - region.y).toFixed(3))
    };
    hex.settlements.push(item);
    settlementIndex[region.settlement] = { hexId: hex.id, hexCode: hex.code, regionKey: region.key, pixel: item.pixel };
  }

  const mapJson = {
    ...oldMap,
    mapVersion: "r56-india-v4",
    generatedAt: new Date().toISOString(),
    grid: { ...oldMap.grid, columns: COLUMNS, rows: ROWS, width: WIDTH, height: HEIGHT },
    sources: { ...oldMap.sources, image: "maps/r56-india-v4/output/amrp-toprak-india-v4.png", indiaRegions: "maps/r56-india-v3/source/india-regions.json" },
    settlements: settlementIndex,
    hexes
  };
  fs.writeFileSync(path.join(OUTPUT, "hex-map-r56-india-v4.json"), JSON.stringify(mapJson, null, 2));

  const hexPath = path.join(OUTPUT, "NEWHEXMAP-INDIA-v4.png");
  await sharp(basePath).composite([{ input: gridSvg(hexes) }]).png().toFile(hexPath);
  await sharp(basePath).resize({ width: 1200 }).jpeg({ quality: 90 }).toFile(path.join(OUTPUT, "normal-preview.jpg"));
  await sharp(hexPath).resize({ width: 1200 }).jpeg({ quality: 88 }).toFile(path.join(OUTPUT, "hex-preview.jpg"));

  const report = {
    source: { path: SOURCE, sha256: actualHash, width: OLD_WIDTH, height: HEIGHT },
    output: { width: WIDTH, height: HEIGHT, borderThicknessPx: 9 },
    countries: definitions.countries.length,
    regions: regions.length,
    settlements: regions.map(r => ({ name: r.settlement, country: r.countryName, pixel: [Number(r.x.toFixed(1)), Number(r.y.toFixed(1))], hex: settlementIndex[r.settlement].hexCode })),
    gateway: { x: [3865, 4095], y: [1608, 2248], note: "Mevcut doğu ülkelerine bindirilmiş, tuval ek yeri görünmeyen kara bağlantısı" }
  };
  fs.writeFileSync(path.join(OUTPUT, "india-v4-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
