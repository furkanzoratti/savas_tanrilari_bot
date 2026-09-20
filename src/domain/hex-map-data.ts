import { hexColumnName, parseHexCoordinate, type MapDomain, type MapTerrain } from "./movement.js";

export interface R56Settlement {
  name: string;
  regionKey: string;
  bindingDistance: number;
}

export interface R56Hex {
  id: string;
  code: string;
  q: number;
  r: number;
  column: number;
  row: number;
  center: { pixelX: number; pixelY: number };
  type: "LAND" | "SEA" | "IMPASSABLE";
  playable: boolean;
  terrain: string | null;
  regionKey: string | null;
  coastal: boolean;
  neighbors: string[];
  settlements: R56Settlement[];
  regionAssignment?: { method: string; topVotes: number; secondVotes: number; needsReview: boolean };
}

export interface R56Map {
  schemaVersion: number;
  mapVersion: string;
  grid: { orientation: string; radius: number; width: number; height: number };
  settlements: Record<string, { hexId: string; hexCode: string; regionKey: string; pixel: { x: number; y: number } }>;
  hexes: R56Hex[];
}

export interface BotSettlement {
  id: string;
  name: string;
  countryId: string;
}

export interface PreparedMapHex {
  coordinate: string;
  domain: MapDomain;
  terrain: MapTerrain;
  pixelX: number;
  pixelY: number;
  regionKey: string | null;
  ownerCountryId: string | null;
  passable: boolean;
  metadata: Record<string, unknown>;
}

const TERRAIN: Readonly<Record<string, MapTerrain>> = {
  "Düz Ova": "OPEN_PLAIN",
  "Bozkır": "STEPPE",
  "Dağlık": "MOUNTAIN",
  "Ormanlık": "FOREST",
  "Çöl": "FLAT_DESERT",
  "Bataklık": "MARSH"
};

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9çğıöşü]+/gi, "");
}

export function validateR56Map(map: R56Map): { land: number; sea: number; void: number; settlements: number; ambiguousRegions: string[] } {
  if (map.schemaVersion !== 1 || map.grid.radius !== 56 || map.grid.orientation !== "flat-top") {
    throw new Error("Beklenen R56 harita şeması veya grid yönü bulunamadı.");
  }
  const ids = new Map<string, R56Hex>();
  const codes = new Set<string>();
  const regions = new Set<string>();
  for (const hex of map.hexes) {
    if (ids.has(hex.id) || codes.has(hex.code)) throw new Error(`Tekrarlanan Hex kimliği veya koordinatı: ${hex.code}`);
    if (!["LAND", "SEA", "IMPASSABLE"].includes(hex.type)) throw new Error(`Bilinmeyen Hex türü: ${hex.code}`);
    if (hex.playable !== (hex.type !== "IMPASSABLE")) throw new Error(`Geçilebilirlik ve Hex türü çelişiyor: ${hex.code}`);
    const code = parseHexCoordinate(hex.code);
    if (code.column !== hex.column || code.row !== hex.row + 1 || hex.code !== `${hexColumnName(hex.column)}${String(hex.row + 1).padStart(2, "0")}`) {
      throw new Error(`Hex koordinatı grid ile uyuşmuyor: ${hex.code}`);
    }
    if (hex.q !== hex.column || hex.r !== hex.row - Math.floor((hex.column - (hex.column & 1)) / 2)
      || hex.id !== `R56-Q${hex.q}-R${hex.r}`) {
      throw new Error(`Kalıcı Hex kimliği veya axial koordinatı tutarsız: ${hex.code}`);
    }
    if (hex.playable && (hex.center.pixelX < 0 || hex.center.pixelX >= map.grid.width
      || hex.center.pixelY < 0 || hex.center.pixelY >= map.grid.height)) {
      throw new Error(`Görsel dışındaki Hex geçilebilir olamaz: ${hex.code}`);
    }
    if (hex.type === "LAND" && (!hex.regionKey || !hex.terrain || !TERRAIN[hex.terrain])) {
      throw new Error(`Kara Hex'inin bölgesi veya arazisi eksik: ${hex.code}`);
    }
    if (hex.type === "SEA" && hex.terrain && hex.terrain !== "SEA") throw new Error(`Deniz Hex'inin arazisi çelişiyor: ${hex.code}`);
    if (hex.neighbors.length > 6 || new Set(hex.neighbors).size !== hex.neighbors.length) throw new Error(`Komşu listesi geçersiz: ${hex.code}`);
    ids.set(hex.id, hex);
    codes.add(hex.code);
  }
  for (const hex of map.hexes) {
    for (const neighborId of hex.neighbors) {
      const neighbor = ids.get(neighborId);
      if (!neighbor || !neighbor.playable || !hex.playable || !neighbor.neighbors.includes(hex.id)) {
        throw new Error(`Tek yönlü veya geçilemez komşuluk: ${hex.code} → ${neighborId}`);
      }
      const dq = Math.abs(hex.q - neighbor.q);
      const dr = Math.abs(hex.r - neighbor.r);
      if (dq > 1 || dr > 1 || Math.abs(hex.q + hex.r - neighbor.q - neighbor.r) > 1) {
        throw new Error(`Bitişik olmayan Hex komşuluğu: ${hex.code} → ${neighbor.code}`);
      }
    }
  }
  let settlementCount = 0;
  for (const hex of map.hexes) {
    if (hex.settlements.length > 1) throw new Error(`Bir Hex'e birden fazla yerleşke bağlanmış: ${hex.code}`);
    for (const settlement of hex.settlements) {
      settlementCount += 1;
      const indexed = map.settlements[settlement.name];
      if (hex.type !== "LAND" || indexed?.hexId !== hex.id || indexed.hexCode !== hex.code || indexed.regionKey !== hex.regionKey) {
        throw new Error(`Yerleşke-Hex eşleşmesi tutarsız: ${settlement.name}`);
      }
      if (Math.hypot(indexed.pixel.x - hex.center.pixelX, indexed.pixel.y - hex.center.pixelY) > map.grid.radius
        || settlement.bindingDistance > map.grid.radius) {
        throw new Error(`Yerleşke kendi Hex'inin dışında: ${settlement.name}`);
      }
      if (regions.has(settlement.regionKey)) throw new Error(`Bir bölgeye birden fazla yerleşke bağlanmış: ${settlement.regionKey}`);
      regions.add(settlement.regionKey);
    }
  }
  if (settlementCount !== Object.keys(map.settlements).length) throw new Error("Yerleşke dizini ile Hex eşleşmeleri farklı sayıda.");
  for (const hex of map.hexes) {
    if (hex.type === "LAND" && !regions.has(hex.regionKey!)) throw new Error(`Sahibi türetilemeyen bölge: ${hex.code}`);
  }
  return {
    land: map.hexes.filter((hex) => hex.type === "LAND").length,
    sea: map.hexes.filter((hex) => hex.type === "SEA").length,
    void: map.hexes.filter((hex) => hex.type === "IMPASSABLE").length,
    settlements: settlementCount,
    ambiguousRegions: map.hexes.filter((hex) => hex.regionAssignment?.needsReview).map((hex) => hex.code)
  };
}

export function prepareR56Map(map: R56Map, botSettlements: readonly BotSettlement[], aliases: Readonly<Record<string, string>> = {}): {
  hexes: PreparedMapHex[];
  settlementPositions: Array<{ settlementId: string; coordinate: string }>;
  ambiguousRegions: string[];
} {
  const audit = validateR56Map(map);
  const canonical = new Map(Object.entries(aliases).map(([alias, name]) => [normalizeName(alias), name]));
  const available = new Map<string, BotSettlement>();
  for (const settlement of botSettlements) {
    const key = normalizeName(canonical.get(normalizeName(settlement.name)) ?? settlement.name);
    if (available.has(key)) throw new Error(`Botta birden fazla aynı adlı yerleşke var: ${settlement.name}`);
    available.set(key, settlement);
  }
  const regionOwners = new Map<string, string>();
  const settlementPositions: Array<{ settlementId: string; coordinate: string }> = [];
  const unmatched: string[] = [];
  for (const [name, position] of Object.entries(map.settlements)) {
    const settlement = available.get(normalizeName(name));
    if (!settlement) {
      unmatched.push(name);
      continue;
    }
    regionOwners.set(position.regionKey, settlement.countryId);
    settlementPositions.push({ settlementId: settlement.id, coordinate: position.hexCode });
    available.delete(normalizeName(name));
  }
  if (unmatched.length || available.size) {
    throw new Error(`Yerleşke eşleşmesi tamamlanmadı. Haritada eksik bot kayıtları: ${unmatched.join(", ") || "yok"}; harita dışı bot kayıtları: ${[...available.values()].map((item) => item.name).join(", ") || "yok"}.`);
  }
  const hexes = map.hexes.map((hex): PreparedMapHex => ({
    coordinate: hex.code,
    domain: hex.type === "IMPASSABLE" ? "VOID" : hex.type,
    terrain: hex.type === "LAND" ? TERRAIN[hex.terrain!]! : hex.type === "SEA" ? "SEA" : "IMPASSABLE",
    pixelX: hex.center.pixelX,
    pixelY: hex.center.pixelY,
    regionKey: hex.regionKey,
    ownerCountryId: hex.type === "LAND" ? regionOwners.get(hex.regionKey!) ?? null : null,
    passable: hex.playable,
    metadata: { hexUid: hex.id, mapVersion: map.mapVersion, coastal: hex.coastal, regionAssignment: hex.regionAssignment ?? null }
  }));
  return { hexes, settlementPositions, ambiguousRegions: audit.ambiguousRegions };
}
