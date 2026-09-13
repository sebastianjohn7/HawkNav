# HawkNav shuttle schedules (CSV)

**CSV is the source of truth.** Open any file in Excel / Google Sheets, edit, then **Save As → CSV** (UTF-8) back into this folder. No `.xlsx` in the repo.

## Files

| File | Role |
| --- | --- |
| [`stops.csv`](stops.csv) | **Master stops** — `stop_id`, name, **lat**, **lng**, status |
| [`off_campus.csv`](off_campus.csv) | Blue Route times (references `stop_id`) |
| [`on_campus.csv`](on_campus.csv) | On-campus scaffold |
| [`pearland.csv`](pearland.csv) | Green Route times |
| [`medical_center.csv`](medical_center.csv) | TMC scaffold (`no_service`) |
| [`meta.csv`](meta.csv) / [`meta.json`](meta.json) | term, version, timezone |
| [`changelog.csv`](changelog.csv) | Bump notes each semester |
| [`validate_stops.py`](validate_stops.py) | Checks schedule `stop_id`s exist; reminds lat/lng CRUD |

App/API should: load `stops.csv` for map pins, join schedules on `stop_id`.

## Stops: add / update / remove

All location changes happen in **`stops.csv`**.

| Action | What to do |
| --- | --- |
| **Add** | New row: unique `stop_id`, `name`, exact `lat`, `lng`, `coord_status=verified`, `status=active`. Then add rows to the route CSV using that `stop_id`. |
| **Update** | Same `stop_id`, change `lat`/`lng` (and/or `name`). Set `coord_status=verified`, bump `updated`. Map/ETA pick up new coordinates automatically. |
| **Remove** | Set `status=removed` (keep row for history) **or** delete the row; delete matching rows from route CSVs. |

`coord_status` values: `verified` | `approx` | `missing`

Campus stops ship with **approx** coords so the map can render; replace with curb-accurate GPS when you survey. Off-campus apartment/P&R rows may be `missing` until you paste exact coordinates.

## Schedule CSV columns

```text
day_group, stop_id, stop_name, sequence, t01…t30, status, updated, notes
```

- Times: 24h `HH:mm`, or `DROP_OFF`, or empty
- `day_group`: `mon_thu` | `fri` | `sat` | `all` | `none`
- `stop_name` is for human editing; **lat/lng always come from `stops.csv`**

## Excel round-trip

1. Open e.g. `stops.csv` in Excel.
2. Edit cells (don’t rename header row).
3. **File → Save As → CSV UTF-8** (overwrite the same path).
4. Run `python3 data/shuttle/validate_stops.py`
5. Bump `version` in `meta.csv` + `meta.json`, add a `changelog.csv` line.

## Validate

```bash
python3 data/shuttle/validate_stops.py
```

## Sources (v2)

- `shuttle-pdfs/fall-off-campus-shuttle-scheduled.pdf` → `off_campus.csv`
- `shuttle-pdfs/pearland-shuttle-schedule--.pdf` → `pearland.csv`
- On-campus / Medical Center: scaffolds until PDFs exist
