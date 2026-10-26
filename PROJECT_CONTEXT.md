# HawkNav Project Context Document

This document is the complete technical, operational, and structural context for **HawkNav**. It is the single source of truth for AI agents and team members — read it at the start of every session before making changes.

Aligned with Team Odyssey’s Software Requirements Specification (SRS) v1.0 (09/08/2026).

---

## 1. Project Overview & Meta Information


| Field             | Value                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Project Name**  | HawkNav (Hawk Nav)                                                                                                       |
| **Tagline**       | An All-in-One Campus Mobility App for UHCL                                                                               |
| **Problem**       | UHCL students lack timely, accurate information about shuttle status, accessible routes, parking, and emergency closures |
| **Course & Term** | CSCI 4388 Senior Project, Fall 2026, University of Houston–Clear Lake (UHCL)                                             |
| **Team Name**     | Team Odyssey                                                                                                             |
| **Motto**         | *From 20 years to 20 seconds*                                                                                            |
| **Vision**        | *Take the guesswork out of it*                                                                                           |
| **SRS Version**   | 1.0                                                                                                                      |
| **SRS Date**      | 09/08/2026                                                                                                               |
| **Authors**       | Ayaan , Josh , Rashid , Sai , Sujeeth , Philip , Sebastian                                                               |


### Purpose

Outline HawkNav’s functionality so customers, stakeholders, and the development team share the same guidelines for development and use.

### Scope

HawkNav serves UHCL’s commuter majority — especially international students and anyone with mobility limitations — and anyone hurt by slow closure alerts. It centralizes shuttle, navigation, parking, and emergency information and **pushes** it to users instead of making them hunt for it.

### Stakeholders


| Role                     | Who                                                 |
| ------------------------ | --------------------------------------------------- |
| **Customers**            | Parking & Transportation Department                 |
| **End users**            | Students, Faculty/Staff, Community Members/Visitors |
| **Developers / Testers** | Team Odyssey                                        |


Intended audience includes UHCL students and visitors unfamiliar with campus layout. Park & Transportation may also use HawkNav to improve parking and shuttle efficiency.

### Target Metrics

- Implement 90% of core use cases by Week 15.
- Enable 90% of users to locate their route in under 5 minutes.

### References

- IEEE Std 830-1998
- *Applied Software Project Management* (Stellman & Greene)
- Team Charter
- Team Odyssey SRS v1.0
- [UHCL ArcGIS Indoors Viewer](https://uhclhawks.maps.arcgis.com/apps/indoors/index.html?appid=3517c44201534a1b9d0f40acc86903a7) — official campus GIS / floor plans

---

## 2. Team Structure & Sub-Team Roles

Seven CS majors, organized into specialized sub-teams:


| Member Name   | Meeting Roles | Technical Sub-Team |
| ------------- | ------------- | ------------------ |
| **Sebastian** | Coordinator   | Shuttle Team       |
| **Saikiran**  | Facilitator   | Shuttle Team       |
| **Josh**      | Timekeeper    | Map & AR Team      |
| **Ayaan**     | Scribe        | Map & AR Team      |
| **Rashid**    | Timekeeper    | Map & AR Team      |
| **Philip**    | Scribe        | Parking CV Team    |
| **Sujeeth**   | Coordinator   | Parking CV Team    |


---

## 3. This Workspace (Sebastian’s Clone)

This clone (`HawkNav-seb`) is **Sebastian John’s** working tree.


|                        |                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Default focus**      | **Entire Shuttle module (FR-5)** — everything riders and drivers need for live campus shuttles (see breakdown below)                                 |
| **Product (full app)** | UHCL campus mobility — shuttle tracking, accessible navigation + 360° indoor path view, parking congestion, emergency alerts                         |
| **Mobile client**      | Expo under `mobile/` (Josh shell + Shuttle/Find/Alerts); prior Flutter / ArcGIS experiment in `archive/mobile-flutter/` |
| **Do not**             | Commit `.env` / secrets; invent live-camera AR or hardware beacons for indoor nav; bundle the full ~118MB UHCL Indoors GeoJSON into the app |


**Shuttle module includes (in scope by default):**

- Driver app: GPS stream every 3–5s (`expo-location`) → `shuttle_positions`
- Rider / student UI: live position via Supabase Realtime on the Shuttle campus map + stop ETA
- Routes, stops, and schedules (on-campus + off-campus / Pearland references in `shuttle-pdfs/` / `data/shuttle/`)
- Predictive ETA (Hono): schedule-based ETA today; segment history / moving average later
- Josh-shell tabs: Shuttle (map + Rider/Driver), Find (Delta floor plan), News & Alerts (placeholder)

Prefer Shuttle-scoped changes unless the user asks for indoor path routing, 360°, or Parking CV.

---

## 4. Technology Stack & Infrastructure

Designed to minimize hardware dependencies while supporting cross-platform mobile access, spatial graph processing, and real-time streaming.


| Layer                                   | Choice                                          | Notes                                                                     |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| Mobile frontend                         | Expo (React Native)                             | Expo Go; Josh shell (Landing → Sign-in → bottom tabs); Flutter archived under `archive/mobile-flutter/` |
| Maps & wayfinding                       | `react-native-maps` + GeoJSON                   | Shuttle: campus map + live marker; Find: extracted Delta floor plan (`delta_floorplan.json`); custom walk paths later |
| Indoor floor plan (now)                 | UHCL Indoors GeoJSON extract                    | Source `UHCL_Campus_Map_Public_WFL1.geojson` (~118MB, gitignored); app loads Delta-only extract; L1/L2 toggle |
| Indoor 360° path view (later)           | Panorama at path nodes (Street View–style)      | **2D map guides** node-to-node; **360°** = look-around at current node only — not live AR |
| Database & spatial                      | Supabase (PostgreSQL + PostGIS)                 | **Required** for this clone: `shuttle_positions` + Realtime; anon keys in `mobile/.env` |
| Backend runtime                         | Bun + Hono                                      | Stops / schedules / ETA from CSV; A* pathfinding later                    |
| Parking CV                              | Python + OpenCV + YOLOv8-nano / TensorFlow Lite | Stationary drone / camera clips of lot entrance/exit (e.g. Delta & Arbor) |
| Dev tunneling                           | Cloudflare quick tunnel (`cloudflared`)         | **Required** day-to-day: `cd api && bun run dev` → tunnel + write `EXPO_PUBLIC_API_URL` |
| Push alerts                             | Expo push / FCM + Twilio SMS fallback (later)   | Emergency, weather, and service disruption alerts                         |

### Maps in this clone (current vs target)

- **Now:** Shuttle tab and Find tab each have their own `MapView` (campus live shuttle vs Delta floor plan).
- **Target (SRS):** One shared MapView with layer stacks (shuttle / parking / indoor); floor filter; 360° as overlay. Don’t invent a second product map SDK without asking.


### UHCL ArcGIS Indoors (campus GIS reference)

Official UHCL floor-aware campus map — use as the institutional spatial backbone; do **not** wrap the web app as HawkNav.

- **Viewer:** [UHCL Indoors Viewer](https://uhclhawks.maps.arcgis.com/apps/indoors/index.html?appid=3517c44201534a1b9d0f40acc86903a7)
- **Org portal:** `uhclhawks.maps.arcgis.com` (UHCL ArcGIS Online)

**Useful layers observed in the viewer**

| Layer | HawkNav use |
| --- | --- |
| Facilities / Units / Levels | Building footprints, rooms, floor-aware indoor destinations |
| Sidewalks | Outdoor walk graph (prefer over inventing paths from imagery) |
| Entrances, Elevators, Restrooms | Accessible routing filters / ADA preferences |
| Parking Lots | Lot polygons for occupancy and permit geofences |
| Sites / UHCLBasemap | Campus extent and basemap context under live overlays |

**How teams should treat it**

- **Map / indoor:** Source of truth for 2D campus geometry and floors. This clone uses a public Indoors-style GeoJSON export → Delta extract for Find; HawkNav still owns custom path nodes + 360° photos later.
- **Parking:** Reuse lot polygons where export/API access allows.
- **Shuttle:** Street basemap + live GPS marker; routes/schedules/ETA stay in HawkNav (`shuttle_positions`, `data/shuttle/`, Hono). The Indoors viewer is not a shuttle tracker.
- **Access:** Prefer extracts over live ArcGIS SDK unless portal credentials exist; never ship the full multi‑100MB GeoJSON in the Expo bundle.

---

## 5. Functional Requirements (SRS)

Format below follows the SRS. Implementation notes from the team’s technical plan are included where they add concrete design detail.

### FR-1: User Login — Priority: Medium

**Description:** Registered users log in with username and password.

**Output / acceptance:**

- Valid credentials grant access.
- Users complete the chosen 2FA option.
- Invalid credentials return an error.
- Login activity is recorded.

### FR-2: Realtime Data Collection — Priority: High

**Description:** Realtime data for recent updates on shuttle, parking, and alerts.


|                |                                                                             |
| -------------- | --------------------------------------------------------------------------- |
| **Input**      | User position, shuttle position, parking lot vehicle-detection data         |
| **Processing** | Backend data loader aggregates inputs into update payloads for the frontend |
| **Output**     | Per-section data streams: parking, indoor navigation, shuttle               |


### FR-3: Map — Priority: High

**Description:** Centralized map for shuttle tracking, parking availability, and indoor navigation.


|                |                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **Input**      | Map SDK building locations; live shuttle path / position                                               |
| **Processing** | Pathfinding to selected buildings; shuttle pinged with realtime location and proximity to nearest stop |
| **Output**     | Easier building navigation; accurate shuttle position and arrival timing for riders                    |


### FR-4: Indoor 360° Path View — Priority: High

**Description:** Indoor wayfinding is **node-to-node along a 2D path inside buildings** (Google Maps–style). The system computes a path from a start node to a destination node, including **across floors** when needed (e.g. via elevator edges). The **2D map is the primary guide** (point → next point along the route). Each node has a pre-captured **360° photo** so the user can look around and confirm “this is where I am” — the panorama is situational awareness, not a live AR camera and not the thing that computes the route.

|                |                                                                 |
| -------------- | --------------------------------------------------------------- |
| **Input**      | Selected destination; indoor node/edge graph (per floor + vertical links); 360° photo per node |
| **Processing** | Shortest path over the node graph (may span multiple floors); UI advances current-node along that sequence |
| **Output**     | Highlighted 2D route + step-to-next-node guidance; optional 360° look-around at the current node |

**Implementation notes:**

- Path authors place **nodes** on the shared campus map inside buildings; each node stores one 360° picture of that spot.
- **Edges** connect nodes along hallways; **vertical edges** (elevators / accessible links) connect floors so one route can go Bayou L1 → elevator → L2 → room.
- **2D map role:** draws the full path, shows progress, and guides the user from the current node to the next (primary navigator).
- **360° role:** swap/view the photo for the current node so they can orient visually — like Street View standing still at a point; arrows may hint which way the next node is.
- Same MapView as shuttle/parking (indoor path = another layer); floor picker filters which indoor geometry is visible.
- No live-camera ARKit/ARCore overlay and no hardware beacons required for this mode.

### FR-5: Shuttle Service — Priority: High

**Description:** Periodically update shuttle location and status during operations.


|                |                                                                  |
| -------------- | ---------------------------------------------------------------- |
| **Input**      | Shuttle driver’s phone                                           |
| **Processing** | Track shuttle by receiving location from the driver device       |
| **Output**     | Current position, proximity to nearest stop, operational timings |


**Implementation notes (this clone):**

- **Driver:** `expo-location` `watchPositionAsync` ~every 4s → upsert `shuttle_positions` (Supabase).
- **Rider / map:** Supabase Realtime on `shuttle_positions`; green marker on Shuttle campus map; stop list + `GET /eta` from Bun API.
- **Shell:** Expo port of Josh’s NavModule — Shuttle / Find / News & Alerts (+ settings).
- **ETA today:** Hono schedule-based next departure; segment history / moving average later.

### FR-6: Campus Indoor Navigation — Priority: High

**Description:** Interactive indoor campus map on the **shared MapView**; shortest route via Dijkstra / A\* over the custom node graph (including multi-floor links). The 2D route is the guide; FR-4’s 360° view is available at the current node for orientation.

|                |                                                  |
| -------------- | ------------------------------------------------ |
| **Input**      | User start / current location; destination area, room, or office |
| **Processing** | Build and compare routes across indoor path nodes (and floors) |
| **Output**     | Shortest node sequence; 2D route on the shared map; optional 360° at current node |

**Implementation notes:**

- **Now (Find tab):** Display-only Delta floor plan from Indoors extract (`mobile/assets/maps/delta_floorplan.json`); Level 1 / Level 2 filter. Re-extract with `mobile/scripts/extract_delta_floorplan.py`.
- **Later:** Authored walk **nodes/edges** (GeoJSON) + Dijkstra / A\* for FR-6; destinations resolve to nearest path node(s).
- **Mobility mode (later):** Stairs / steep grades (`>8.33%`) → infinite weight so A\* prefers elevators / ADA.
- Do **not** `require()` the full campus Indoors dump into Expo — parse/RAM/render will fail; keep extracts.

### FR-7: Parking Congestion — Priority: High

**Description:** Determine available parking and traffic through lots.


|                |                                             |
| -------------- | ------------------------------------------- |
| **Input**      | Camera feed over Delta & Arbor parking lots |
| **Processing** | Computer vision on camera feed              |
| **Output**     | Predicted available parking / occupancy     |


**Implementation notes:**

- **Phase 1 — Schedule density & geofencing:** Cross-reference UHCL course schedules with building-to-lot mappings; combine with geofenced crowdsourced check-ins.
- **Phase 2 — Gate counter:** Looped stationary clips of entrance/exit chokepoints. Two virtual tripwires (`Line_In`, `Line_Out`): `In → Out` = entry, `Out → In` = exit. Sync occupancy % → Supabase levels `LOW`  `MEDIUM`  `HIGH`  `FULL`.
- **Permit warning:** Push when a student’s GPS enters a Faculty/Staff lot polygon during enforcement hours.

### FR-8: Emergency Alert System — Priority: Medium

**Description:** Campus-wide emergency notifications to students, faculty/staff, and visitors/community members.


|                |                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Input**      | Rapid incidents; student reports vs administrative reports                                                                       |
| **Processing** | Student direct reporting for smaller incidents; admin console distinguishes lower vs higher priority (locational vs campus-wide) |
| **Output**     | Mobile push for fire/safety, power, weather, road closures, etc.                                                                 |


---

## 6. Nonfunctional Requirements (SRS)


| Area                | Requirement                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| **Performance**     | Responsive features; realtime information reloads promptly                  |
| **Reliability**     | Support concurrent sessions on the order of 1,000+ devices                  |
| **Availability**    | 24/7 except scheduled maintenance windows published ≥48 hours in advance    |
| **Security**        | Role-based access control; multi-factor authentication                      |
| **Maintainability** | Primary features as separate components / microservices for fault tolerance |
| **Usability**       | Straightforward UI; map of buildings; search for classrooms and buildings   |
| **Scalability**     | Test with ~10–20 users; aim for campus-wide UHCL rollout                    |


---

## 7. System Data Flow

```text
[Driver Expo Go] ──(expo-location)──> [Supabase shuttle_positions] ──(Realtime)──> [Rider Expo map marker]
                                              │
[Expo app] ──(EXPO_PUBLIC_API_URL via cloudflared)──> [Bun + Hono] ──> stops / schedules / ETA (CSV)
                                              │
[Find tab] ──(delta_floorplan.json extract)──> [react-native-maps GeoJSON overlay]
                                              │
[Later] OpenCV gate / A* indoor paths / 360° node viewer
```

---

## 8. Definitions, Acronyms, and Abbreviations


| Term   | Definition                          |
| ------ | ----------------------------------- |
| SRS    | Software Requirements Specification |
| UI     | User Interface                      |
| API    | Application Programming Interface   |
| ETA    | Estimated Time of Arrival           |
| GPS    | Global Positioning System           |
| UHCL   | University of Houston–Clear Lake    |
| MVP    | Minimum Viable Product              |
| AR     | Legacy SRS label; indoor nav is 360° node panoramas (not live camera AR) |
| ArcGIS | Geospatial software / SDK           |
| Node   | Authored waypoint on the indoor path graph; holds a 360° photo of that spot |
| Minimap / 2D guide | Same campus map (or compact chrome) showing the route; **primary** indoor navigator — 360° only shows the current node |


---

## 9. Operational & Team Ground Rules

- **Scrum:** Weekly Kanban reviews every Tuesday before class and Thursday at 5:30 PM.
- **Decisions:** Majority rule; consensus preferred.
- **Individual reporting:** Each member submits a weekly report (research, meeting, design, coding, testing hours).
- **Team reporting:** Executive summary, deliverables, risk logs, and schedule status via the CSCI 4388 Team Report template.

---

## 10. Agent Working Guidelines

When starting a new session on this repo:

1. Prefer the **Shuttle module** (driver GPS, realtime rider map, stops/schedules, ETA) unless asked otherwise.
2. Match the stack: **Expo** (`expo-location`, `@supabase/supabase-js`, `react-native-maps`), Bun + Hono, Supabase Realtime. Flutter notes only under [`archive/mobile-flutter/`](archive/mobile-flutter/). Boot: root [`README.md`](README.md).
3. Do not commit secrets (`.env`, keys, credentials). Use `.env.example` patterns only.
4. Keep changes scoped; do not invent parking CV or indoor 360° unless requested.
5. **Always** use Cloudflare quick tunnel for device testing: `cd api && bun run dev` (writes `EXPO_PUBLIC_API_URL`). Supabase setup is required.
6. Prefer small, reviewable commits only when the user asks to commit.
7. Indoors now = Delta floor-plan extract; custom paths / A* / 360° later. Never bundle the full Indoors GeoJSON. No live-camera AR or beacons.

