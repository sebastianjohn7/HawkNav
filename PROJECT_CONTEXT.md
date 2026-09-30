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
| **Mobile client**      | Expo under `mobile/`; prior Flutter / ArcGIS experiment in `archive/mobile-flutter/`                                                                      |
| **Do not**             | Commit `.env` / secrets; expand into Map / AR / Parking modules unless asked; invent live-camera AR or hardware beacons for indoor nav                |


**Shuttle module includes (in scope by default):**

- Driver app: GPS stream every 3–5s (`geolocator`) → `shuttle_positions`
- Rider / student UI: live position via Supabase Realtime, nearest stop, operational status
- Routes, stops, and schedules (on-campus + off-campus / Pearland references in `shuttle-pdfs/`)
- Predictive ETA (Hono): segment traversal history + moving average
- Shuttle-related alerts / service disruption hooks when they affect routes

Prefer full Shuttle-scoped changes unless the user explicitly asks for Map, indoor 360°, or Parking work.

---

## 4. Technology Stack & Infrastructure

Designed to minimize hardware dependencies while supporting cross-platform mobile access, spatial graph processing, and real-time streaming.


| Layer                                   | Choice                                          | Notes                                                                     |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| Mobile frontend                         | Expo (React Native)                             | Cross-platform UI via Expo Go; Flutter experiment archived under `archive/mobile-flutter/` |
| Maps & wayfinding                       | react-native-maps + GeoJSON corridors           | Indoor Delta paths as GeoJSON overlays; ArcGIS Indoors remains campus GIS reference |
| Indoor 360° path view                   | Panorama at path nodes (Street View–style)      | **2D map guides** node-to-node (incl. across floors); **360° is only** “look around where you are” at the current node — not the primary navigator |

### Shared campus map (one MapView)

Shuttle, parking, outdoor walk, and indoor path all share **one map instance** as layer stacks (show/hide / restyle). Indoor is a layer mode + floor filter on that same map — do not remount a second map for indoor nav. The 360° viewer is a UI overlay/panel on top; the 2D map (or minimap) remains the route guide.
| Database & spatial                      | Supabase (PostgreSQL + PostGIS)                 | Weighted graphs, geofenced lots, roles; WebSocket shuttle coords          |
| Backend runtime                         | Bun + Hono                                      | A* pathfinding, predictive ETAs, API endpoints                            |
| Parking CV                              | Python + OpenCV + YOLOv8-nano / TensorFlow Lite | Stationary drone / camera clips of lot entrance/exit (e.g. Delta & Arbor) |
| Dev tunneling                           | Cloudflare Tunnels (`cloudflared`)              | HTTPS exposure of local backends for mobile device testing                |
| Push alerts                             | Flutter local/FCM push + Twilio SMS fallback    | Emergency, weather, and service disruption alerts                         |


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

- **Map / indoor 360°:** Source of truth for 2D campus geometry and floors; HawkNav still owns custom path nodes + 360° photos + minimap UX.
- **Parking:** Reuse lot polygons where export/API access allows.
- **Shuttle:** Basemap + stop placement near real entrances; live GPS, routes, schedules, and ETA stay in HawkNav (`shuttle_positions`, `shuttle-pdfs/`, Hono ETA). This Indoors app is not a shuttle tracker.
- **Access:** Feature-layer export or SDK use may need UHCL ArcGIS credentials — confirm with Facilities/GIS before depending on live services for the senior project.

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


**Implementation notes:**

- **Driver app:** `geolocator` streams GPS (`lat`, `lng`, `heading`) every 3–5 seconds (background isolate later if needed).
- **Realtime:** Writes `shuttle_positions` in Supabase; student apps subscribe via WebSockets.
- **Predictive ETA:** Hono microservice estimates arrival along route segments from historical traversal logs and a moving average.

### FR-6: Campus Indoor Navigation — Priority: High

**Description:** Interactive indoor campus map on the **shared MapView**; shortest route via Dijkstra / A\* over the custom node graph (including multi-floor links). The 2D route is the guide; FR-4’s 360° view is available at the current node for orientation.

|                |                                                  |
| -------------- | ------------------------------------------------ |
| **Input**      | User start / current location; destination area, room, or office |
| **Processing** | Build and compare routes across indoor path nodes (and floors) |
| **Output**     | Shortest node sequence; 2D route on the shared map; optional 360° at current node |

**Implementation notes:**

- UHCL indoor walkways as a weighted graph of authored **nodes** and **edges** in PostGIS / GeoJSON on top of the existing map.
- Destinations (rooms, offices, areas) resolve to nearest path node(s).
- **Mobility mode:** Stairs and steep inclines (`>8.33%` grade) get infinite weight (`w = ∞`) so A\* prefers elevators, ADA ramps, and automatic doors.
- **2D Map UI:** Overlays for accessible entrances, single-occupancy restrooms, and rest points; draws and follows the computed route (primary indoor UX).

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
[Shuttle Driver Phone] ──(GPS HTTP/WS)──> [Supabase Realtime] ──(WS Sub)──> [Student Flutter App]
                                                │
[OpenCV Gate Counter] ──(HTTP POST)─────> [Hono Backend] ───────(SQL)─────> [PostGIS Spatial DB]
                                                │
[User Search Query]  ──(API Request)────> [A* on node graph] ─(node path)─> [2D Map + 360° node viewer]
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

1. Prefer the **entire Shuttle module** (driver GPS, realtime rider UI, routes/stops/schedules, ETA service, shuttle status/alerts) unless asked otherwise.
2. Match the stack: Flutter clients (`supabase_flutter`, `geolocator`; ArcGIS MapView next), Bun + Hono services, Supabase / PostGIS for persistence and realtime. See [`docs/flutter-mobile.md`](docs/flutter-mobile.md).
3. Do not commit secrets (`.env`, keys, credentials). Use `.env.example` patterns only.
4. Keep changes scoped; do not invent unrelated modules (parking CV, indoor 360°) unless the user requests them.
5. Prefer HTTPS-reachable local backends via `cloudflared` when mobile devices need to hit APIs.
6. Prefer small, reviewable commits only when the user asks to commit.
7. Indoors: **2D path guides** node-to-node (multi-floor); **360° is view-at-node only** — do not invent live-camera AR or hardware beacons.

