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


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: generate-expanded-movement-map.py SOURCE_PNG LEGACY_JSON OUTPUT_JSON")
    source_path, legacy_path, output_path = map(Path, sys.argv[1:])
    image = Image.open(source_path).convert("RGB")
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
            kind = inherited.get("type", detected_kind)
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
                "settlements": inherited.get("settlements", []),
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
    claimed_settlement_hexes: set[str] = set()
    for name, settlement in legacy["settlements"].items():
        old_hex = next((item for item in legacy["hexes"] if item["id"] == settlement["hexId"]), None)
        if not old_hex:
            continue
        source_pixel = settlement.get("pixel", {"x": old_hex["center"]["pixelX"], "y": old_hex["center"]["pixelY"]})
        target_x = source_pixel["x"] * LEGACY_PIXEL_SCALE_X + LEGACY_PIXEL_TRANSLATE_X
        target_y = source_pixel["y"] * LEGACY_PIXEL_SCALE_Y + LEGACY_PIXEL_TRANSLATE_Y
        target_column = round((target_x - origin_x) / horizontal_step)
        target_row = round((target_y - origin_y - (vertical_step / 2 if target_column % 2 else 0)) / vertical_step)
        target = by_position.get((target_column, target_row))
        if target and (target["type"] != "LAND" or target["code"] in claimed_settlement_hexes):
            target = closest_playable(target_column, target_row, "LAND", claimed_settlement_hexes)
        if not target:
            continue
        claimed_settlement_hexes.add(str(target["code"]))
        settlements[name] = {
            "hexId": target["id"],
            "hexCode": target["code"],
            "regionKey": settlement.get("regionKey"),
            "pixel": {"x": target["center"]["pixelX"], "y": target["center"]["pixelY"]},
        }

    result = {
        "mapVersion": "r56-expanded-v7",
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
