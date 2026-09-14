# HawkNav shuttle data (CSV)

Edit in Excel → **Save As CSV (UTF-8)**. App reads these files directly.

## Files

| File | Columns |
| --- | --- |
| [`meta.csv`](meta.csv) | `term`, `updated_at`, `name`, `email` |
| [`stops.csv`](stops.csv) | `stop_id`, `name`, `lat`, `lng`, `routes`, `status` |
| [`off_campus.csv`](off_campus.csv) | Bay Area P&R, United Way, Coastal Flow, Anytime Fitness, University Forest, Sat HEB grocery |
| [`on_campus.csv`](on_campus.csv) | Campus stops (Delta, Arbor, Police, Rec, Hunter, SSCB, Bayou, …) |
| [`pearland.csv`](pearland.csv) | Pearland route |

Schedule columns: `day_group`, `stop_id`, `times`

`times` is a comma-separated list of `HH:mm` values and/or `DROP_OFF` (one row per stop per day group).

**Sat HEB grocery:** `off_campus.csv` stop `heb` with `10:30,11:30` (window). Bayou Student Entrance sat times also include `10:30,11:30` as on the UHCL PDF.

Medical Center: no schedule CSV yet; stop can live in `stops.csv` (`status=inactive` until service exists).

## Stops

| Action | Edit `stops.csv` |
| --- | --- |
| Add | New `stop_id` + exact `lat`/`lng` + `status=active`, then add schedule rows |
| Update | Change `lat`/`lng` (or `name`) on that `stop_id` |
| Remove | Set `status=inactive` or delete the row; delete matching schedule rows |

Set `updated_at`, `name`, and `email` in `meta.csv` when you publish a schedule change.

Loader/validator lives in the Bun API: `cd api && bun run check` / `bun run dev`.

Off-campus lat/lng were filled from public addresses (METRO Bay Area P&R, United Way Bay Area Center, Coastal Flow on Bay Area Blvd, Anytime Fitness 2416 Bay Area Blvd, HEB Webster). Re-pin in the field if a stop moves.
