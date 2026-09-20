const fs = require("node:fs");
const path = require("node:path");
let sharp;
try { sharp = require("sharp"); }
catch {
  try { sharp = require("C:/Users/Frank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"); }
  catch { throw new Error("R56 haritasını yeniden üretmek için sharp paketini kurun."); }
}

const SOURCE_IMAGE = path.join(__dirname, "qgis", "kaynak", "amrp-toprak.png");
const SETTLEMENT_CSV = path.join(__dirname, "source", "settlements.csv");
const TERRAIN_CSV = path.join(__dirname, "source", "terrain.csv");
const GEOMETRY_MODULE = path.join(__dirname, "source", "twdb_geometry.mjs");
const REGION_MODULE = path.join(__dirname, "source", "twdb_regions.mjs");
const OUTPUT_JSON = path.join(__dirname, "..", "..", "assets", "hex-map-r56.json");
const REPORT_JSON = path.join(__dirname, "hex-map-report.json");
const DIAGNOSTIC_PNG = path.join(__dirname, "r56-siniflandirma.png");

const WIDTH = 4064;
const HEIGHT = 3328;
const RADIUS = 56;
const H_STEP = RADIUS * 1.5;
const V_STEP = RADIUS * Math.sqrt(3);
const COLUMNS = 50;
const ROWS = 36;
const SEA = [34, 105, 170];
const VOID = [64, 64, 64];
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function csvRows(file) {
  const [header, ...lines] = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const keys = header.split(";");
  return lines.filter(Boolean).map((line) => Object.fromEntries(line.split(";").map((value, index) => [keys[index], value])));
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

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(x, y, coordinates) {
  if (!coordinates.length || !pointInRing(x, y, coordinates[0])) return false;
  return !coordinates.slice(1).some((hole) => pointInRing(x, y, hole));
}

function geometryContains(geometry, x, y) {
  if (geometry.type === "Polygon") return pointInPolygon(x, y, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygonValue) => pointInPolygon(x, y, polygonValue));
  if (geometry.type === "GeometryCollection") return geometry.geometries.some((child) => geometryContains(child, x, y));
  return false;
}

function polygon(cx, cy) {
  return Array.from({ length: 6 }, (_, side) => {
    const angle = side * Math.PI / 3;
    return [Number((cx + RADIUS * Math.cos(angle)).toFixed(3)), Number((cy + RADIUS * Math.sin(angle)).toFixed(3))];
  });
}

function samplingPoints(cx, cy) {
  const points = [[cx, cy]];
  for (const ratio of [0.28, 0.55, 0.78]) {
    for (let side = 0; side < 12; side += 1) {
      const angle = side * Math.PI / 6;
      points.push([cx + RADIUS * ratio * Math.cos(angle), cy + RADIUS * ratio * Math.sin(angle)]);
    }
  }
  return points;
}

function pixelAt(raw, channels, x, y) {
  const px = Math.max(0, Math.min(WIDTH - 1, Math.round(x)));
  const py = Math.max(0, Math.min(HEIGHT - 1, Math.round(y)));
  const index = (py * WIDTH + px) * channels;
  return [raw[index], raw[index + 1], raw[index + 2]];
}

function regionAt(features, pixelX, pixelY) {
  const sourceX = pixelX / 2;
  const sourceY = (HEIGHT - pixelY) / 2;
  return features.find((feature) => geometryContains(feature.geometry, sourceX, sourceY))?.properties?.key ?? null;
}

function regionVotesNearHex(features, cx, cy) {
  const votes = new Map();
  for (const ratio of [0.15, 0.35, 0.55, 0.75, 0.9]) {
    for (let side = 0; side < 24; side += 1) {
      const angle = side * Math.PI / 12;
      const px = cx + RADIUS * ratio * Math.cos(angle);
      const py = cy + RADIUS * ratio * Math.sin(angle);
      if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) continue;
      const key = regionAt(features, px, py);
      if (key) votes.set(key, (votes.get(key) ?? 0) + 1);
    }
  }
  return [...votes].sort((a, b) => b[1] - a[1]);
}

function nearestHex(hexes, x, y) {
  let best = null;
  for (const hex of hexes) {
    const distance = Math.hypot(hex.center.pixelX - x, hex.center.pixelY - y);
    if (!best || distance < best.distance) best = { hex, distance };
  }
  return best;
}

function diagnosticSvg(hexes) {
  const colors = { LAND: "#64cf73", SEA: "#3ca8df" };
  const polygons = hexes.filter((hex) => hex.playable).map((hex) => {
    const points = hex.polygon.map(([x, y]) => `${x},${y}`).join(" ");
    return `<polygon points="${points}" fill="${colors[hex.type]}" fill-opacity="0.30" stroke="#f4dfaa" stroke-opacity="0.55" stroke-width="2"/>`;
  }).join("\n");
  const settlements = hexes.flatMap((hex) => hex.settlements.map((settlement) => `<circle cx="${hex.center.pixelX}" cy="${hex.center.pixelY}" r="7" fill="#ffcf4a" stroke="#111" stroke-width="2"><title>${settlement.name} • ${hex.code}</title></circle>`)).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${polygons}${settlements}</svg>`;
}

async function main() {
  const [{ default: geometry }, { default: regionMetadata }] = await Promise.all([
    import(`file:///${GEOMETRY_MODULE.replace(/\\/g, "/")}`),
    import(`file:///${REGION_MODULE.replace(/\\/g, "/")}`)
  ]);
  const terrainByRegion = new Map(csvRows(TERRAIN_CSV).map((row) => [row["Bölge Anahtarı"], row["Arazi Türü"]]));
  const settlements = csvRows(SETTLEMENT_CSV);
  const { data: raw, info } = await sharp(SOURCE_IMAGE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== WIDTH || info.height !== HEIGHT) throw new Error(`Beklenmeyen harita boyutu: ${info.width}x${info.height}`);

  const hexes = [];
  for (let column = 0; column < COLUMNS; column += 1) {
    const cx = column * H_STEP;
    const offsetY = column % 2 === 0 ? 0 : V_STEP / 2;
    for (let row = 0; row < ROWS; row += 1) {
      const cy = row * V_STEP + offsetY;
      const q = column;
      const r = row - ((column - (column & 1)) / 2);
      const insideCanvas = cx >= 0 && cx < WIDTH && cy >= 0 && cy < HEIGHT;
      const samples = insideCanvas ? samplingPoints(cx, cy).filter(([x, y]) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) : [];
      let sea = 0;
      let voidCount = 0;
      let land = 0;
      for (const [x, y] of samples) {
        const color = pixelAt(raw, info.channels, x, y);
        if (colorDistance(color, VOID) <= 16) voidCount += 1;
        else if (colorDistance(color, SEA) <= 24) sea += 1;
        else land += 1;
      }
      const sampleCount = samples.length || 1;
      const regionKey = insideCanvas ? regionAt(geometry.features, cx, cy) : null;
      let type = "IMPASSABLE";
      if (insideCanvas && regionKey) type = "LAND";
      else if (insideCanvas && voidCount / sampleCount < 0.58) type = sea >= land ? "SEA" : "LAND";
      const playable = type !== "IMPASSABLE";
      const metadata = regionKey ? regionMetadata[regionKey] : null;
      hexes.push({
        id: idFor(q, r), code: `${columnName(column)}${String(row + 1).padStart(2, "0")}`,
        q, r, column, row,
        center: { x: Number(cx.toFixed(3)), y: Number((HEIGHT - cy).toFixed(3)), pixelX: Number(cx.toFixed(3)), pixelY: Number(cy.toFixed(3)) },
        polygon: polygon(cx, cy), type, playable,
        coastal: playable && land / sampleCount >= 0.12 && sea / sampleCount >= 0.12,
        terrain: regionKey ? terrainByRegion.get(regionKey) ?? null : null,
        moveCost: playable ? 1 : null, regionKey,
        province: metadata?.province ?? null, resource: metadata?.resource ?? null,
        owner: null, settlements: [], neighbors: []
      });
    }
  }

  const hexById = new Map(hexes.map((hex) => [hex.id, hex]));
  const settlementIndex = {};
  for (const row of settlements) {
    const pixelX = Number(row.X) * 2;
    const pixelY = HEIGHT - Number(row.Y) * 2;
    const { hex, distance } = nearestHex(hexes, pixelX, pixelY);
    const settlement = {
      name: row["Yerleşke"], regionKey: row["Bölge Anahtarı"], province: row["Eyalet"],
      sourceOwner: row["Başlangıç Sahibi"], source: { x: Number(row.X), y: Number(row.Y) },
      pixel: { x: pixelX, y: pixelY }, bindingDistance: Number(distance.toFixed(3))
    };
    hex.type = "LAND";
    hex.playable = true;
    hex.regionKey = settlement.regionKey;
    hex.province = regionMetadata[settlement.regionKey]?.province ?? hex.province;
    hex.resource = regionMetadata[settlement.regionKey]?.resource ?? hex.resource;
    hex.terrain = terrainByRegion.get(settlement.regionKey) ?? hex.terrain;
    hex.moveCost = 1;
    hex.settlements.push(settlement);
    settlementIndex[settlement.name] = { hexId: hex.id, hexCode: hex.code, regionKey: settlement.regionKey, pixel: settlement.pixel };
  }

  const inferredRegions = [];
  for (const hex of hexes) {
    if (hex.type !== "LAND" || hex.regionKey) continue;
    const candidates = regionVotesNearHex(geometry.features, hex.center.pixelX, hex.center.pixelY);
    if (!candidates.length) continue;
    const [regionKey, topVotes] = candidates[0];
    const secondVotes = candidates[1]?.[1] ?? 0;
    hex.regionKey = regionKey;
    hex.province = regionMetadata[regionKey]?.province ?? null;
    hex.resource = regionMetadata[regionKey]?.resource ?? null;
    hex.terrain = terrainByRegion.get(regionKey) ?? null;
    hex.regionAssignment = {
      method: "HEX_POLYGON_SAMPLING",
      topVotes,
      secondVotes,
      needsReview: secondVotes > 0 && topVotes / (topVotes + secondVotes) < 0.6
    };
    inferredRegions.push({ code: hex.code, regionKey, ...hex.regionAssignment });
  }

  for (const hex of hexes) {
    if (!hex.playable) continue;
    hex.neighbors = DIRECTIONS.map(([dq, dr]) => hexById.get(idFor(hex.q + dq, hex.r + dr))).filter((neighbor) => neighbor?.playable).map((neighbor) => neighbor.id);
  }

  const collisions = hexes.filter((hex) => hex.settlements.length > 1).map((hex) => ({ hexId: hex.id, code: hex.code, settlements: hex.settlements.map((item) => item.name) }));
  const typeCounts = Object.fromEntries(["LAND", "SEA", "IMPASSABLE"].map((type) => [type, hexes.filter((hex) => hex.type === type).length]));
  const result = {
    schemaVersion: 1, mapVersion: "amrp-r56-v2", generatedAt: new Date().toISOString(),
    grid: { orientation: "flat-top", radius: RADIUS, horizontalStep: H_STEP, verticalStep: Number(V_STEP.toFixed(6)), columns: COLUMNS, rows: ROWS, width: WIDTH, height: HEIGHT, coordinateSystem: "local-pixel/EPSG:3857" },
    sources: { image: "maps/r56/qgis/kaynak/amrp-toprak.png", geometry: "maps/r56/source/twdb_geometry.mjs", regions: "maps/r56/source/twdb_regions.mjs", settlements: "maps/r56/source/settlements.csv", terrain: "maps/r56/source/terrain.csv" },
    traversal: { LAND_ARMY: ["LAND"], FLEET: ["SEA"], note: "Sahiplik, diplomatik geçiş, liman ve tur hareket bonusları rota çağrısında politika olarak uygulanır." },
    settlements: settlementIndex, hexes
  };
  fs.mkdirSync(path.dirname(DIAGNOSTIC_PNG), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const report = {
    mapVersion: result.mapVersion, totalHexes: hexes.length,
    playableHexes: hexes.filter((hex) => hex.playable).length, typeCounts,
    settlements: settlements.length, boundSettlements: Object.keys(settlementIndex).length,
    settlementCollisions: collisions,
    inferredRegionHexes: inferredRegions.length,
    ambiguousRegionHexes: inferredRegions.filter((item) => item.needsReview),
    unassignedLandHexes: hexes.filter((hex) => hex.type === "LAND" && !hex.regionKey).map((hex) => hex.code),
    maximumBindingDistance: Math.max(...hexes.flatMap((hex) => hex.settlements.map((item) => item.bindingDistance)))
  };
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await sharp(SOURCE_IMAGE).composite([{ input: Buffer.from(diagnosticSvg(hexes)) }]).png({ compressionLevel: 9 }).toFile(DIAGNOSTIC_PNG);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
