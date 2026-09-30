#!/usr/bin/env python3
"""Extract Delta floor-plan features from the full UHCL Indoors GeoJSON.

Source (gitignored, ~118MB):
  mobile/assets/maps/UHCL_Campus_Map_Public_WFL1.geojson

Output (bundled):
  mobile/assets/maps/delta_floorplan.json
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets/maps/UHCL_Campus_Map_Public_WFL1.geojson"
OUT = ROOT / "assets/maps/delta_floorplan.json"
KEEP_PROPS = (
    "LEVEL_ID",
    "Level_ID",
    "USE_TYPE",
    "NAME",
    "NAME_LONG",
    "UNIT_ID",
    "FACILITY_ID",
    "NAME_SHORT",
    "Common_Name",
)


def upd_bbox(bbox: list[float], coords, gtype: str) -> None:
    if gtype == "Point":
        x, y = coords[0], coords[1]
        bbox[0], bbox[2] = min(bbox[0], x), max(bbox[2], x)
        bbox[1], bbox[3] = min(bbox[1], y), max(bbox[3], y)
    elif gtype in ("MultiPoint", "LineString"):
        for c in coords:
            upd_bbox(bbox, c, "Point")
    elif gtype in ("MultiLineString", "Polygon"):
        for ring in coords:
            upd_bbox(bbox, ring, "LineString")
    elif gtype == "MultiPolygon":
        for poly in coords:
            upd_bbox(bbox, poly, "Polygon")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source: {SRC}")

    data = json.loads(SRC.read_text())
    delta = []
    bbox = [float("inf"), float("inf"), float("-inf"), float("-inf")]

    for f in data["features"]:
        props = f.get("properties") or {}
        geom = f.get("geometry")
        if not geom or not geom.get("type") or geom.get("coordinates") is None:
            continue
        lid = str(props.get("LEVEL_ID") or props.get("Level_ID") or "")
        fid = str(props.get("FACILITY_ID") or "")
        if "DELTA" not in lid and "DELTA" not in fid:
            continue
        slim = {k: props[k] for k in KEEP_PROPS if k in props and props[k] is not None}
        if "Level_ID" in slim and "LEVEL_ID" not in slim:
            slim["LEVEL_ID"] = slim.pop("Level_ID")
        else:
            slim.pop("Level_ID", None)
        delta.append({"type": "Feature", "properties": slim, "geometry": geom})
        upd_bbox(bbox, geom["coordinates"], geom["type"])

    collection = {
        "type": "FeatureCollection",
        "name": "UHCL Delta floor plan (extracted)",
        "source": SRC.name,
        "bbox": bbox,
        "features": delta,
    }
    OUT.write_text(json.dumps(collection, separators=(",", ":")))
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1e6:.2f} MB, {len(delta)} features)")


if __name__ == "__main__":
    main()
