const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let sharp;
try { sharp = require("sharp"); }
catch { sharp = require("C:/Users/Frank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"); }

const ROOT = __dirname;
const SOURCE = path.join(ROOT, "source", "india-political-updated.png");
const SOURCE_HASH = "5D3B254CB19915671F55017C7FDAF9D42DA5BF3D786C95C6D85A60848A71EA93";
// Keep the western/original R56 data pinned to a stable source. The canonical
// asset is overwritten by this generator, so reading it here would make later
// runs depend on their own previous output.
const OLD_MAP_FILE = path.join(ROOT, "..", "r56-india-v5", "output", "hex-map-r56-india-vector-v5.json");
const OUTPUT = path.join(ROOT, "output");

const WIDTH = 5376;
const HEIGHT = 3328;
const RADIUS = 56;
const H_STEP = 84;
const V_STEP = 96.994845;
const COLUMNS = 64;
const ROWS = 36;
// Q47 still contains the original Maracanda/Eucratideia/Kapisene boundary.
// India begins at Q48, so preserving Q47 also keeps every legacy region tied
// to its settlement instead of producing an ownerless western border cell.
const REBUILD_FROM_Q = 48;
const SEA = [34, 105, 170];
const VOID = [64, 64, 64];
const HIMALAYA = [127, 51, 0];
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const settlementsInput = [
  ["Puşkalavati", 4133, 1844], ["Sagala", 4210, 1955], ["Taxila", 4104, 2076],
  ["Ujjain", 4120, 2244], ["Mathura", 4314, 2114], ["Kalsi", 4526, 2084],
  ["Badrinath", 4740, 2128], ["Mithila", 4888, 2170], ["Hastinapura", 4562, 2233],
  ["Ayodhya", 4810, 2250], ["Vaishali", 5053, 2240], ["Sravasti", 4500, 2328],
  ["Varanasi", 4740, 2386], ["Champa", 5158, 2305], ["Rajagriha", 4864, 2417],
  ["Pundra", 5090, 2443], ["Vanga", 5298, 2430], ["Vidisha", 4328, 2455],
  ["Kausambi", 4035, 2495], ["Mahishmati", 4245, 2580], ["Tosali", 4610, 2670],
  ["Tamaralipti", 4810, 2540], ["Uraiyar", 5015, 2477], ["Anga", 5060, 2680],
  ["Samata", 5320, 2550], ["Bharakaccha", 4030, 2710], ["Pratisthana", 4270, 2800],
  ["Kalinganagara", 4580, 2780], ["Suparka", 4145, 2960], ["Kanchipuram", 4280, 3095],
  ["Madurai", 4230, 3182], ["Korkai", 4480, 3200], ["Andhra", 5310, 2710],
  ["Pathein", 5310, 2930], ["Tamlaka", 5250, 3160], ["Malaya", 5310, 3260]
].map(([name, x, y]) => ({ name, x, y, regionKey: `india_${slug(name)}` }));

function slug(value) {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ş/g, "s")
    .replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function terrainForSettlement(name) {
  if (["Puşkalavati", "Sagala", "Kalsi", "Badrinath"].includes(name)) return "Dağlık";
  if (["Samata", "Andhra", "Pathein", "Tamlaka", "Malaya"].includes(name)) return "Ormanlık";
  return "Düz Ova";
}

function fileHash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

function distance(color, target) {
  return Math.hypot(color[0] - target[0], color[1] - target[1], color[2] - target[2]);
}

function pixelClass(data, channels, x, y) {
  const index = (Math.round(y) * WIDTH + Math.round(x)) * channels;
  const color = [data[index], data[index + 1], data[index + 2]];
  if (distance(color, SEA) < 25) return "SEA";
  if (distance(color, VOID) < 18) return "VOID";
  if (y < 2450 && distance(color, HIMALAYA) < 28) return "HIMALAYA";
  if (Math.max(...color) < 35 || Math.min(...color) > 225) return "UNKNOWN";
  return "LAND";
}

function sampleHex(data, channels, cx, cy) {
  const offsets = [
    [0, 0], [20, 0], [-20, 0], [0, 20], [0, -20],
    [34, 0], [-34, 0], [17, 29], [-17, 29], [17, -29], [-17, -29],
    [42, 18], [-42, 18], [42, -18], [-42, -18]
  ];
  const counts = { LAND: 0, SEA: 0, VOID: 0, HIMALAYA: 0, UNKNOWN: 0 };
  for (const [dx, dy] of offsets) {
    const x = Math.max(0, Math.min(WIDTH - 1, cx + dx));
    const y = Math.max(0, Math.min(HEIGHT - 1, cy + dy));
    counts[pixelClass(data, channels, x, y)] += 1;
  }
  if (counts.HIMALAYA >= 7 && counts.HIMALAYA >= counts.LAND) {
    return { type: "IMPASSABLE", himalaya: true };
  }
  if (counts.LAND >= 3 && counts.LAND >= counts.SEA && counts.LAND >= counts.VOID) {
    return { type: "LAND", himalaya: false };
  }
  if (counts.SEA >= counts.VOID) return { type: "SEA", himalaya: false };
  return { type: "IMPASSABLE", himalaya: false };
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

function gridSvg(hexes) {
  const nodes = [];
  for (const hex of hexes) {
    if (hex.himalaya) continue;
    nodes.push(`<polygon points="${hex.polygon.map(point => point.join(",")).join(" ")}" fill="none" stroke="#292929" stroke-width="4" stroke-linejoin="miter" shape-rendering="crispEdges"/>`);
    nodes.push(`<text x="${hex.center.pixelX}" y="${hex.center.pixelY + 7}" text-anchor="middle" font-family="Arial,Segoe UI,sans-serif" font-size="24" font-weight="800" fill="#d7d7d7" stroke="#202020" stroke-width="5" paint-order="stroke">${hex.code}</text>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" shape-rendering="crispEdges">${nodes.join("")}</svg>`);
}

async function gridWithoutHimalaya(hexes, source) {
  const grid = await sharp(gridSvg(hexes)).ensureAlpha().raw().toBuffer();
  const mask = Buffer.alloc(WIDTH * HEIGHT);
  for (let y = 0; y < Math.min(2450, HEIGHT); y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const pixelIndex = y * WIDTH + x;
      const sourceIndex = pixelIndex * source.info.channels;
      const color = [source.data[sourceIndex], source.data[sourceIndex + 1], source.data[sourceIndex + 2]];
      if (distance(color, HIMALAYA) < 28) mask[pixelIndex] = 255;
    }
  }
  const expandedMask = await sharp(mask, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } })
    .dilate(5)
    .raw()
    .toBuffer();
  for (let pixelIndex = 0; pixelIndex < expandedMask.length; pixelIndex += 1) {
    if (expandedMask[pixelIndex]) grid[pixelIndex * 4 + 3] = 0;
  }
  return sharp(grid, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toBuffer();
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const actualHash = fileHash(SOURCE);
  if (actualHash !== SOURCE_HASH) throw new Error(`Kaynak harita değişti: ${actualHash}`);

  const source = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (source.info.width !== WIDTH || source.info.height !== HEIGHT) {
    throw new Error(`Kaynak ölçüsü ${source.info.width}x${source.info.height}; ${WIDTH}x${HEIGHT} bekleniyordu.`);
  }
  const oldMap = JSON.parse(fs.readFileSync(OLD_MAP_FILE, "utf8"));
  const preserved = oldMap.hexes
    .filter(hex => hex.q < REBUILD_FROM_Q)
    .map(hex => ({ ...hex, neighbors: [], himalaya: false }));
  const hexes = [...preserved];

  for (let q = REBUILD_FROM_Q; q < COLUMNS; q += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const r = row - Math.floor(q / 2);
      const cx = q * H_STEP;
      const cy = row * V_STEP + (q % 2 ? V_STEP / 2 : 0);
      const sampled = cx < 0 || cx >= WIDTH || cy < 0 || cy >= HEIGHT
        ? { type: "IMPASSABLE", himalaya: false }
        : sampleHex(source.data, source.info.channels, cx, cy);
      hexes.push({
        id: `R56-Q${q}-R${r}`,
        code: `${columnName(q)}${String(row + 1).padStart(2, "0")}`,
        q, r, column: q, row,
        center: {
          x: Number(cx.toFixed(3)), y: Number((HEIGHT - cy).toFixed(3)),
          pixelX: Number(cx.toFixed(3)), pixelY: Number(cy.toFixed(3))
        },
        polygon: hexPolygon(cx, cy), type: sampled.type,
        playable: sampled.type !== "IMPASSABLE", coastal: false,
        terrain: null, moveCost: sampled.type === "IMPASSABLE" ? null : 1,
        regionKey: null, province: null, resource: null, owner: null,
        settlements: [], neighbors: [], himalaya: sampled.himalaya
      });
    }
  }

  const byId = new Map(hexes.map(hex => [hex.id, hex]));

  const settlements = Object.fromEntries(
    Object.entries(oldMap.settlements).filter(([, binding]) => byId.get(binding.hexId)?.q < REBUILD_FROM_Q)
  );
  const used = new Set();
  const bindings = [];
  for (const settlement of settlementsInput) {
    const candidates = hexes
      .filter(hex => hex.q >= REBUILD_FROM_Q && !hex.himalaya && !used.has(hex.id))
      .sort((a, b) =>
        Math.hypot(a.center.pixelX - settlement.x, a.center.pixelY - settlement.y) -
        Math.hypot(b.center.pixelX - settlement.x, b.center.pixelY - settlement.y)
      );
    const hex = candidates[0];
    if (!hex) throw new Error(`Yerleşke kara Hex'ine bağlanamadı: ${settlement.name}`);
    hex.type = "LAND";
    hex.playable = true;
    hex.moveCost = 1;
    hex.regionKey = settlement.regionKey;
    hex.province = settlement.name;
    hex.terrain = terrainForSettlement(settlement.name);
    used.add(hex.id);
    const bindingDistance = Number(Math.hypot(hex.center.pixelX - settlement.x, hex.center.pixelY - settlement.y).toFixed(2));
    const item = {
      name: settlement.name, regionKey: settlement.regionKey, province: settlement.name, sourceOwner: null,
      pixel: { x: settlement.x, y: settlement.y }, bindingDistance
    };
    hex.settlements.push(item);
    settlements[settlement.name] = {
      hexId: hex.id, hexCode: hex.code, regionKey: settlement.regionKey,
      pixel: { x: settlement.x, y: settlement.y }
    };
    bindings.push({ name: settlement.name, hex: hex.code, distance: bindingDistance });
  }

  for (const hex of hexes) {
    if (hex.q < REBUILD_FROM_Q || hex.type !== "LAND" || hex.regionKey) continue;
    const nearest = settlementsInput.reduce((best, settlement) => {
      const value = Math.hypot(hex.center.pixelX - settlement.x, hex.center.pixelY - settlement.y);
      return !best || value < best.distance ? { settlement, distance: value } : best;
    }, null);
    hex.regionKey = nearest.settlement.regionKey;
    hex.province = nearest.settlement.name;
    hex.terrain = terrainForSettlement(nearest.settlement.name);
  }

  // Tiny enclosed blue pockets in the political artwork are lakes/rivers rather
  // than navigable sea routes. Do not expose a playable one-cell naval trap.
  const sampledByAxial = new Map(hexes.map(hex => [`${hex.q},${hex.r}`, hex]));
  for (const hex of hexes) {
    if (hex.q < REBUILD_FROM_Q || hex.type !== "SEA") continue;
    const hasSeaNeighbor = DIRECTIONS.some(([dq, dr]) =>
      sampledByAxial.get(`${hex.q + dq},${hex.r + dr}`)?.type === "SEA"
    );
    if (!hasSeaNeighbor) {
      hex.type = "IMPASSABLE";
      hex.playable = false;
      hex.moveCost = null;
    }
  }
  const byAxial = new Map(hexes.map(hex => [`${hex.q},${hex.r}`, hex]));
  for (const hex of hexes) {
    if (!hex.playable) {
      hex.neighbors = [];
      continue;
    }
    hex.neighbors = DIRECTIONS
      .map(([dq, dr]) => byAxial.get(`${hex.q + dq},${hex.r + dr}`))
      .filter(neighbor => neighbor?.playable)
      .map(neighbor => neighbor.id);
  }

  for (const hex of hexes) {
    if (hex.q >= REBUILD_FROM_Q && hex.type === "LAND") {
      hex.coastal = hex.neighbors.some(id => byId.get(id)?.type === "SEA");
    }
  }

  const map = {
    ...oldMap,
    mapVersion: "r56-india-v6",
    generatedAt: new Date().toISOString(),
    grid: { ...oldMap.grid, columns: COLUMNS, rows: ROWS, width: WIDTH, height: HEIGHT },
    sources: {
      ...oldMap.sources,
      image: "maps/r56-india-v6/source/india-political-updated.png",
      note: "Himalaya hücreleri geçilemez ve görsel grid katmanında gizlidir."
    },
    settlements,
    hexes
  };

  const mapPath = path.join(OUTPUT, "hex-map-r56-india-v6.json");
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
  const hexPath = path.join(OUTPUT, "NEWHEXMAP-INDIA-v6.png");
  const maskedGrid = await gridWithoutHimalaya(hexes, source);
  await sharp(SOURCE).composite([{ input: maskedGrid }]).png().toFile(hexPath);
  await sharp(hexPath).resize({ width: 1600 }).jpeg({ quality: 92 }).toFile(path.join(OUTPUT, "hex-preview.jpg"));

  const report = {
    sourceSha256: actualHash,
    dimensions: [WIDTH, HEIGHT],
    mapVersion: map.mapVersion,
    hexCount: hexes.length,
    landHexes: hexes.filter(hex => hex.type === "LAND").length,
    seaHexes: hexes.filter(hex => hex.type === "SEA").length,
    impassableHexes: hexes.filter(hex => hex.type === "IMPASSABLE").length,
    himalayaPixelsMasked: true,
    hiddenHimalayaHexes: hexes.filter(hex => hex.himalaya).map(hex => hex.code),
    settlements: bindings
  };
  fs.writeFileSync(path.join(OUTPUT, "india-v6-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
