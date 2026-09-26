const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, "output");
const map = JSON.parse(fs.readFileSync(path.join(OUTPUT, "hex-map-r56-india-v6.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(OUTPUT, "india-v6-report.json"), "utf8"));
const REBUILD_FROM_Q = 48;
const oldMap = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "r56-india-v5", "output", "hex-map-r56-india-vector-v5.json"), "utf8"));
const failures = [];
const ok = (value, message) => { if (!value) failures.push(message); };

ok(report.sourceSha256 === "5D3B254CB19915671F55017C7FDAF9D42DA5BF3D786C95C6D85A60848A71EA93", "Güncel siyasi harita kullanılmamış.");
ok(report.dimensions[0] === 5376 && report.dimensions[1] === 3328, "Çıktı ölçüsü bozuk.");
ok(map.hexes.length === 64 * 36, "Hex sayısı 2304 değil.");
ok(new Set(map.hexes.map(hex => hex.id)).size === map.hexes.length, "Tekrarlanan Hex id var.");
ok(new Set(map.hexes.map(hex => hex.code)).size === map.hexes.length, "Tekrarlanan Hex kodu var.");
ok(report.hiddenHimalayaHexes.length > 0, "Himalaya hücreleri tespit edilmedi.");
ok(report.himalayaPixelsMasked === true, "Himalaya görsel maskesi uygulanmadı.");

const byId = new Map(map.hexes.map(hex => [hex.id, hex]));
for (const hex of map.hexes) {
  if (hex.type === "LAND") {
    ok(Boolean(hex.regionKey), `${hex.code} kara bölgesi eksik.`);
    ok(["Düz Ova", "Dağlık", "Ormanlık", "Çöl", "Bataklık", "Bozkır"].includes(hex.terrain), `${hex.code} arazi türü eksik.`);
  }
  if (!hex.playable) ok(hex.neighbors.length === 0, `${hex.code} geçilemezken komşuluk taşıyor.`);
  for (const neighborId of hex.neighbors) {
    const neighbor = byId.get(neighborId);
    ok(Boolean(neighbor?.playable && neighbor.neighbors.includes(hex.id)), `${hex.code} komşuluğu çift yönlü/geçilebilir değil.`);
  }
}

for (const code of report.hiddenHimalayaHexes) {
  const hex = map.hexes.find(item => item.code === code);
  ok(hex?.type === "IMPASSABLE" && hex?.playable === false && hex?.moveCost === null, `${code} geçilemez değil.`);
}

for (const original of oldMap.hexes.filter(hex => hex.q < REBUILD_FROM_Q)) {
  const current = map.hexes.find(hex => hex.id === original.id);
  ok(Boolean(current), `Korunan Hex eksik: ${original.id}`);
  if (!current) continue;
  const a = { ...original, neighbors: [] };
  const b = { ...current, neighbors: [] };
  delete b.himalaya;
  ok(JSON.stringify(a) === JSON.stringify(b), `Korunan Hex değişti: ${original.id}`);
}

for (const settlement of report.settlements) {
  const binding = map.settlements[settlement.name];
  const hex = binding && map.hexes.find(item => item.id === binding.hexId);
  ok(hex?.type === "LAND", `${settlement.name} kara Hex'ine bağlı değil.`);
  ok(settlement.distance <= 56, `${settlement.name} kendi R56 hücresinin dışında: ${settlement.distance}`);
  ok(Boolean(binding?.regionKey && binding.regionKey === hex?.regionKey), `${settlement.name} bölge eşleşmesi bozuk.`);
}

for (const file of ["NEWHEXMAP-INDIA-v6.png", "hex-map-r56-india-v6.json", "india-v6-report.json", "hex-preview.jpg"]) {
  ok(fs.existsSync(path.join(OUTPUT, file)), `Çıktı yok: ${file}`);
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join("\n"));
  process.exit(1);
}

console.log(`R56 Hindistan v6 doğrulandı: ${map.hexes.length} Hex, ${report.hiddenHimalayaHexes.length} gridsiz/geçilemez Himalaya hücresi, ${report.settlements.length} yerleşke.`);
