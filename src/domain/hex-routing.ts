import { adjacentHexes, formatHexCoordinate, parseHexCoordinate, type FormationKind, type MapDomain } from "./movement.js";

export interface RoutingHex {
  coordinate: string;
  domain: MapDomain;
  terrain: string;
  passable: boolean;
}

export interface RoutingEdge {
  from: string;
  to: string;
  cost: number;
  armyAllowed: boolean;
  fleetAllowed: boolean;
  bidirectional: boolean;
}

export interface PlannedRoute {
  coordinates: string[];
  costs: number[];
  totalCost: number;
}

export function planHexRoute(input: {
  hexes: readonly RoutingHex[];
  edges?: readonly RoutingEdge[];
  start: string;
  destination: string;
  formationKind: FormationKind;
  terrainCosts: Readonly<Record<string, number | null>>;
}): PlannedRoute | null {
  const start = formatHexCoordinate(parseHexCoordinate(input.start));
  const destination = formatHexCoordinate(parseHexCoordinate(input.destination));
  const hexes = new Map(input.hexes.map((hex) => [formatHexCoordinate(parseHexCoordinate(hex.coordinate)), hex]));
  const domain = input.formationKind === "ARMY" ? "LAND" : "SEA";
  const usable = (coordinate: string): boolean => {
    const hex = hexes.get(coordinate);
    return Boolean(hex?.passable && hex.domain === domain && input.terrainCosts[hex.terrain] != null);
  };
  if (!usable(start) || !usable(destination)) return null;
  if (start === destination) return { coordinates: [start], costs: [], totalCost: 0 };

  const overrides = new Map<string, RoutingEdge>();
  for (const edge of input.edges ?? []) {
    const from = formatHexCoordinate(parseHexCoordinate(edge.from));
    const to = formatHexCoordinate(parseHexCoordinate(edge.to));
    overrides.set(`${from}:${to}`, edge);
    if (edge.bidirectional && !overrides.has(`${to}:${from}`)) overrides.set(`${to}:${from}`, edge);
  }
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, { coordinate: string; cost: number }>();
  const frontier = new Set<string>([start]);
  const visited = new Set<string>();
  while (frontier.size) {
    let current: string | null = null;
    for (const candidate of frontier) {
      if (current === null || (distances.get(candidate) ?? Infinity) < (distances.get(current) ?? Infinity)
        || ((distances.get(candidate) ?? Infinity) === (distances.get(current) ?? Infinity) && candidate < current)) current = candidate;
    }
    if (current === null) break;
    frontier.delete(current);
    if (current === destination) break;
    visited.add(current);
    const natural = adjacentHexes(parseHexCoordinate(current))
      .filter((coordinate) => coordinate.column >= 0 && coordinate.row >= 0)
      .map(formatHexCoordinate);
    const linked = [...overrides.keys()].filter((key) => key.startsWith(`${current}:`)).map((key) => key.slice(current!.length + 1));
    for (const next of new Set([...natural, ...linked])) {
      if (visited.has(next) || !usable(next)) continue;
      const override = overrides.get(`${current}:${next}`);
      if (override && !(input.formationKind === "ARMY" ? override.armyAllowed : override.fleetAllowed)) continue;
      const cost = override ? override.cost : input.terrainCosts[hexes.get(next)!.terrain];
      if (cost == null || !Number.isFinite(cost) || cost <= 0) continue;
      const candidate = distances.get(current)! + cost;
      if (candidate >= (distances.get(next) ?? Infinity)) continue;
      distances.set(next, candidate);
      previous.set(next, { coordinate: current, cost });
      frontier.add(next);
    }
  }
  if (!previous.has(destination)) return null;
  const coordinates = [destination];
  const costs: number[] = [];
  while (coordinates[0] !== start) {
    const step = previous.get(coordinates[0]!);
    if (!step) return null;
    costs.unshift(step.cost);
    coordinates.unshift(step.coordinate);
  }
  return { coordinates, costs, totalCost: distances.get(destination)! };
}
