const fs = require("node:fs");
const path = require("node:path");
const ROOT = __dirname;
const oldMap = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "..", "assets", "hex-map-r56.json"), "utf8"));
const map = JSON.parse(fs.readFileSync(path.join(ROOT, "output", "hex-map-r56-india-v4.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(ROOT, "output", "india-v4-report.json"), "utf8"));

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
assert(report.source.sha256 === "AB050D93128E40BD24F59D1B9B765917F9F0FBA7875381ED03A070503A6DD2E6", "Yanlış toprak.png kullanıldı.");
assert(map.grid.width === 5376 && map.grid.height === 3328, "Çıktı ölçüsü yanlış.");
assert(map.grid.columns === 64 && map.grid.rows === 36, "R56 grid boyutu yanlış.");
assert(map.hexes.length === 64 * 36, "Hex sayısı 2304 değil.");
assert(report.countries === 9 && report.regions === 13 && report.settlements.length === 13, "9 ülke / 13 bölge dağılımı bozuk.");

const ids = new Set(map.hexes.map(h => h.id));
const codes = new Set(map.hexes.map(h => h.code));
assert(ids.size === map.hexes.length, "Tekrarlanan Hex id var.");
assert(codes.size === map.hexes.length, "Tekrarlanan Hex kodu var.");

const oldStable = oldMap.hexes.filter(h => h.q <= 48);
for (const original of oldStable) {
  const current = map.hexes.find(h => h.id === original.id);
  assert(Boolean(current), `Eski Hex eksik: ${original.id}`);
  if (!current) continue;
  const copy = value => JSON.parse(JSON.stringify(value));
  const a = copy(original); const b = copy(current);
  a.neighbors = []; b.neighbors = [];
  assert(JSON.stringify(a) === JSON.stringify(b), `Eski Hex değişti: ${original.id}`);
}

for (const settlement of report.settlements) {
  const bound = map.settlements[settlement.name];
  assert(Boolean(bound), `Yerleşke indeksi yok: ${settlement.name}`);
  const hex = bound && map.hexes.find(h => h.id === bound.hexId);
  assert(hex?.type === "LAND", `Yerleşke kara Hex'inde değil: ${settlement.name}`);
}

const taksila = map.settlements["Takşila"];
const start = taksila && map.hexes.find(h => h.id === taksila.hexId);
const byId = new Map(map.hexes.map(h => [h.id, h]));
let connected = false;
if (start) {
  const queue = [start]; const seen = new Set([start.id]);
  while (queue.length) {
    const hex = queue.shift();
    if (hex.q <= 48 && hex.type === "LAND") { connected = true; break; }
    for (const id of hex.neighbors) {
      const next = byId.get(id);
      if (next?.type === "LAND" && !seen.has(id)) { seen.add(id); queue.push(next); }
    }
  }
}
assert(connected, "Takşila yeni kara ağı üzerinden ana haritaya bağlı değil.");

for (const name of ["amrp-toprak-india-v4.png", "NEWHEXMAP-INDIA-v4.png", "normal-preview.jpg", "hex-preview.jpg"]) {
  assert(fs.existsSync(path.join(ROOT, "output", name)), `Çıktı yok: ${name}`);
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`Doğrulama başarılı: ${map.hexes.length} Hex, ${report.countries} ülke, ${report.regions} bölge, ${report.settlements.length} yerleşke.`);
