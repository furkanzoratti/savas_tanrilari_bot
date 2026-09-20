const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const map = JSON.parse(fs.readFileSync(path.join(root, "assets", "hex-map-r56.json"), "utf8"));
const byId = new Map(map.hexes.map((hex) => [hex.id, hex]));

function components(type) {
  const seen = new Set();
  const result = [];
  for (const hex of map.hexes.filter((item) => item.type === type)) {
    if (seen.has(hex.id)) continue;
    const stack = [hex.id];
    const group = [];
    seen.add(hex.id);
    while (stack.length) {
      const current = byId.get(stack.pop());
      group.push(current);
      for (const neighborId of current.neighbors) {
        const neighbor = byId.get(neighborId);
        if (neighbor?.type !== type || seen.has(neighborId)) continue;
        seen.add(neighborId);
        stack.push(neighborId);
      }
    }
    result.push(group);
  }
  return result.sort((a, b) => b.length - a.length).map((group, index) => ({
    component: index + 1,
    hexes: group.length,
    bounds: {
      minX: Math.min(...group.map((item) => item.center.pixelX)),
      maxX: Math.max(...group.map((item) => item.center.pixelX)),
      minY: Math.min(...group.map((item) => item.center.pixelY)),
      maxY: Math.max(...group.map((item) => item.center.pixelY))
    },
    codes: group.length <= 5 ? group.map((item) => item.code).sort() : [],
    settlements: group.flatMap((item) => item.settlements.map((settlement) => settlement.name))
  }));
}

const land = components("LAND");
const sea = components("SEA");
const report = {
  mapVersion: map.mapVersion,
  landComponents: land,
  seaComponents: sea,
  isolatedSeaHexes: sea.filter((item) => item.hexes === 1).flatMap((item) => item.codes),
  note: "Ayrık su bileşenleri otomatik bağlanmaz. Cebelitarık, Türk boğazları, Adriyatik ve küçük körfezler için geçiş politikası ayrıca doğrulanmalıdır."
};
fs.writeFileSync(path.join(__dirname, "route-topology-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ mapVersion: report.mapVersion, landComponents: land.map((item) => item.hexes), seaComponents: sea.map((item) => item.hexes), isolatedSeaHexes: report.isolatedSeaHexes }, null, 2));
