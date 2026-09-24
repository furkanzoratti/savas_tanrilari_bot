const fs = require("node:fs");
const path = require("node:path");
const ROOT = __dirname;
const out = path.join(ROOT, "output");
const report = JSON.parse(fs.readFileSync(path.join(out, "india-vector-v5-report.json"), "utf8"));
const map = JSON.parse(fs.readFileSync(path.join(out, "hex-map-r56-india-vector-v5.json"), "utf8"));
const oldMap = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "..", "assets", "hex-map-r56.json"), "utf8"));
const failures = [];
const ok = (value, message) => { if (!value) failures.push(message); };

ok(report.sourceSha256 === "AB050D93128E40BD24F59D1B9B765917F9F0FBA7875381ED03A070503A6DD2E6", "Son gönderilen toprak.png kullanılmamış.");
ok(report.dimensions[0] >= 4096 && report.dimensions[1] === 3328, "4K çalışma ölçüsü sağlanmıyor.");
ok(report.rasterLineAntialiasing === false, "Çizgi kenar yumuşatma kapalı değil.");
ok(report.countries === 9 && report.regions === 13 && report.settlements.length === 13, "9 ülke / 13 bölge bozuldu.");
ok(map.hexes.length === 64 * 36, "Hex sayısı beklenen 2304 değil.");
ok(new Set(map.hexes.map(h => h.id)).size === map.hexes.length, "Tekrarlanan Hex id var.");
ok(new Set(map.hexes.map(h => h.code)).size === map.hexes.length, "Tekrarlanan Hex kodu var.");

for (const original of oldMap.hexes.filter(h => h.q <= 48)) {
  const current = map.hexes.find(h => h.id === original.id);
  ok(Boolean(current), `Eski Hex eksik: ${original.id}`);
  if (!current) continue;
  const a = JSON.parse(JSON.stringify(original)); const b = JSON.parse(JSON.stringify(current));
  a.neighbors = []; b.neighbors = [];
  ok(JSON.stringify(a) === JSON.stringify(b), `Eski Hex değişti: ${original.id}`);
}

for (const settlement of report.settlements) {
  const binding = map.settlements[settlement.name];
  const hex = binding && map.hexes.find(h => h.id === binding.hexId);
  ok(hex?.type === "LAND", `${settlement.name} kara Hex'ine bağlı değil.`);
}

for (const file of ["amrp-toprak-india-vector-v5.png", "NEWHEXMAP-INDIA-VECTOR-v5.png", "india-extension-overlay-v5.svg", "india-regions-v5.geojson"]) {
  ok(fs.existsSync(path.join(out, file)), `Çıktı yok: ${file}`);
}

if (failures.length) { console.error(failures.map(x => `- ${x}`).join("\n")); process.exit(1); }
console.log(`Vektör doğrulama başarılı: ${map.hexes.length} Hex, 9 ülke, 13 bölge, 13 yerleşke; çizgi AA kapalı.`);
