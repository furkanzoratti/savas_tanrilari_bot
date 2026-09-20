from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from osgeo import ogr

from qgis.core import (
    QgsApplication,
    QgsCoordinateReferenceSystem,
    QgsFillSymbol,
    QgsLayout,
    QgsLayoutExporter,
    QgsLayoutItemMap,
    QgsLayoutItemPage,
    QgsLayoutPoint,
    QgsLayoutSize,
    QgsPalLayerSettings,
    QgsProject,
    QgsRasterLayer,
    QgsSingleSymbolRenderer,
    QgsTextFormat,
    QgsUnitTypes,
    QgsVectorLayer,
    QgsVectorLayerSimpleLabeling,
)
from qgis.PyQt.QtGui import QColor, QFont


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SOURCE_RASTER = HERE / "kaynak" / "amrp-toprak-georef.tif"
GRID_48 = HERE / "veri" / "hex-grid-r48.gpkg"
GRID_56 = HERE / "veri" / "hex-grid-r56.gpkg"
PROJECT_FILE = HERE / "amrp-harita.qgz"
OUTPUT_DIR = ROOT / "cikti"
REPORT_FILE = HERE / "qgis-hazirlama-raporu.json"

MAP_WIDTH = 4064.0
MAP_HEIGHT = 3328.0
MAP_VERSION = 1


def column_name(index: int) -> str:
    value = index + 1
    result = ""
    while value > 0:
        value -= 1
        result = chr(65 + (value % 26)) + result
        value //= 26
    return result


def ensure_field(layer: ogr.Layer, name: str, field_type: int, width: int = 0) -> None:
    if layer.GetLayerDefn().GetFieldIndex(name) >= 0:
        return
    field = ogr.FieldDefn(name, field_type)
    if width:
        field.SetWidth(width)
    result = layer.CreateField(field)
    if result != ogr.OGRERR_NONE:
        raise RuntimeError(f"Alan olusturulamadi: {name}")


def enrich_grid(path: Path, radius: int) -> dict[str, int | str]:
    dataset = ogr.Open(str(path), update=1)
    if dataset is None:
        raise RuntimeError(f"GeoPackage acilamadi: {path}")
    layer = dataset.GetLayer(0)

    ensure_field(layer, "hex_uid", ogr.OFTString, 32)
    ensure_field(layer, "hex_code", ogr.OFTString, 12)
    ensure_field(layer, "q", ogr.OFTInteger)
    ensure_field(layer, "r", ogr.OFTInteger)
    ensure_field(layer, "center_x", ogr.OFTReal)
    ensure_field(layer, "center_y", ogr.OFTReal)
    ensure_field(layer, "cell_type", ogr.OFTString, 12)
    ensure_field(layer, "terrain", ogr.OFTString, 24)
    ensure_field(layer, "move_cost", ogr.OFTInteger)
    ensure_field(layer, "settlement", ogr.OFTString, 80)
    ensure_field(layer, "region", ogr.OFTString, 80)
    ensure_field(layer, "owner", ogr.OFTString, 80)
    ensure_field(layer, "playable", ogr.OFTInteger)
    ensure_field(layer, "map_version", ogr.OFTInteger)

    updated = 0
    playable = 0
    layer.ResetReading()
    for feature in layer:
        row = int(feature.GetField("row_index"))
        col = int(feature.GetField("col_index"))
        axial_q = col
        axial_r = row - ((col - (col & 1)) // 2)
        centroid = feature.GetGeometryRef().Centroid()
        center_x = float(centroid.GetX())
        center_y = float(centroid.GetY())
        inside_canvas = int(0 <= center_x <= MAP_WIDTH and 0 <= center_y <= MAP_HEIGHT)

        feature.SetField("hex_uid", f"AMRP-R{radius}-Q{axial_q:+04d}-R{axial_r:+04d}")
        feature.SetField("hex_code", f"{column_name(col)}{row + 1:02d}")
        feature.SetField("q", axial_q)
        feature.SetField("r", axial_r)
        feature.SetField("center_x", round(center_x, 6))
        feature.SetField("center_y", round(center_y, 6))
        feature.SetField("cell_type", "UNSET")
        feature.SetField("terrain", "UNSET")
        feature.SetField("move_cost", 1)
        feature.SetField("playable", inside_canvas)
        feature.SetField("map_version", MAP_VERSION)
        if layer.SetFeature(feature) != ogr.OGRERR_NONE:
            raise RuntimeError(f"Hex guncellenemedi: {feature.GetFID()}")
        updated += 1
        playable += inside_canvas

    layer.SyncToDisk()
    layer_name = layer.GetName()
    dataset = None
    return {
        "layer": layer_name,
        "radius": radius,
        "features": updated,
        "canvas_center_features": playable,
    }


def configure_grid(layer: QgsVectorLayer, visible: bool) -> None:
    symbol = QgsFillSymbol.createSimple(
        {
            "color": "0,0,0,0",
            "outline_color": "31,43,51,105",
            "outline_width": "0.30",
            "outline_width_unit": "MM",
            "joinstyle": "round",
        }
    )
    layer.setRenderer(QgsSingleSymbolRenderer(symbol))

    label_settings = QgsPalLayerSettings()
    label_settings.fieldName = "hex_code"
    label_settings.isExpression = False
    text_format = QgsTextFormat()
    text_format.setFont(QFont("Arial", 7, QFont.Weight.Bold))
    text_format.setSize(7)
    text_format.setColor(QColor(247, 240, 218, 185))
    text_format.buffer().setEnabled(True)
    text_format.buffer().setSize(0.8)
    text_format.buffer().setColor(QColor(16, 27, 34, 190))
    label_settings.setFormat(text_format)
    layer.setLabeling(QgsVectorLayerSimpleLabeling(label_settings))
    layer.setLabelsEnabled(False)

    layer.setCustomProperty("amrp/radius", int(layer.name().split("R")[-1].split()[0]))
    layer.setCustomProperty("amrp/grid_origin", "pixel-top-left:0,0")
    layer.setCustomProperty("amrp/immutable_geometry", True)
    layer.triggerRepaint()


def export_preview(
    project: QgsProject,
    raster: QgsRasterLayer,
    grid: QgsVectorLayer,
    output_path: Path,
    with_labels: bool,
) -> None:
    grid.setLabelsEnabled(with_labels)
    layout = QgsLayout(project)
    layout.initializeDefaults()
    page = layout.pageCollection().page(0)
    page.setPageSize(QgsLayoutSize(406.4, 332.8, QgsUnitTypes.LayoutMillimeters))

    map_item = QgsLayoutItemMap(layout)
    map_item.attemptMove(QgsLayoutPoint(0, 0, QgsUnitTypes.LayoutMillimeters))
    map_item.attemptResize(QgsLayoutSize(406.4, 332.8, QgsUnitTypes.LayoutMillimeters))
    map_item.setExtent(raster.extent())
    map_item.setLayers([grid, raster])
    map_item.setBackgroundEnabled(False)
    layout.addLayoutItem(map_item)

    settings = QgsLayoutExporter.ImageExportSettings()
    settings.dpi = 254
    result = QgsLayoutExporter(layout).exportToImage(str(output_path), settings)
    if result != QgsLayoutExporter.ExportResult.Success:
        raise RuntimeError(f"Onizleme disari aktarilamadi: {output_path} ({result})")
    grid.setLabelsEnabled(False)


def build_project() -> dict[str, object]:
    project = QgsProject.instance()
    project.clear()
    project.setCrs(QgsCoordinateReferenceSystem("EPSG:3857"))
    project.setTitle("AMRP Hareket Haritasi")
    project.setCustomVariables(
        {
            "amrp_map_version": MAP_VERSION,
            "amrp_canvas_width": int(MAP_WIDTH),
            "amrp_canvas_height": int(MAP_HEIGHT),
            "amrp_grid_policy": "fixed-origin-append-only",
        }
    )

    raster = QgsRasterLayer(str(SOURCE_RASTER), "AMRP Toprak Haritasi")
    grid_48 = QgsVectorLayer(f"{GRID_48}|layername=hex-grid-r48", "Hex Grid R48 Mevcut", "ogr")
    grid_56 = QgsVectorLayer(f"{GRID_56}|layername=hex-grid-r56", "Hex Grid R56 Okunakli", "ogr")
    for layer in (raster, grid_48, grid_56):
        if not layer.isValid():
            raise RuntimeError(f"QGIS katmani gecersiz: {layer.name()}")

    configure_grid(grid_48, True)
    configure_grid(grid_56, False)

    project.addMapLayer(raster)
    project.addMapLayer(grid_48)
    project.addMapLayer(grid_56)
    project.layerTreeRoot().findLayer(grid_48.id()).setItemVisibilityChecked(True)
    project.layerTreeRoot().findLayer(grid_56.id()).setItemVisibilityChecked(False)

    (HERE / "stiller").mkdir(parents=True, exist_ok=True)
    grid_48.saveNamedStyle(str(HERE / "stiller" / "hex-grid-r48.qml"))
    grid_56.saveNamedStyle(str(HERE / "stiller" / "hex-grid-r56.qml"))

    if not project.write(str(PROJECT_FILE)):
        raise RuntimeError(f"QGIS projesi kaydedilemedi: {PROJECT_FILE}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    export_preview(project, raster, grid_48, OUTPUT_DIR / "qgis-r48-onizleme.png", False)
    export_preview(project, raster, grid_56, OUTPUT_DIR / "qgis-r56-onizleme.png", False)
    export_preview(project, raster, grid_48, OUTPUT_DIR / "qgis-r48-koordinatli.png", True)
    export_preview(project, raster, grid_56, OUTPUT_DIR / "qgis-r56-koordinatli.png", True)

    return {
        "project": str(PROJECT_FILE),
        "raster": str(SOURCE_RASTER),
        "outputs": [
            "qgis-r48-onizleme.png",
            "qgis-r56-onizleme.png",
            "qgis-r48-koordinatli.png",
            "qgis-r56-koordinatli.png",
        ],
    }


def main() -> None:
    QgsApplication.setPrefixPath(r"C:\Program Files\QGIS 4.2.2\apps\qgis", True)
    app = QgsApplication([], False)
    app.initQgis()
    try:
        report = {
            "mapVersion": MAP_VERSION,
            "canvas": {"width": int(MAP_WIDTH), "height": int(MAP_HEIGHT)},
            "expansionPolicy": "fixed-origin-append-only",
            "grids": [enrich_grid(GRID_48, 48), enrich_grid(GRID_56, 56)],
        }
        report.update(build_project())
        REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        app.exitQgis()


if __name__ == "__main__":
    main()
