from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image


BASE_WIDTH = 8000
BASE_P = 51.98381086
BASE_H = 59.92745614
BASE_OX = -1.00398494
BASE_OY = 4.32701
LEGACY_SCALE_X = 1.375
LEGACY_SCALE_Y = 1.375
LEGACY_TRANSLATE_X = 0
LEGACY_TRANSLATE_Y = 20
LEGACY_PIXEL_SCALE_X = 1.4
LEGACY_PIXEL_SCALE_Y = 1.3333333333
LEGACY_PIXEL_TRANSLATE_X = -50
LEGACY_PIXEL_TRANSLATE_Y = 2000
SETTLEMENT_MARKER_RADIUS = 18

# These settlements were added after the legacy R56 catalog was generated.
# Their coordinates are the centres of the white circular settlement pins in
# R56-POLITICAL-v8.png. Keeping the exceptional source points here lets the
# normal overlap-based hex assignment below treat them exactly like every
# legacy settlement.
STEPPE_MARKERS: dict[str, tuple[int, int]] = {
    "Uda Otlakları": (5227, 2576),
    "Baykal Kışlağı": (6054, 2627),
    "Angara Geçidi": (6749, 2764),
    "Barguzin Vadisi": (5982, 3136),
    "Sayan Yaylası": (7249, 2913),
    "Minusinsk Ortak Otlakları": (7852, 2775),
    "Yukarı Yenisey": (8053, 3147),
    "Buir Gölü": (8935, 2941),
    "Hulun Gölü": (9657, 2917),
    "Onon Geçidi": (10081, 3109),
    "Argun Otlakları": (10615, 3128),
    "Khentii Otlakları": (6376, 3579),
    "Tuul Kışlağı": (7097, 3563),
    "Xianbei Dağı Ordugâhı": (7797, 3557),
    "Hangay Yaylası": (8381, 3567),
    "Orhun Kavşağı": (7026, 3987),
    "Ongin Geçidi": (6214, 3976),
    "Longcheng Ordugâhı": (9670, 3595),
    "Kerulen Kışlağı": (10171, 3803),
    "Büyük Khingan": (9161, 3849),
    "Nen Nehri Pazarı": (9105, 3421),
}


def column_name(column: int) -> str:
    value = column + 1
    result = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        result = chr(65 + remainder) + result
    return result


def code(column: int, row: int) -> str:
    return f"{column_name(column)}{row + 1:02d}"


def neighbors(column: int, row: int, columns: int, rows: int) -> list[tuple[int, int]]:
    offsets = ((0, -1), (0, 1), (-1, 0), (-1, 1), (1, 0), (1, 1)) if column % 2 else ((0, -1), (0, 1), (-1, -1), (-1, 0), (1, -1), (1, 0))
    return [(column + dc, row + dr) for dc, dr in offsets if 0 <= column + dc < columns and 0 <= row + dr < rows]


def classify(image: np.ndarray, x: float, y: float, scale: float) -> tuple[str, str]:
    sample_offsets = ((0, -22), (0, 22), (-18, -14), (18, -14), (-18, 14), (18, 14), (-26, 0), (26, 0))
    sea = np.array((35, 107, 169), dtype=np.int16)
    gray = np.array((64, 64, 64), dtype=np.int16)
    votes: list[tuple[str, np.ndarray]] = []
    whites: list[np.ndarray] = []
    height, width = image.shape[:2]
    for dx, dy in sample_offsets:
        px = min(width - 1, max(0, round(x + dx * scale)))
        py = min(height - 1, max(0, round(y + dy * scale)))
        color = image[py, px, :3].astype(np.int16)
        if color.max() < 40:
            continue
        if color.min() > 225:
            whites.append(color)
            continue
        if np.max(np.abs(color - gray)) < 12 and abs(int(color[0]) - int(color[1])) < 6:
            votes.append(("IMPASSABLE", color))
        elif np.max(np.abs(color - sea)) < 30:
            votes.append(("SEA", color))
        else:
            votes.append(("LAND", color))
    if len(whites) >= 4 and len(whites) > len(votes):
        votes = [("LAND", color) for color in whites]
    if not votes:
        return "IMPASSABLE", "#404040"
    counts = {kind: sum(1 for vote, _ in votes if vote == kind) for kind in ("SEA", "LAND", "IMPASSABLE")}
    kind = max(counts, key=counts.get)
    colors = np.array([color for vote, color in votes if vote == kind])
    median = np.median(colors, axis=0).astype(int)
    return kind, f"#{median[0]:02x}{median[1]:02x}{median[2]:02x}"


def detect_settlement_markers(image: Image.Image) -> list[tuple[int, int]]:
    """Find the white-ringed settlement dots without matching outlined text."""
    resized = image.resize((image.width // 2, image.height // 2), Image.Resampling.LANCZOS)
    pixels = np.asarray(resized, dtype=np.int16)
    luminance = pixels.mean(axis=2)
    dark = luminance < 92
    light = luminance > 210
    height, width = dark.shape
    dark_score = np.zeros((height, width), dtype=np.uint8)
    light_score = np.zeros((height, width), dtype=np.uint8)
    angles = [index * math.tau / 20 for index in range(20)]

    def add_ring(source: np.ndarray, target: np.ndarray, radii: tuple[int, ...]) -> None:
        for radius in radii:
            for angle in angles:
                dx = int(round(math.cos(angle) * radius))
                dy = int(round(math.sin(angle) * radius))
                shifted = np.zeros_like(source)
                source_y = slice(max(0, -dy), min(height, height - dy))
                source_x = slice(max(0, -dx), min(width, width - dx))
                target_y = slice(max(0, dy), min(height, height + dy))
                target_x = slice(max(0, dx), min(width, width + dx))
                shifted[target_y, target_x] = source[source_y, source_x]
                target += shifted

    add_ring(dark, dark_score, (3, 4))
    add_ring(light, light_score, (7, 8))
    ys, xs = np.nonzero(light & (dark_score >= 27) & (light_score >= 28))
    points = sorted(zip(xs.tolist(), ys.tolist()), key=lambda point: (point[1], point[0]))
    clusters: list[list[tuple[int, int]]] = []
    for point in points:
        target = next((cluster for cluster in reversed(clusters[-80:])
                       if abs(point[0] - sum(x for x, _ in cluster) / len(cluster)) <= 8
                       and abs(point[1] - sum(y for _, y in cluster) / len(cluster)) <= 8), None)
        if target is None:
            clusters.append([point])
        else:
            target.append(point)
    return [(round(sum(x for x, _ in cluster) / len(cluster) * 2),
             round(sum(y for _, y in cluster) / len(cluster) * 2)) for cluster in clusters]


def point_inside_flat_hex(px: float, py: float, center_x: float, center_y: float, radius: float) -> bool:
    dx = abs(px - center_x)
    dy = abs(py - center_y)
    root_three = math.sqrt(3)
    return dx <= radius and dy <= root_three * radius / 2 and root_three * dx + dy <= root_three * radius


def marker_overlap_hex(marker_x: int, marker_y: int, radius: float,
                       by_position: dict[tuple[int, int], dict[str, object]],
                       origin_x: float, origin_y: float, horizontal_step: float,
                       vertical_step: float) -> dict[str, object] | None:
    """Select the hex containing the largest share of the circular marker."""
    estimate_column = round((marker_x - origin_x) / horizontal_step)
    candidates: list[dict[str, object]] = []
    for column in range(estimate_column - 2, estimate_column + 3):
        offset = vertical_step / 2 if column % 2 else 0
        estimate_row = round((marker_y - origin_y - offset) / vertical_step)
        for row in range(estimate_row - 2, estimate_row + 3):
            item = by_position.get((column, row))
            if item and item["type"] == "LAND":
                candidates.append(item)
    samples = [(dx, dy) for dx in range(-SETTLEMENT_MARKER_RADIUS, SETTLEMENT_MARKER_RADIUS + 1, 2)
               for dy in range(-SETTLEMENT_MARKER_RADIUS, SETTLEMENT_MARKER_RADIUS + 1, 2)
               if dx * dx + dy * dy <= SETTLEMENT_MARKER_RADIUS * SETTLEMENT_MARKER_RADIUS]
    ranked = []
    for item in candidates:
        center = item["center"]
        overlap = sum(1 for dx, dy in samples if point_inside_flat_hex(
            marker_x + dx, marker_y + dy, center["pixelX"], center["pixelY"], radius))
        distance = (center["pixelX"] - marker_x) ** 2 + (center["pixelY"] - marker_y) ** 2
        ranked.append((overlap, -distance, str(item["code"]), item))
    return max(ranked, default=(0, 0, "", None))[3]


def minimum_cost_assignment(costs: list[list[float]]) -> list[int]:
    """Return the globally cheapest unique column for every row.

    Nearest-neighbour assignment is order-dependent: one slightly ambiguous
    settlement pin can consume the next settlement's marker and shift every
    following name.  The Hungarian algorithm matches the complete map at once,
    so the total displacement is minimised and each detected pin is used once.
    """
    row_count = len(costs)
    column_count = len(costs[0]) if costs else 0
    if row_count > column_count:
        raise ValueError("Not enough detected settlement markers")
    u = [0.0] * (row_count + 1)
    v = [0.0] * (column_count + 1)
    p = [0] * (column_count + 1)
    way = [0] * (column_count + 1)
    for row in range(1, row_count + 1):
        p[0] = row
        column0 = 0
        minimums = [math.inf] * (column_count + 1)
        used = [False] * (column_count + 1)
        while True:
            used[column0] = True
            row0 = p[column0]
            delta = math.inf
            column1 = 0
            for column in range(1, column_count + 1):
                if used[column]:
                    continue
                current = costs[row0 - 1][column - 1] - u[row0] - v[column]
                if current < minimums[column]:
                    minimums[column] = current
                    way[column] = column0
                if minimums[column] < delta:
                    delta = minimums[column]
                    column1 = column
            for column in range(column_count + 1):
                if used[column]:
                    u[p[column]] += delta
                    v[column] -= delta
                else:
                    minimums[column] -= delta
            column0 = column1
            if p[column0] == 0:
                break
        while True:
            column1 = way[column0]
            p[column0] = p[column1]
            column0 = column1
            if column0 == 0:
                break
    assignment = [-1] * row_count
    for column in range(1, column_count + 1):
        if p[column]:
            assignment[p[column] - 1] = column - 1
    return assignment


def confidence_first_assignment(costs: list[list[float]]) -> list[int]:
    """Assign obvious local matches before resolving ambiguous old anchors.

    A handful of legacy anchors are stale. A forced global optimum can move a
    whole chain of otherwise obvious city pins to make those outliers cheaper.
    Here the row with the greatest penalty for losing its nearest marker is
    locked first; uncertain/outdated anchors consume only what remains.
    """
    remaining_rows = set(range(len(costs)))
    remaining_columns = set(range(len(costs[0]) if costs else 0))
    assignment = [-1] * len(costs)
    while remaining_rows:
        choice: tuple[float, float, int, int] | None = None
        for row in remaining_rows:
            ranked = sorted((costs[row][column], column) for column in remaining_columns)
            best_cost, best_column = ranked[0]
            second_cost = ranked[1][0] if len(ranked) > 1 else math.inf
            regret = second_cost - best_cost
            candidate = (regret, -best_cost, -row, best_column)
            if choice is None or candidate > choice:
                choice = candidate
        if choice is None:
            raise RuntimeError("Settlement marker assignment could not be completed")
        row = -choice[2]
        column = choice[3]
        assignment[row] = column
        remaining_rows.remove(row)
        remaining_columns.remove(column)
    return assignment


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: generate-expanded-movement-map.py SOURCE_PNG LEGACY_JSON OUTPUT_JSON")
    source_path, legacy_path, output_path = map(Path, sys.argv[1:])
    source_image = Image.open(source_path).convert("RGB")
    image = source_image
    pixels = np.asarray(image)
    width, height = image.size
    scale = width / BASE_WIDTH
    horizontal_step = BASE_P * scale
    vertical_step = BASE_H * scale
    origin_x = BASE_OX * scale
    origin_y = BASE_OY * scale
    radius = horizontal_step * 2 / 3
    columns = math.floor((width - origin_x) / horizontal_step) + 1
    rows = math.floor((height - origin_y) / vertical_step) + 1
    legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
    legacy_by_position = {(item["column"], item["row"]): item for item in legacy["hexes"]}

    hexes: list[dict[str, object]] = []
    by_position: dict[tuple[int, int], dict[str, object]] = {}
    for column in range(columns):
        for row in range(rows):
            center_x = origin_x + column * horizontal_step
            center_y = origin_y + row * vertical_step + (vertical_step / 2 if column % 2 else 0)
            detected_kind, base_color = classify(pixels, center_x, center_y, horizontal_step / 52)
            legacy_column = round((column - LEGACY_TRANSLATE_X) / LEGACY_SCALE_X)
            legacy_row = round((row - LEGACY_TRANSLATE_Y) / LEGACY_SCALE_Y)
            inherited = legacy_by_position.get((legacy_column, legacy_row), {}) if legacy_row >= 0 else {}
            # Preserve known legacy land/sea topology, but let the political
            # image activate areas that the old catalog labelled IMPASSABLE.
            inherited_kind = inherited.get("type")
            kind = inherited_kind if inherited_kind in ("LAND", "SEA") else detected_kind
            item: dict[str, object] = {
                "id": f"R56X-Q{column}-R{row}",
                "code": code(column, row),
                "column": column,
                "row": row,
                "center": {"pixelX": round(center_x, 3), "pixelY": round(center_y, 3)},
                "type": kind,
                "playable": kind != "IMPASSABLE",
                "coastal": False,
                "terrain": inherited.get("terrain"),
                "moveCost": inherited.get("moveCost", 1),
                "regionKey": inherited.get("regionKey"),
                "province": inherited.get("province"),
                "resource": inherited.get("resource"),
                "sourceOwner": inherited.get("owner"),
                "baseColor": base_color,
                "settlements": [],
                "neighbors": [],
            }
            hexes.append(item)
            by_position[(column, row)] = item

    for (column, row), item in by_position.items():
        adjacent = neighbors(column, row, columns, rows)
        item["neighbors"] = [by_position[position]["id"] for position in adjacent]
        item["coastal"] = item["type"] == "LAND" and any(by_position[position]["type"] == "SEA" for position in adjacent)

    def closest_playable(column: int, row: int, kind: str, excluded_codes: set[str] | None = None) -> dict[str, object] | None:
        excluded_codes = excluded_codes or set()
        candidates = [item for (candidate_column, candidate_row), item in by_position.items() if item["type"] == kind and item["code"] not in excluded_codes and abs(candidate_column - column) <= 3 and abs(candidate_row - row) <= 3]
        return min(candidates, key=lambda item: (item["column"] - column) ** 2 + (item["row"] - row) ** 2, default=None)

    settlements: dict[str, dict[str, object]] = {}
    markers = detect_settlement_markers(source_image)
    claimed_settlement_hexes: set[str] = set()
    settlement_sources: list[tuple[str, dict[str, object], float, float]] = []
    for name, settlement in legacy["settlements"].items():
        old_hex = next((item for item in legacy["hexes"] if item["id"] == settlement["hexId"]), None)
        if not old_hex:
            continue
        # The legacy map was expanded by row/column, not by a uniform pixel
        # transform.  Use that known grid transform as the approximate pin
        # location; the detected white circle supplies the final exact point.
        # A direct pixel scale drifts by several hexes toward the map edges.
        target_column = round(old_hex["column"] * LEGACY_SCALE_X + LEGACY_TRANSLATE_X)
        target_row = round(old_hex["row"] * LEGACY_SCALE_Y + LEGACY_TRANSLATE_Y)
        transformed_hex = by_position.get((target_column, target_row))
        if transformed_hex:
            target_x = transformed_hex["center"]["pixelX"]
            target_y = transformed_hex["center"]["pixelY"]
        else:
            source_pixel = settlement.get("pixel", {"x": old_hex["center"]["pixelX"], "y": old_hex["center"]["pixelY"]})
            target_x = source_pixel["x"] * LEGACY_PIXEL_SCALE_X + LEGACY_PIXEL_TRANSLATE_X
            target_y = source_pixel["y"] * LEGACY_PIXEL_SCALE_Y + LEGACY_PIXEL_TRANSLATE_Y
        settlement_sources.append((name, settlement, target_x, target_y))
    settlement_sources.extend((name, {"regionKey": None}, marker[0], marker[1])
                              for name, marker in STEPPE_MARKERS.items())
    if len(markers) < len(settlement_sources):
        raise RuntimeError(f"Detected {len(markers)} settlement markers for {len(settlement_sources)} settlements")
    costs = [[(marker[0] - target_x) ** 2 + (marker[1] - target_y) ** 2 for marker in markers]
             for _name, _settlement, target_x, target_y in settlement_sources]
    marker_assignment = confidence_first_assignment(costs)
    for source_index, (name, settlement, _target_x, _target_y) in enumerate(settlement_sources):
        marker = markers[marker_assignment[source_index]]
        target = marker_overlap_hex(marker[0], marker[1], radius, by_position, origin_x, origin_y, horizontal_step, vertical_step)
        if target and target["code"] in claimed_settlement_hexes:
            target = closest_playable(target["column"], target["row"], "LAND", claimed_settlement_hexes)
        if not target:
            raise RuntimeError(f"No playable hex found for {name}")
        claimed_settlement_hexes.add(str(target["code"]))
        settlements[name] = {
            "hexId": target["id"],
            "hexCode": target["code"],
            "regionKey": settlement.get("regionKey"),
            "pixel": {"x": marker[0], "y": marker[1]},
        }

    for item in hexes:
        item["settlements"] = []
    for name, settlement in settlements.items():
        target = next(item for item in hexes if item["code"] == settlement["hexCode"])
        target["settlements"].append({"name": name, "regionKey": settlement.get("regionKey")})

    result = {
        "mapVersion": "r56-political-v8-marker-grid-v2",
        "grid": {
            "orientation": "flat-top",
            "radius": round(radius, 6),
            "horizontalStep": round(horizontal_step, 6),
            "verticalStep": round(vertical_step, 6),
            "originX": round(origin_x, 6),
            "originY": round(origin_y, 6),
            "columns": columns,
            "rows": rows,
            "width": width,
            "height": height,
            "coordinateSystem": "expanded-local-pixel",
        },
        "legacyTransform": {"scaleX": LEGACY_PIXEL_SCALE_X, "scaleY": LEGACY_PIXEL_SCALE_Y, "translateX": LEGACY_PIXEL_TRANSLATE_X, "translateY": LEGACY_PIXEL_TRANSLATE_Y, "coordinateSystem": "pixel"},
        "settlements": settlements,
        "hexes": hexes,
    }
    output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"generated {columns}x{rows} grid, {len(hexes)} hexes, {len(settlements)} settlement bindings")


if __name__ == "__main__":
    main()
