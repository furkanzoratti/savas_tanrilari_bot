const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const map = JSON.parse(fs.readFileSync(path.join(root, "output", "hex-map-r56-india-v3.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(root, "output", "india-v3-report.json"), "utf8"));
const legacy = JSON.parse(fs.readFileSync(path.join(root, "..", "..", "assets", "hex-map-r56.json"), "utf8"));
const expectedCountries = {
  "Maurya İmparatorluğu": 3,
  Kalinga: 2,
  Satavahanalar: 2,
  Yaudheya: 1,
  Kuninda: 1,
  Kamarupa: 1,
  "Çola": 1,
  Pandya: 1,
  "Çera": 1
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(map.mapVersion === "amrp-r56-india-v3", "Beklenmeyen harita sürümü.");
assert(map.hexes.length === 2304, "64x36 grid 2.304 Hex üretmelidir.");
assert(new Set(map.hexes.map((hex) => hex.id)).size === map.hexes.length, "Hex kimlikleri tekil değil.");
assert(new Set(map.hexes.map((hex) => hex.code)).size === map.hexes.length, "Hex kodları tekil değil.");
assert(JSON.stringify(report.countries) === JSON.stringify(expectedCountries), "9 devlet / 13 bölge dağılımı bozuldu.");

for (const oldHex of legacy.hexes.filter((hex) => hex.column < 49)) {
  const current = map.hexes.find((hex) => hex.id === oldHex.id);
  assert(current, "Eski Hex kayboldu: " + oldHex.id);
  assert(current.code === oldHex.code, "Eski Hex kodu değişti: " + oldHex.id);
  assert(current.q === oldHex.q && current.r === oldHex.r, "Eski Hex koordinatı değişti: " + oldHex.id);
}

const indiaSettlements = Object.entries(map.settlements).filter(([, value]) => value.regionKey.startsWith("india_"));
assert(indiaSettlements.length === 13, "13 yeni Hint yerleşkesi bulunmalıdır.");
assert(new Set(indiaSettlements.map(([, value]) => value.hexId)).size === 13, "Yeni yerleşkeler tekil Hex'lere bağlanmalıdır.");

const byId = new Map(map.hexes.map((hex) => [hex.id, hex]));
for (const hex of map.hexes) {
  for (const neighborId of hex.neighbors) {
    const neighbor = byId.get(neighborId);
    assert(neighbor, "Eksik komşu: " + hex.id + " -> " + neighborId);
    assert(neighbor.neighbors.includes(hex.id), "Asimetrik komşuluk: " + hex.id + " -> " + neighborId);
  }
}

const start = byId.get(map.settlements["Takşila"].hexId);
const legacyLandIds = new Set(legacy.hexes.filter((hex) => hex.type === "LAND").map((hex) => hex.id));
const queue = [start.id];
const seen = new Set(queue);
let reachesLegacyLand = false;
while (queue.length) {
  const current = byId.get(queue.shift());
  if (legacyLandIds.has(current.id)) reachesLegacyLand = true;
  for (const neighborId of current.neighbors) {
    const neighbor = byId.get(neighborId);
    if (neighbor && neighbor.type === "LAND" && !seen.has(neighborId)) {
      seen.add(neighborId);
      queue.push(neighborId);
    }
  }
}
assert(reachesLegacyLand, "Takşila kara rotası eski Baktriya/Gedrosya kara ağına bağlanmıyor.");

console.log(JSON.stringify({
  ok: true,
  mapVersion: map.mapVersion,
  hexes: map.hexes.length,
  preservedLegacyHexes: legacy.hexes.filter((hex) => hex.column < 49).length,
  newCountries: Object.keys(expectedCountries).length,
  newSettlements: indiaSettlements.length,
  takshilaConnectedToLegacyLand: reachesLegacyLand
}, null, 2));
