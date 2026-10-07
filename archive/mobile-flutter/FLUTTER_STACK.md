# Flutter mobile (HawkNav) — archived

Reference only. Active client is Expo under [`../../mobile/`](../../mobile/).

Short stack note from the Flutter experiment. Product requirements stay in [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md).

## Target stack

| Layer | Choice | Role |
| --- | --- | --- |
| Mobile client | Flutter (Dart) | UI tabs, local state, device sensors |
| Mapping (next) | ArcGIS Maps SDK for Flutter (`arcgis_maps`) | Campus layers, floor-aware indoor, routing overlays |
| 360° indoor (later) | `panorama` (or similar) | Look-around at path nodes — not live ARKit/ARCore |
| Auth / realtime / spatial | Supabase (`supabase_flutter`) | Auth, PostGIS, WebSocket shuttle positions |
| Backend API | Bun + Hono | Schedules, predictive ETA, alerts aggregation |
| Parking CV | Python + OpenCV (external) | Lot occupancy via REST → Supabase; no mobile hardware |

This clone’s Shuttle MVP uses **foreground GPS** (`geolocator`) + Supabase Realtime. ArcGIS MapView is deferred until portal credentials exist (Rider shows a map placeholder for now).

## Android-first / mixed-OS workflow

Flutter compiles to native code. Windows/Linux teammates cannot build iOS locally.

```text
[Windows / Linux]  →  Android emulator / device / Flutter web (logic + UI)
         │
    (git push)
         ▼
[GitHub Actions macOS]  →  iOS IPA (later; not wired yet)
         ▼
[Mac / iOS testers]  →  TestFlight or Firebase App Distribution
```

Day-to-day Shuttle work (Driver stream, Rider Realtime, Hono ETA) validates on Android without Xcode.

## Mac pairing (platform files)

Mac owners handle `Podfile`, `Info.plist`, and location/camera entitlements when those land. Windows/Linux focus on Dart, API, and OpenCV.

Suggested pairing from the team plan: Map/AR (Josh, Rashid) and Shuttle permissions (Sebastian, Sai) when native config is required.

## Module ownership (reminder)

| Module | Owners | Mobile touchpoint |
| --- | --- | --- |
| Shuttle | Sebastian, Saikiran | Driver GPS → `shuttle_positions`; Rider Realtime + ETA |
| Campus / Delta indoor | Josh, Ayaan, Rashid | ArcGIS layers + 360° nodes (later) |
| Parking CV | Philip, Sujeeth | HTTP into Supabase; Flutter only fetches counts |

## Layout when this was active

```text
mobile/                    # was Flutter; now Expo at repo root mobile/
archive/mobile-flutter/    # this tree
api/                       # Bun + Hono
supabase/                  # schema.sql
```

## Run (archived)

See [`../../README.md`](../../README.md) for current Expo boot. For this tree: `SUPABASE_*`, `API_URL`, `ARCGIS_API_KEY` in `.env` (never commit).
