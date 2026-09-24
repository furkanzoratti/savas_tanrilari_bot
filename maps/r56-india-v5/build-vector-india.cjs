const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let sharp;
try { sharp = require("sharp"); }
catch { sharp = require("C:/Users/Frank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"); }

const ROOT = __dirname;
const SOURCE = "C:/Users/Frank/Desktop/toprak.png";
const SOURCE_HASH = "AB050D93128E40BD24F59D1B9B765917F9F0FBA7875381ED03A070503A6DD2E6";
const NATURAL_EARTH = path.join(ROOT, "..", "r56-india-v3", "source", "natural-earth-countries.geojson");
const REGION_FILE = path.join(ROOT, "..", "r56-india-v3", "source", "india-regions.json");
const OLD_HEX_FILE = path.join(ROOT, "..", "..", "assets", "hex-map-r56.json");
const OUTPUT = path.join(ROOT, "output");

const OLD_WIDTH = 4064;
const OLD_HEIGHT = 3328;
const WIDTH = 5376;
const HEIGHT = 3328;
const RADIUS = 56;
const H_STEP = 84;
const V_STEP = 96.994845;
const COLUMNS = 64;
const ROWS = 36;
const SEA = [34, 105, 170, 255];
const VOID = [64, 64, 64, 255];
const BLACK = [0, 0, 0, 255];
const PLAYABLE = new Set(["India", "Pakistan", "Bangladesh", "Nepal", "Bhutan"]);
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// The same affine calibration used by the original R56 map project, now at
// native/full resolution rather than a half-resolution intermediate canvas.
const X_LON = 22.75254487127015;
const X_LAT = 1.0214014147498789;
const X_OFFSET = 377.3170619823777;
const Y_LON = 1.6031922933085685;
const Y_LAT = 27.073497871707495;
const Y_OFFSET = -396.12088204488714;

const escapeXml = value => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

function fileHash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

function project(lon, lat) {
  const x = X_LON * lon + X_LAT * lat + X_OFFSET;
  const yFromBottom = Y_LON * lon + Y_LAT * lat + Y_OFFSET;
  const rawY = (OLD_HEIGHT / 2 - yFromBottom) * 2;
  const anchorY = 2050;
  return { x: x * 2, y: anchorY + (rawY - anchorY) * 0.86 };
}

function ringsFor(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function geometryPath(geometry) {
  return ringsFor(geometry).map(polygon => polygon.map(ring => {
    const points = ring.map(([lon, lat]) => project(lon, lat));
    if (!points.length) return "";
    return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}${points.slice(1).map(p => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("")}Z`;
  }).join("")).join("");
}

function geometryTouchesIndiaWindow(geometry) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const polygon of ringsFor(geometry)) for (const ring of polygon) for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  return maxLon >= 54 && minLon <= 108 && maxLat >= 0 && minLat <= 48;
}

function rgba(hex) {
  const value = hex.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), 255];
}

function sourceClass(r, g, b) {
  if (Math.hypot(r - SEA[0], g - SEA[1], b - SEA[2]) < 34) return "SEA";
  if (Math.max(r, g, b) - Math.min(r, g, b) < 11 && r >= 43 && r <= 82) return "IMPASSABLE";
  return "LAND";
}

function setPixel(buffer, width, x, y, color) {
  const i = (y * width + x) * 4;
  buffer[i] = color[0]; buffer[i + 1] = color[1]; buffer[i + 2] = color[2]; buffer[i + 3] = color[3];
}

function columnName(index) {
  let value = index + 1, result = "";
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

function warpedDistance(region, x, y) {
  const wx = x + Math.sin(y / 205 + region.phase) * 42 + Math.sin(y / 71 + region.phase * 0.4) * 13;
  const wy = y + Math.sin(x / 230 + region.phase * 0.7) * 34 + Math.sin(x / 83 + region.phase) * 11;
  const dx = (wx - region.x) / region.scaleX;
  const dy = (wy - region.y) / region.scaleY;
  return dx * dx + dy * dy - region.weight;
}

function labelSvg(regions) {
  const nodes = [];
  for (const region of regions) {
    const font = region.settlement.length >= 12 ? 21 : 23;
    const offset = region.labelOffset || [11, -7];
    nodes.push(`<circle cx="${region.x.toFixed(1)}" cy="${region.y.toFixed(1)}" r="6" fill="#080808" stroke="#f2f2f2" stroke-width="3"/>`);
    nodes.push(`<text x="${(region.x + offset[0]).toFixed(1)}" y="${(region.y + offset[1]).toFixed(1)}" font-family="Arial,Segoe UI,sans-serif" font-size="${font}" font-weight="700" fill="#ececec" stroke="#282828" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${escapeXml(region.settlement)}</text>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${nodes.join("")}</svg>`);
}

function gridSvg(hexes) {
  const nodes = [];
  for (const hex of hexes) {
    nodes.push(`<polygon points="${hex.polygon.map(p => p.join(",")).join(" ")}" fill="none" stroke="#292929" stroke-width="4" stroke-linejoin="miter" shape-rendering="crispEdges"/>`);
    nodes.push(`<text x="${hex.center.pixelX}" y="${hex.center.pixelY + 7}" text-anchor="middle" font-family="Arial,Segoe UI,sans-serif" font-size="24" font-weight="800" fill="#d7d7d7" stroke="#202020" stroke-width="5" paint-order="stroke">${hex.code}</text>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${nodes.join("")}</svg>`);
}

function simplifyRing(points) {
  if (points.length < 4) return points;
  const collinear = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[(i - 1 + points.length) % points.length];
    const b = points[i];
    const c = points[(i + 1) % points.length];
    if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) continue;
    collinear.push(b);
  }
  return collinear;
}

function traceRegionLoops(regionIds, regionIndex, step = 4) {
  const cols = Math.ceil(WIDTH / step);
  const rows = Math.ceil(HEIGHT / step);
  const cells = new Set();
  for (let gy = 0; gy < rows; gy += 1) {
    const y = Math.min(HEIGHT - 1, gy * step + Math.floor(step / 2));
    for (let gx = Math.floor(3600 / step); gx < cols; gx += 1) {
      const x = Math.min(WIDTH - 1, gx * step + Math.floor(step / 2));
      if (regionIds[y * WIDTH + x] === regionIndex) cells.add(`${gx},${gy}`);
    }
  }
  const edges = new Map();
  const add = (ax, ay, bx, by) => {
    const key = `${ax},${ay}`;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push([bx, by]);
  };
  for (const key of cells) {
    const [gx, gy] = key.split(",").map(Number);
    if (!cells.has(`${gx},${gy - 1}`)) add(gx, gy, gx + 1, gy);
    if (!cells.has(`${gx + 1},${gy}`)) add(gx + 1, gy, gx + 1, gy + 1);
    if (!cells.has(`${gx},${gy + 1}`)) add(gx + 1, gy + 1, gx, gy + 1);
    if (!cells.has(`${gx - 1},${gy}`)) add(gx, gy + 1, gx, gy);
  }
  const loops = [];
  while (edges.size) {
    const firstKey = edges.keys().next().value;
    const [sx, sy] = firstKey.split(",").map(Number);
    const loop = [[sx, sy]];
    let current = firstKey;
    let guard = 0;
    while (guard++ < 200000) {
      const options = edges.get(current);
      if (!options?.length) break;
      const next = options.pop();
      if (!options.length) edges.delete(current);
      loop.push(next);
      current = `${next[0]},${next[1]}`;
      if (current === firstKey) break;
    }
    if (loop.length >= 4 && current === firstKey) loops.push(simplifyRing(loop.map(([x, y]) => [x * step, y * step])));
  }
  return loops;
}

function loopsPath(loops) {
  return loops.map(loop => loop.length ? `M${loop[0][0]},${loop[0][1]}${loop.slice(1).map(p => `L${p[0]},${p[1]}`).join("")}Z` : "").join("");
}

function sampleHex(playableMask, worldMask, regionIds, oldRaw, cx, cy) {
  const offsets = [[0, 0], [24, 0], [-24, 0], [12, 21], [-12, 21], [12, -21], [-12, -21]];
  const counts = { LAND: 0, SEA: 0, IMPASSABLE: 0 };
  const regionCounts = new Map();
  for (const [dx, dy] of offsets) {
    const x = Math.max(0, Math.min(WIDTH - 1, Math.round(cx + dx)));
    const y = Math.max(0, Math.min(HEIGHT - 1, Math.round(cy + dy)));
    const idx = y * WIDTH + x;
    if (playableMask[idx] >= 128) {
      counts.LAND += 1;
      const region = regionIds[idx];
      if (region >= 0) regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
    } else if (x < OLD_WIDTH && y < OLD_HEIGHT) {
      const oi = (y * OLD_WIDTH + x) * 4;
      counts[sourceClass(oldRaw[oi], oldRaw[oi + 1], oldRaw[oi + 2])] += 1;
    } else {
      counts[worldMask[idx] >= 128 ? "IMPASSABLE" : "SEA"] += 1;
    }
  }
  const type = counts.LAND >= 3 ? "LAND" : counts.SEA >= counts.IMPASSABLE ? "SEA" : "IMPASSABLE";
  const regionIndex = type === "LAND" && regionCounts.size ? [...regionCounts].sort((a, b) => b[1] - a[1])[0][0] : -1;
  return { type, regionIndex };
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const actualHash = fileHash(SOURCE);
  if (actualHash !== SOURCE_HASH) throw new Error(`Kaynak harita değişti: ${actualHash}`);

  const naturalEarth = JSON.parse(fs.readFileSync(NATURAL_EARTH, "utf8"));
  const windowFeatures = naturalEarth.features.filter(f => geometryTouchesIndiaWindow(f.geometry));
  const playableFeatures = windowFeatures.filter(f => PLAYABLE.has(f.properties.ADMIN));
  const worldPath = windowFeatures.map(f => geometryPath(f.geometry)).join("");
  const playablePath = playableFeatures.map(f => geometryPath(f.geometry)).join("");
  const maskSvg = d => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><path d="${d}" fill="#fff" fill-rule="evenodd"/></svg>`);
  const worldMask = await sharp(maskSvg(worldPath)).flatten({ background: "#000" }).greyscale().raw().toBuffer();
  const playableMask = await sharp(maskSvg(playablePath)).flatten({ background: "#000" }).greyscale().raw().toBuffer();

  const definitions = JSON.parse(fs.readFileSync(REGION_FILE, "utf8"));
  const countries = new Map(definitions.countries.map(c => [c.key, c]));
  const labelOffsets = {
    india_maurya_takshashila: [10, -8], india_maurya_pataliputra: [-125, -10],
    india_kalinga_tosali: [10, -8], india_kalinga_dantapura: [10, 22],
    india_satavahana_amaravati: [10, 22], india_chola_urayur: [10, -8],
    india_pandya_madurai: [10, 22], india_chera_muziris: [-88, -8]
  };
  const weights = {
    india_maurya_takshashila: 0.05, india_maurya_pataliputra: 0.2, india_maurya_ujjayini: 0.16,
    india_kamarupa_pragjyotisha: -0.08, india_chera_muziris: -0.05
  };
  const regions = definitions.regions.map((entry, index) => {
    const point = project(entry.lon, entry.lat);
    const country = countries.get(entry.country);
    return {
      ...entry, index, x: point.x, y: point.y, phase: 0.65 + index * 0.91,
      scaleX: entry.country === "maurya" ? 185 : 145,
      scaleY: entry.country === "maurya" ? 210 : 165,
      weight: weights[entry.key] || 0,
      color: rgba(country.color), colorHex: country.color,
      countryName: country.name, labelOffset: labelOffsets[entry.key]
    };
  });

  const source = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const canvas = Buffer.alloc(WIDTH * HEIGHT * 4);
  const regionIds = new Int16Array(WIDTH * HEIGHT); regionIds.fill(-1);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (x < OLD_WIDTH && y < OLD_HEIGHT) {
        const oi = (y * OLD_WIDTH + x) * 4;
        setPixel(canvas, WIDTH, x, y, [source.data[oi], source.data[oi + 1], source.data[oi + 2], source.data[oi + 3]]);
      } else {
        const idx = y * WIDTH + x;
        setPixel(canvas, WIDTH, x, y, y < 1780 || worldMask[idx] >= 128 ? VOID : SEA);
      }
    }
  }

  // Reconstruct only the previously empty eastern overlap from real land/ocean geometry.
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 3600; x < WIDTH; x += 1) {
      const idx = y * WIDTH + x;
      if (x < OLD_WIDTH && y < OLD_HEIGHT) {
        const oi = (y * OLD_WIDTH + x) * 4;
        const cls = sourceClass(source.data[oi], source.data[oi + 1], source.data[oi + 2]);
        if (cls !== "LAND") setPixel(canvas, WIDTH, x, y, y < 1780 || worldMask[idx] >= 128 ? VOID : SEA);
      }
      if (playableMask[idx] < 128) continue;
      let best = 0, bestDistance = Infinity;
      for (const region of regions) {
        const distance = warpedDistance(region, x, y);
        if (distance < bestDistance) { bestDistance = distance; best = region.index; }
      }
      regionIds[idx] = best;
      if (x < OLD_WIDTH && y < OLD_HEIGHT) {
        const oi = (y * OLD_WIDTH + x) * 4;
        if (sourceClass(source.data[oi], source.data[oi + 1], source.data[oi + 2]) === "LAND") continue;
      }
      setPixel(canvas, WIDTH, x, y, regions[best].color);
    }
  }

  const frontier = Buffer.alloc(WIDTH * HEIGHT);
  for (let y = 1; y < HEIGHT - 1; y += 1) for (let x = 3601; x < WIDTH - 1; x += 1) {
    const idx = y * WIDTH + x;
    const id = regionIds[idx];
    if (id < 0) continue;
    if (regionIds[idx - 1] !== id || regionIds[idx + 1] !== id || regionIds[idx - WIDTH] !== id || regionIds[idx + WIDTH] !== id) frontier[idx] = 255;
  }
  const thick = await sharp(frontier, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } }).dilate(4).raw().toBuffer();
  for (let y = 0; y < HEIGHT; y += 1) for (let x = 3596; x < WIDTH; x += 1) {
    const idx = y * WIDTH + x;
    if (!thick[idx]) continue;
    if (x < OLD_WIDTH && y < OLD_HEIGHT) {
      const oi = (y * OLD_WIDTH + x) * 4;
      if (sourceClass(source.data[oi], source.data[oi + 1], source.data[oi + 2]) === "LAND") continue;
    }
    setPixel(canvas, WIDTH, x, y, BLACK);
  }

  const normalPath = path.join(OUTPUT, "amrp-toprak-india-vector-v5.png");
  await sharp(canvas, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .composite([{ input: labelSvg(regions) }]).png().toFile(normalPath);

  const vectorRegions = regions.map(region => ({ region, loops: traceRegionLoops(regionIds, region.index) }));
  const svgPaths = vectorRegions.map(({ region, loops }) =>
    `<path id="${region.key}" data-country="${escapeXml(region.countryName)}" d="${loopsPath(loops)}" fill="${region.colorHex}" stroke="#000" stroke-width="8" stroke-linejoin="miter" fill-rule="evenodd" shape-rendering="crispEdges"/>`
  ).join("");
  const vectorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" shape-rendering="crispEdges"><g id="india-regions">${svgPaths}</g></svg>`;
  fs.writeFileSync(path.join(OUTPUT, "india-extension-overlay-v5.svg"), vectorSvg);

  const geojson = {
    type: "FeatureCollection",
    name: "AMRP India Expansion v5 - local pixel coordinates",
    features: vectorRegions.flatMap(({ region, loops }, component) => loops.map((loop, index) => ({
      type: "Feature",
      properties: { regionKey: region.key, settlement: region.settlement, country: region.countryName, component: `${component}-${index}` },
      geometry: { type: "Polygon", coordinates: [[...loop, loop[0]]] }
    })))
  };
  fs.writeFileSync(path.join(OUTPUT, "india-regions-v5.geojson"), JSON.stringify(geojson));

  const oldMap = JSON.parse(fs.readFileSync(OLD_HEX_FILE, "utf8"));
  const hexes = oldMap.hexes.filter(h => h.q <= 48).map(h => ({ ...h, neighbors: [] }));
  for (let q = 49; q < COLUMNS; q += 1) for (let row = 0; row < ROWS; row += 1) {
    const r = row - Math.floor(q / 2);
    const cx = q * H_STEP;
    const cy = row * V_STEP + (q % 2 ? V_STEP / 2 : 0);
    const sampled = sampleHex(playableMask, worldMask, regionIds, source.data, cx, cy);
    const region = sampled.regionIndex >= 0 ? regions[sampled.regionIndex] : null;
    hexes.push({
      id: `R56-Q${q}-R${r}`, code: `${columnName(q)}${String(row + 1).padStart(2, "0")}`,
      q, r, column: q, row,
      center: { x: Number(cx.toFixed(3)), y: Number((HEIGHT - cy).toFixed(3)), pixelX: Number(cx.toFixed(3)), pixelY: Number(cy.toFixed(3)) },
      polygon: hexPolygon(cx, cy), type: sampled.type, playable: sampled.type !== "IMPASSABLE", coastal: false,
      terrain: region?.terrain || null, moveCost: sampled.type === "IMPASSABLE" ? null : 1,
      regionKey: region?.key || null, province: region?.countryName || null, resource: region?.resource || null,
      owner: null, settlements: [], neighbors: []
    });
  }
  const byAxial = new Map(hexes.map(h => [`${h.q},${h.r}`, h]));
  for (const hex of hexes) hex.neighbors = DIRECTIONS.map(([dq, dr]) => byAxial.get(`${hex.q + dq},${hex.r + dr}`)).filter(Boolean).map(h => h.id);
  const byId = new Map(hexes.map(h => [h.id, h]));
  for (const hex of hexes) if (hex.q >= 49 && hex.type === "LAND") hex.coastal = hex.neighbors.some(id => byId.get(id)?.type === "SEA");

  const settlements = { ...oldMap.settlements };
  const used = new Set();
  for (const region of regions) {
    let candidates = hexes.filter(h => h.q >= 49 && h.type === "LAND" && h.regionKey === region.key && !used.has(h.id));
    if (!candidates.length) candidates = hexes.filter(h => h.q >= 49 && h.type === "LAND" && !used.has(h.id));
    candidates.sort((a, b) => Math.hypot(a.center.pixelX - region.x, a.center.pixelY - region.y) - Math.hypot(b.center.pixelX - region.x, b.center.pixelY - region.y));
    const hex = candidates[0];
    if (!hex) throw new Error(`Yerleşke bağlanamadı: ${region.settlement}`);
    used.add(hex.id);
    const item = {
      name: region.settlement, regionKey: region.key, province: region.countryName, sourceOwner: region.countryName,
      source: { lon: region.lon, lat: region.lat }, pixel: { x: Number(region.x.toFixed(3)), y: Number(region.y.toFixed(3)) },
      bindingDistance: Number(Math.hypot(hex.center.pixelX - region.x, hex.center.pixelY - region.y).toFixed(3))
    };
    hex.settlements.push(item);
    settlements[region.settlement] = { hexId: hex.id, hexCode: hex.code, regionKey: region.key, pixel: item.pixel };
  }

  const map = {
    ...oldMap, mapVersion: "r56-india-vector-v5", generatedAt: new Date().toISOString(),
    grid: { ...oldMap.grid, columns: COLUMNS, rows: ROWS, width: WIDTH, height: HEIGHT },
    sources: { ...oldMap.sources, image: "maps/r56-india-v5/output/amrp-toprak-india-vector-v5.png", vector: "maps/r56-india-v5/output/india-extension-overlay-v5.svg" },
    settlements, hexes
  };
  fs.writeFileSync(path.join(OUTPUT, "hex-map-r56-india-vector-v5.json"), JSON.stringify(map, null, 2));
  const hexPath = path.join(OUTPUT, "NEWHEXMAP-INDIA-VECTOR-v5.png");
  await sharp(normalPath).composite([{ input: gridSvg(hexes) }]).png().toFile(hexPath);
  await sharp(normalPath).resize({ width: 1400 }).jpeg({ quality: 92 }).toFile(path.join(OUTPUT, "normal-preview.jpg"));
  await sharp(hexPath).resize({ width: 1400 }).jpeg({ quality: 90 }).toFile(path.join(OUTPUT, "hex-preview.jpg"));

  const report = {
    sourceSha256: actualHash, dimensions: [WIDTH, HEIGHT], rasterLineAntialiasing: false,
    borderWidthPx: 9, vectorSource: "Natural Earth coastline + local affine calibration",
    countries: definitions.countries.length, regions: regions.length,
    settlements: regions.map(r => ({ name: r.settlement, country: r.countryName, pixel: [Number(r.x.toFixed(1)), Number(r.y.toFixed(1))], hex: settlements[r.settlement].hexCode }))
  };
  fs.writeFileSync(path.join(OUTPUT, "india-vector-v5-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
