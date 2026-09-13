#!/usr/bin/env python3
"""
Validate shuttle CSVs and print a join-ready stop list for the app.

Rules:
  - Every stop_id in schedule CSVs must exist in stops.csv
  - active stops used on a map should have lat+lng (warn if missing/approx)
  - status=removed stops are ignored by the app (keep row for history)

Usage:
  python3 data/shuttle/validate_stops.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent
SCHEDULES = ("off_campus.csv", "on_campus.csv", "pearland.csv", "medical_center.csv")


def load_stops():
    path = DIR / "stops.csv"
    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    by_id = {r["stop_id"]: r for r in rows}
    return by_id


def schedule_stop_ids(name: str) -> set[str]:
    path = DIR / name
    ids: set[str] = set()
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            ids.add(row["stop_id"])
    return ids


def main() -> int:
    stops = load_stops()
    errors = 0
    warnings = 0

    print(f"stops.csv: {len(stops)} stops")
    for sid, s in sorted(stops.items()):
        lat, lng = (s.get("lat") or "").strip(), (s.get("lng") or "").strip()
        status = s.get("status", "")
        coord = s.get("coord_status", "")
        if status == "active" and (not lat or not lng):
            print(f"  WARN  {sid}: active but missing lat/lng (coord_status={coord})")
            warnings += 1
        elif status == "active" and coord == "approx":
            print(f"  INFO  {sid}: approx coords {lat},{lng} — verify on map")

    for sched in SCHEDULES:
        ids = schedule_stop_ids(sched)
        print(f"\n{sched}: {len(ids)} stop_ids")
        for sid in sorted(ids):
            if sid not in stops:
                print(f"  ERROR {sid}: in {sched} but not in stops.csv — ADD a stops.csv row with lat/lng")
                errors += 1
            else:
                s = stops[sid]
                if s.get("status") == "removed":
                    print(f"  WARN  {sid}: scheduled but status=removed in stops.csv")
                    warnings += 1

    # Orphan active stops (in stops but no schedule) — ok for medical_center scaffold
    used = set()
    for sched in SCHEDULES:
        used |= schedule_stop_ids(sched)
    orphans = [sid for sid in stops if sid not in used and stops[sid].get("status") == "active"]
    if orphans:
        print("\nActive stops with no schedule rows (ok if unused yet):")
        for sid in orphans:
            print(f"  INFO  {sid}")

    print(f"\nDone. errors={errors} warnings={warnings}")
    print(
        "\nCRUD tips:\n"
        "  ADD    — new row in stops.csv with stop_id + exact lat + lng (coord_status=verified)\n"
        "           then add timetable rows in the route CSV using that stop_id\n"
        "  UPDATE — change lat/lng (and name) on the stop_id row in stops.csv\n"
        "  REMOVE — set status=removed in stops.csv (or delete row) and delete schedule rows"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
