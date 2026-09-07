

# HawkNav Project Context Document

This document is the complete technical, operational, and structural context for **HawkNav**. AI agents and team members should read it at the start of every session before making changes.

---

## 1. Project Overview & Meta Information

| Field | Value |
| --- | --- |
| **Project Name** | HawkNav |
| **Tagline** | An All-in-One Campus Mobility App for UHCL |
| **Problem** | Fixes campus information gaps across shuttle tracking, campus navigation, parking congestion, and emergency notifications |
| **Course & Term** | CSCI 4388 Senior Project, Fall 2026, University of Houston–Clear Lake (UHCL) |
| **Team Name** | Team Odyssey |
| **Motto** | *From 20 years to 20 seconds* |
| **Vision** | *Take the guesswork out of it* |

### Target Metrics

- Implement 90% of core use cases by Week 15.
- Enable 90% of users to locate their route in under 5 minutes.

---

## 2. Team Structure & Sub-Team Roles

Seven CS majors, organized into specialized sub-teams:

| Member Name | Meeting Roles | Technical Sub-Team | Core Focus Area |
| --- | --- | --- | --- |
| **Sebastian John** | Coordinator | Shuttle Team | Driver app, GPS location streaming, realtime shuttle updates |
| **Saikiran Saragadam** | Facilitator | Shuttle Team | Shuttle backend algorithms, predictive ETA calculation |
| **Joshua E. White** | Timekeeper | Map & AR Team | ArcGIS/Mapbox routing graph, ViroReact AR wayfinding |
| **Ayaan N. Syed** | Scribe | Map Team | Accessible pathfinding graph, UHCL GeoJSON overlays |
| **Rashid Amer** | Timekeeper | AR Team | AR camera overlay, directional vector anchors |
| **Philip J. Abraham** | Scribe | Parking CV Team | Computer Vision gate counter, OpenCV vehicle detection |
| **Sujeeth Muruganandam** | Coordinator | Parking CV Team | Parking occupancy engine, class-schedule density model |

### Repo ownership note (this workspace)

This clone (`HawkNav-seb`) is Sebastian John’s working tree. Prefer changes scoped to the **Shuttle Team** surface (driver app, GPS streaming, realtime shuttle updates) unless the user explicitly asks for cross-team work.

---

## 3. Technology Stack & Infrastructure

Designed to minimize hardware dependencies while supporting cross-platform mobile access, spatial graph processing, and real-time streaming.

| Layer | Choice | Notes |
| --- | --- | --- |
| Mobile frontend | React Native + Expo Go | Native access for background GPS, AR camera, push alerts |
| Maps & wayfinding | Mapbox SDK / ArcGIS SDK | Custom GeoJSON for walkways, buildings, ADA ramps, parking lots |
| Augmented reality | ViroReact | Bridged to iOS ARKit and Android ARCore; floating 3D directional vectors |
| Database & spatial | Supabase (PostgreSQL + PostGIS) | Weighted graphs, geofenced lots, roles; WebSocket shuttle coords |
| Backend runtime | Bun + Hono | A* pathfinding, predictive ETAs, API endpoints |
| Parking CV | Python + OpenCV + YOLOv8-nano / TensorFlow Lite | Stationary drone clips of lot entrance/exit |
| Dev tunneling | Cloudflare Tunnels (`cloudflared`) | HTTPS exposure of local backends for mobile device testing |
| Push alerts | Expo Push Notifications + Twilio SMS fallback | Emergency, weather, and service disruption alerts |

---

## 4. Core Functional Modules

### Module 1: Live Shuttle Service

- **Driver App:** Native on the shuttle driver’s phone; `expo-location` + `TaskManager` streams GPS (`lat`, `lng`, `heading`) every 3–5 seconds.
- **Real-time Streaming:** Writes `shuttle_positions` in Supabase; student apps subscribe via WebSockets.
- **Predictive ETA Engine:** Hono microservice computes arrival times along route segments from historical traversal logs and a moving average.

### Module 2: Accessible Campus Navigation & AR Wayfinding

- **Spatial Accessibility Graph:** UHCL pathways in PostGIS as weighted graph `(N, E)`.
- **Mobility Mode:** Stairs and steep inclines (`>8.33%` grade) get infinite weight (`w = ∞`) so A* prefers elevators, ADA ramps, and automatic doors.
- **2D Map UI:** Mapbox overlays filter accessible entrances, single-occupancy restrooms, and rest points.
- **AR Overlay Engine:** GPS + magnetometer heading → directional vectors. Indoor: QR/image markers at entrances anchor origin `(0,0,0)` without ceiling beacons.

### Module 3: Parking Congestion Subsystem

**Phase 1 — Schedule Density & Geofencing**

- Cross-reference UHCL course schedules (building + start times) with building-to-lot mappings.
- Combine with geofenced crowdsourced student check-ins to estimate occupancy.

**Phase 2 — OpenCV Gate Counter**

- **Input:** Looped, stationary drone MP4 clips of entrance/exit chokepoints.
- **Mechanism:** Two parallel virtual tripwires (`Line_In`, `Line_Out`). Crossing `Line_In → Line_Out` increments entries; `Line_Out → Line_In` increments exits.
- **Sync:** Occupancy percentage → Supabase levels `LOW` | `MEDIUM` | `HIGH` | `FULL`.

**Permit Warning**

- Push notification when a student’s GPS enters a Faculty/Staff lot polygon during enforcement hours (citation prevention).

---

## 5. System Data Flow

```text
[Shuttle Driver Phone] ──(GPS HTTP/WS)──> [Supabase Realtime] ──(WS Sub)──> [Student Expo App]
                                                │
[OpenCV Gate Counter] ──(HTTP POST)─────> [Hono Backend] ───────(SQL)─────> [PostGIS Spatial DB]
                                                │
[User Search Query]  ──(API Request)────> [A* Routing Engine] ─(GeoJSON)─> [Mapbox / ViroReact]
```

---

## 6. Operational & Team Ground Rules

- **Scrum:** Weekly Kanban reviews every Tuesday before class and Thursday at 5:30 PM.
- **Decisions:** Majority rule; consensus preferred.
- **Individual reporting:** Each member submits a weekly report (research, meeting, design, coding, testing hours).
- **Team reporting:** Executive summary, deliverables, risk logs, and schedule status via the CSCI 4388 Team Report template.

---

## 7. Agent Working Guidelines

When starting a new session on this repo:

1. Prefer Shuttle Team work (driver app, GPS streaming, `shuttle_positions`, ETA APIs) unless asked otherwise.
2. Match the stack: Expo/React Native clients, Bun + Hono services, Supabase/PostGIS for persistence and realtime.
3. Do not commit secrets (`.env`, keys, credentials). Use `.env.example` patterns only.
4. Keep changes scoped; do not invent unrelated modules (parking CV, AR) unless the user requests them.
5. Prefer HTTPS-reachable local backends via `cloudflared` when mobile devices need to hit APIs.
6. Prefer small, reviewable commits only when the user asks to commit.
