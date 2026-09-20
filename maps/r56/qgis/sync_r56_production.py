import json
from pathlib import Path
from osgeo import ogr

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT.parents[1] / "assets" / "hex-map-r56.json"
GPKG_PATH = ROOT / "qgis" / "veri" / "hex-grid-r56.gpkg"


def ensure_field(layer, name, field_type, width=0):
    if layer.GetLayerDefn().GetFieldIndex(name) >= 0:
        return
    field = ogr.FieldDefn(name, field_type)
    if width:
        field.SetWidth(width)
    if layer.CreateField(field) != ogr.OGRERR_NONE:
        raise RuntimeError(f"Alan oluşturulamadı: {name}")


def main():
    ogr.UseExceptions()
    payload = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    map_revision = int(payload["mapVersion"].rsplit("-v", 1)[1])
    by_axial = {(item["q"], item["r"]): item for item in payload["hexes"]}
    dataset = ogr.Open(str(GPKG_PATH), 1)
    if dataset is None:
        raise RuntimeError(f"GeoPackage açılamadı: {GPKG_PATH}")
    layer = dataset.GetLayer(0)
    for name, field_type, width in [
        ("coastal", ogr.OFTInteger, 0),
        ("province", ogr.OFTString, 96),
        ("resource", ogr.OFTString, 48),
        ("neighbors", ogr.OFTString, 512),
    ]:
        ensure_field(layer, name, field_type, width)
    updated = 0
    layer.ResetReading()
    for feature in layer:
        column = int(feature.GetField("col_index"))
        row = int(feature.GetField("row_index"))
        axial_r = row - ((column - (column & 1)) // 2)
        item = by_axial.get((column, axial_r))
        if item is None:
            continue
        feature.SetField("hex_uid", item["id"])
        feature.SetField("hex_code", item["code"])
        feature.SetField("q", item["q"])
        feature.SetField("r", item["r"])
        feature.SetField("cell_type", item["type"])
        feature.SetField("terrain", item["terrain"] or "")
        feature.SetField("move_cost", item["moveCost"] if item["moveCost"] is not None else -1)
        feature.SetField("settlement", ", ".join(value["name"] for value in item["settlements"]))
        feature.SetField("region", item["regionKey"] or "")
        feature.SetField("owner", "")
        feature.SetField("playable", 1 if item["playable"] else 0)
        feature.SetField("map_version", map_revision)
        feature.SetField("coastal", 1 if item["coastal"] else 0)
        feature.SetField("province", item["province"] or "")
        feature.SetField("resource", item["resource"] or "")
        feature.SetField("neighbors", ",".join(item["neighbors"]))
        layer.SetFeature(feature)
        updated += 1
    dataset = None
    if updated != len(payload["hexes"]):
        raise RuntimeError(f"Eksik senkron: {updated}/{len(payload['hexes'])}")
    print(json.dumps({"updated": updated, "map_revision": map_revision, "source": str(JSON_PATH), "target": str(GPKG_PATH)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
