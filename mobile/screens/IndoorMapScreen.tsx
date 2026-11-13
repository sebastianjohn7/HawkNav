import { useMemo, useState, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Geojson, Polyline, Marker, LatLng, PROVIDER_DEFAULT } from "react-native-maps";
import deltaFloorplan from "../assets/maps/delta_floorplan_copy.json";
import roomPinPositions from "../assets/panoramas/room_pin_positions.json";
// Wall, door and window lines pre-joined into long polylines (3,674 -> 856 on Level 1) so the map
// draws far fewer overlays. Generated: run mobile/scripts/merge_wall_lines.mjs when the floor plan changes.
import deltaWalls from "../assets/maps/delta_walls.json";
import { Ionicons } from "@expo/vector-icons";
import {
  distanceToPathMeters,
  findRouteOptions,
  findShortestPath,
  pathLengthMeters,
  snapToHallway,
  type LngLat,
  type RoutePos,
  type Via,
} from "../utils/aStarRouting.ts";
import DisplayPointInfo from "./hooks/displayPointInfo.tsx";
import RouteSearchPanel from "./hooks/RouteSearchPanel.tsx";
import { buildRoomOptions } from "../utils/roomSearch.ts";
import { EXCLUDED_UNITS } from "../utils/excludedUnits.ts";
import { isInsideRoom, panoramasForUnit } from "../utils/panoramaLookup";
import { PANORAMA_NODES } from "./PanoramaScreen.tsx";
import { PanoramaModal } from "./hooks/PanoramaLinks.tsx";

/** While a route is active, a hallway photo counts as on it if it is within this many meters of the line. */
const ROUTE_PHOTO_M = 2.2;
/** On a route that takes the stairs, photos within this many meters of the stairwell are allowed too. */
const STAIR_PHOTO_M = 6.5;
/** Height of the route summary bar, so other overlays can sit below it. */
const ROUTE_BAR_H = 56;
/** Extra height when the bar also shows the Stairs / Elevator choice. */
const ROUTE_CHOICE_H = 46;

type LevelId = "UHCL.MAIN.DELTA.L1" | "UHCL.MAIN.DELTA.L2";

const LEVELS: Array<{ id: LevelId; label: string }> = [
  { id: "UHCL.MAIN.DELTA.L1", label: "Level 1" },
  { id: "UHCL.MAIN.DELTA.L2", label: "Level 2" },
];

const rooms: string[] = [];
  for(const f of deltaFloorplan.features){
    const name = f.properties?.NAME;
    if(name && !rooms.includes(name)) rooms.push(f.properties?.NAME);
  }

/** Fit map to extracted Delta bbox (lng/lat → MapView region). */
const bbox = deltaFloorplan.bbox as [number, number, number, number];
const DELTA_REGION = {
  latitude: (bbox[1] + bbox[3]) / 2,
  longitude: (bbox[0] + bbox[2]) / 2,
  latitudeDelta: Math.max((bbox[3] - bbox[1]) * 1.6, 0.001),
  longitudeDelta: Math.max((bbox[2] - bbox[0]) * 1.6, 0.001),
};

type FC = GeoJSON.FeatureCollection;

type FloorLayers = {
  walls: FC;
  /** Room shapes (tappable). */
  units: FC;
  /** Room pins: Point features for rooms that have a photo taken inside them. */
  pins: FC;
  hallways: FC;
};

/**
 * Where a room's pin is drawn, [lat, lng], when it should not sit on the room's own Point (which
 * can lie in the hallway). Placed by hand in the middle of the room. Only the pin moves: the
 * Point, which routing and search use, is untouched.
 */
const ROOM_PIN_POSITIONS = roomPinPositions as unknown as Record<string, Record<string, [number, number]>>;

/** Split once at module load so floor switches reuse stable FeatureCollection refs. */
function splitFloor(levelId: LevelId): FloorLayers {
  const unitFeats: GeoJSON.Feature[] = [];
  const pinFeats: GeoJSON.Feature[] = [];
  const pinned = new Set<string>(); // rooms already given a hand-placed pin (some names repeat)
  const hallwayFeats: GeoJSON.Feature[] = [];

  for (const f of deltaFloorplan.features as GeoJSON.Feature[]) {
    if ((f.properties as { LEVEL_ID?: string } | null)?.LEVEL_ID !== levelId) {
      continue;
    }
    const t = f.geometry?.type;
    if (f.properties?.USE_TYPE === "HALLWAY") {
      hallwayFeats.push(f);
    } else if (t === "Polygon" || t === "MultiPolygon") {
      unitFeats.push(f);
    } else if (t === "Point") {
      // Each Point draws as a room pin, but only for rooms with a photo taken inside them, so the
      // map stays readable. Hallway photos get their own pins (PHOTO_PINS). Rooms without a pin
      // are still searchable, routable and tappable (their shape).
      const name = String(f.properties?.NAME);
      if (panoramasForUnit(levelId, name).some(isInsideRoom)) {
        const at = ROOM_PIN_POSITIONS[levelId]?.[name];
        if (!at) pinFeats.push(f);
        else if (!pinned.has(name)) {
          pinned.add(name);
          pinFeats.push({ ...f, geometry: { type: "Point", coordinates: [at[1], at[0]] } });
        }
      }
    }
    // Wall, door and window lines come from the pre-joined walls file (deltaWalls), not from here.
  }

  return {
    walls: (deltaWalls as unknown as Record<string, FC>)[levelId],
    units: { type: "FeatureCollection", features: unitFeats },
    pins: { type: "FeatureCollection", features: pinFeats },
    hallways: { type: "FeatureCollection", features: hallwayFeats },
  };
}

const Floor_Data = {
  "UHCL.MAIN.DELTA.L1": floorDataEval("UHCL.MAIN.DELTA.L1"),
  "UHCL.MAIN.DELTA.L2": floorDataEval("UHCL.MAIN.DELTA.L2")
};

/**
 * One pin per hallway photo, at the spot the photo was taken, grouped by floor once at load.
 * Photos taken inside a room are not here: they stay with that room's pin.
 */
const PHOTO_PINS: Record<LevelId, typeof PANORAMA_NODES> = {
  "UHCL.MAIN.DELTA.L1": [],
  "UHCL.MAIN.DELTA.L2": [],
};
for (const n of PANORAMA_NODES) {
  if (n.lat == null || n.lng == null || isInsideRoom(n)) continue;
  PHOTO_PINS[`UHCL.MAIN.DELTA.L${n.floor}` as LevelId]?.push(n);
}

/** The stairwells' Points in the floor plan ("LEVEL|lng,lat"), to tell a stairs hop from an elevator hop. */
const STAIR_POINTS = new Set<string>();
for (const f of deltaFloorplan.features as GeoJSON.Feature[]) {
  if (f.geometry?.type !== "Point" || f.properties?.USE_TYPE !== "STAIR" || EXCLUDED_UNITS.has(String(f.properties?.NAME))) continue;
  STAIR_POINTS.add(`${f.properties.LEVEL_ID}|${f.geometry.coordinates[0].toFixed(6)},${f.geometry.coordinates[1].toFixed(6)}`);
}

/** Rooms for the destination search; static, so built once. */
const ROOM_OPTIONS = buildRoomOptions(deltaFloorplan);

/** Name of the room closest to a spot on its floor, to describe where the demo user is. */
function nearestRoomName(pos: RoutePos): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const f of deltaFloorplan.features as GeoJSON.Feature[]) {
    if (f.geometry?.type !== "Point" || !f.properties?.NAME) continue;
    if (f.properties.LEVEL_ID !== pos.level || EXCLUDED_UNITS.has(String(f.properties.NAME))) continue;
    const [lng, lat] = f.geometry.coordinates;
    const d = (lng - pos.coords[0]) ** 2 + (lat - pos.coords[1]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = String(f.properties.NAME);
    }
  }
  return best;
}

/** Custom Room Marker */
const RoomMarker = () => (
  <View style={styles.markerContainer}>
    <Text style={styles.roomMarkerText}>R</Text>
  </View>
);

/** Display-only Delta floor plan from UHCL Indoors GeoJSON. Custom paths come later. */
export function IndoorMapScreen({tab} : {tab: string}): ReactNode {
  const [displayInfo, setDisplayInfo] = useState<GeoJSON.Feature | null>(null);
  const [endNode, setEndNode] = useState<string | null>(null);
  const [level, setLevel] = useState<LevelId>("UHCL.MAIN.DELTA.L1");

  // Demo user: stands in for the real indoor position until beacons are integrated. When that
  // lands, replace this state with the beacon-derived position; routing only reads `userPos`.
  const [userPos, setUserPos] = useState<RoutePos>(
    () =>
      snapToHallway(deltaFloorplan, [DELTA_REGION.longitude, DELTA_REGION.latitude], "UHCL.MAIN.DELTA.L1") ?? {
        coords: [DELTA_REGION.longitude, DELTA_REGION.latitude],
        level: "UHCL.MAIN.DELTA.L1",
      },
  );
  // Tap the demo user to pick them up, then tap the map to drop them. Plain map taps do nothing.
  const [userSelected, setUserSelected] = useState(false);

  /** Drop the demo user at a tapped spot on the floor being viewed, snapped to the nearest hallway. */
  const placeUser = (coords: LngLat) => {
    const snapped = snapToHallway(deltaFloorplan, coords, level);
    if (snapped) setUserPos(snapped);
    setUserSelected(false);
  };

  // Height of the search panel, so cards and buttons sit below it.
  const [panelHeight, setPanelHeight] = useState(96);

  const currentLabel = useMemo(() => {
    const near = nearestRoomName(userPos);
    const floor = userPos.level.endsWith("L2") ? "Level 2" : "Level 1";
    return `Demo user · ${floor}${near ? `, near ${near}` : ""}`;
  }, [userPos]);

  // Leave placement mode when the screen is hidden.
  useEffect(() => {
    if (tab !== "find") setUserSelected(false);
  }, [tab]);

  // Only mount the active floor. Dual-mount + style toggle froze the UI
  // (react-native-maps rewrites thousands of native overlays on each style change).
  const layers = FLOOR_LAYERS[level];

  // How a route that changes floors gets between them. null: the shorter of the two (the default).
  const [via, setVia] = useState<Via | null>(null);

  // Route from the demo user to endNode. Split per floor so a line never clips through the other floor.
  const route = useMemo(() => {
    if (!endNode) return null;
    // A trip that changes floors can go by stairs or by elevator. When both work, both are offered
    // (`choices`, in meters) and `chosen` is the one drawn: the pick, else the shorter walk.
    const options = findRouteOptions(deltaFloorplan, userPos, endNode);
    const metersOf = (r: Array<{ coords: LngLat }>) => pathLengthMeters(r.map((p) => p.coords));
    const both = options.changesFloors && options.stairs && options.elevator;
    const choices = both ? { stairs: metersOf(options.stairs!), elevator: metersOf(options.elevator!) } : null;
    const chosen: Via | null = choices ? (via ?? (choices.stairs <= choices.elevator ? "stairs" : "elevator")) : null;
    const points = (
      chosen
        ? (chosen === "stairs" ? options.stairs! : options.elevator!)
        : findShortestPath(deltaFloorplan, userPos, endNode)
    ).filter((p) => p.level !== "");
    const lines: Record<LevelId, LatLng[]> = { "UHCL.MAIN.DELTA.L1": [], "UHCL.MAIN.DELTA.L2": [] };
    const paths: Record<LevelId, LngLat[]> = { "UHCL.MAIN.DELTA.L1": [], "UHCL.MAIN.DELTA.L2": [] };
    for (const point of points) {
      const id = point.level as LevelId;
      if (!lines[id]) continue;
      lines[id].push({ latitude: point.coords[1], longitude: point.coords[0] });
      paths[id].push(point.coords);
    }
    const found = points.length > 0;
    // Where the route changes floors, and whether it does so by the stairs.
    const hopAt = points.findIndex((p, i) => i > 0 && p.level !== points[i - 1].level);
    const hop = hopAt > 0 ? points[hopAt - 1] : null;
    const byStairs = !!hop && STAIR_POINTS.has(`${hop.level}|${hop.coords[0].toFixed(6)},${hop.coords[1].toFixed(6)}`);
    return {
      found,
      lines,
      paths,
      stairHop: byStairs ? hop : null,
      meters: pathLengthMeters(points.map((p) => p.coords)),
      dest: found ? points[points.length - 1] : null,
      floors: LEVELS.filter((l) => paths[l.id].length > 0).map((l) => l.label),
      choices,
      chosen,
    };
  }, [endNode, userPos, via]);

  // The 360° photos that may be seen during a route: the hallway photos on the route line, plus
  // the destination room's own (including inside it). Null means no restriction (no route).
  const allowedPhotoIds = useMemo<ReadonlySet<string> | null>(() => {
    if (!route?.found || !route.dest || !endNode) return null;
    const ids = new Set<string>();
    for (const l of LEVELS) {
      for (const n of PHOTO_PINS[l.id]) {
        if (distanceToPathMeters([n.lng!, n.lat!], route.paths[l.id]) <= ROUTE_PHOTO_M) ids.add(n.id);
      }
    }
    for (const p of panoramasForUnit(route.dest.level, endNode)) ids.add(p.id);
    // Taking the stairs: also allow the photos around the stairwell on both floors (the Main Hallway
    // photo at its foot and the Staircase photo above), so you can walk from the hallway up to the
    // Staircase photo and back down. Without this the arrows between them are hidden.
    const hop = route.stairHop;
    if (hop) {
      for (const l of LEVELS) {
        for (const n of PHOTO_PINS[l.id]) {
          if (distanceToPathMeters([n.lng!, n.lat!], [hop.coords]) <= STAIR_PHOTO_M) ids.add(n.id);
        }
      }
    }
    return ids;
  }, [route, endNode]);

  // Room pins on the map: all of them normally, only the destination's during a route.
  const roomPins = useMemo<FC>(() => {
    if (!route?.found) return layers.pins;
    return {
      type: "FeatureCollection",
      features: layers.pins.features.filter((f) => f.properties?.NAME === endNode),
    };
  }, [route, endNode, layers]);

  // Custom-view markers are snapshotted while this is true. Keep it on briefly after the floor
  // changes, then turn it off so the static room pins stop being re-rendered.
  const [markersTrack, setMarkersTrack] = useState(true);
  useEffect(() => {
    setMarkersTrack(true);
    const t = setTimeout(() => setMarkersTrack(false), 600);
    return () => clearTimeout(t);
  }, [level]);

  // Route bar: after picking a destination you preview it, then Start (zoom to it) or Cancel.
  const mapRef = useRef<MapView>(null);
  const [navigating, setNavigating] = useState(false);
  useEffect(() => {
    setNavigating(false);
    setVia(null); // a new destination starts on the shorter way again
  }, [endNode]);

  const destLabel = endNode ? (ROOM_OPTIONS.find((r) => r.name === endNode)?.label ?? endNode) : "";
  // The bar grows to hold the Stairs / Elevator choice while previewing a route that has one.
  const showChoice = !!route?.found && !!route.choices && !navigating;
  const routeBarH = ROUTE_BAR_H + (showChoice ? ROUTE_CHOICE_H : 0);
  // Everything that floats over the map sits below the search panel, and below the route bar when shown.
  const overlayTop = panelHeight + 8 + (endNode ? routeBarH + 8 : 0);

  const startRoute = () => {
    setNavigating(true);
    if (!route?.found) return;
    const here = route.lines[level];
    const coords =
      here.length > 0
        ? here
        : (LEVELS.map((l) => route.lines[l.id]).find((line) => line.length > 0) ?? []);
    if (coords.length === 0) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: overlayTop + 60, right: 50, bottom: 160, left: 90 },
      animated: true,
    });
  };

  /** Tapping a room: place the demo user there while placing, otherwise open its card. */
  const onFeaturePress = (feature: GeoJSON.Feature) => {
    if (userSelected) {
      // Room pins are Points; dropping on one places the user at that spot.
      const g = feature.geometry;
      if (g.type === "Point") placeUser([g.coordinates[0], g.coordinates[1]]);
      return;
    }
    setDisplayInfo(feature);
  };

  // The hallway photo pin that was tapped; its 360° viewer opens full screen.
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  return (tab === "find" && (
    <View style={styles.container}>
      {/*Parent Container */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={DELTA_REGION}
        mapType="standard"
        // Native ignores bottom/left of 0 (falsy). Stack in bottom-left:
        // Apple logo above, Legal underneath.
        appleLogoInsets={{ left: 8, bottom: 8, right: 0, top: 0 }}
        legalLabelInsets={{ top: 0, right: 0, bottom: 8, left: 8 }}
        // Only a drop target while the demo user is picked up.
        onPress={(e) => {
          if (!userSelected) return;
          const { longitude, latitude } = e.nativeEvent.coordinate;
          placeUser([longitude, latitude]);
        }}
      >
        {/* Demo user: shown only on the floor they stand on. Tap to pick up / put down. */}
        {userPos.level === level && (
          <Marker
            key={`user-${userSelected}`}
            coordinate={{ longitude: userPos.coords[0], latitude: userPos.coords[1] }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={20}
            onPress={() => setUserSelected((s) => !s)}
          >
            <View style={[styles.userDot, userSelected && styles.userDotSelected]}>
              <Ionicons name="person" size={18} color="#fff" />
            </View>
          </Marker>
        )}
        {/* Destination: always marked, whether or not the room has a photo pin. */}
        {route?.dest && route.dest.level === level && (
          <Marker
            key={`dest-${endNode}`}
            coordinate={{ longitude: route.dest.coords[0], latitude: route.dest.coords[1] }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={15}
          >
            <View style={styles.destPin}>
              <Ionicons name="flag" size={18} color="#fff" />
            </View>
          </Marker>
        )}
        <Geojson
          key={`${level}-units-${userSelected}`}
          geojson={layers.units}
          strokeColor="#1E3A8A"
          strokeWidth={1}
          fillColor="rgba(147, 197, 253, 0.35)"
          color="#9094a0"
          // While placing the demo user, room shapes stop catching taps so the map gets them.
          tappable={!userSelected}
          onPress={(object) => onFeaturePress(object.feature)}
        />
        {/* Room pins: only rooms with a photo taken inside them. */}
        <Geojson
          key={`${level}-pins-${route?.found ? endNode : "all"}`}
          geojson={roomPins}
          color="#9094a0"
          markerComponent={<RoomMarker />}
          tracksViewChanges={markersTrack}
          onPress={(object) => onFeaturePress(object.feature)}
        />
        {/* Hallway photo pins, at the spot each photo was taken. Tap to open it. During a route
            only the photos on it are shown. */}
        {PHOTO_PINS[level].filter((n) => !allowedPhotoIds || allowedPhotoIds.has(n.id)).map((n) => (
          <Marker
            key={n.id}
            coordinate={{ latitude: n.lat!, longitude: n.lng! }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={12}
            tracksViewChanges={markersTrack}
            onPress={() => {
              // While placing the demo user, a pin is just a spot to drop them on.
              if (userSelected) placeUser([n.lng!, n.lat!]);
              else setOpenPhotoId(n.id);
            }}
          >
            <View style={styles.photoPin}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </Marker>
        ))}

        {/* Hallways LineString display (off by default; re-enable to debug routing):
        <Geojson
          key={`${level}-hallways`}
          geojson={layers.hallways}
          strokeColor="#f4f9f6"
          strokeWidth={1.5}
          fillColor="transparent"
          tappable={false}
        />
        */}
        
        {/* Points*/}
        {<Geojson
          geojson={currentFloor.units}
          strokeColor={"#1E3A8A"}
          strokeWidth={1}
          fillColor={"rgba(147, 197, 253, 0.35)"}
          color= {"#9094a0"}
          onPress={(object) => setDisplayInfo(object.feature)}
        />}
        <Geojson
          geojson={currentFloor.walls}
          strokeColor={"#33553a"}
          strokeWidth={1.5}
          fillColor="transparent"
          tappable={false}
        />

        {/* Only the active floor's leg of the route is mounted. */}
        {route?.found && route.lines[level].length > 0 ? (
          <Polyline
            key={`route-${level}`}
            coordinates={route.lines[level]}
            strokeColor="#2563EB"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
            zIndex={10}
          />
        ) : null}
      </MapView>

      {/* Route bar: preview (Start / Cancel), navigating (End), or no route found. */}
      {route && (
        <View style={[styles.routeBar, { top: panelHeight + 8, height: routeBarH }]}>
          <View style={styles.routeRow}>
            <View style={styles.routeBarText}>
              {!route.found ? (
                <Text style={styles.routeTitle} numberOfLines={1}>
                  No route found to {destLabel}
                </Text>
              ) : navigating ? (
                <>
                  <Text style={styles.routeTitle} numberOfLines={1}>
                    Navigating to {destLabel}
                  </Text>
                  <Text style={styles.routeMeta} numberOfLines={1}>
                    {Math.round(route.meters)} m · {route.floors.join(" → ")}
                    {route.chosen ? ` · by ${route.chosen}` : ""}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.routeTitle} numberOfLines={1}>
                    Route to {destLabel}
                  </Text>
                  <Text style={styles.routeMeta} numberOfLines={1}>
                    {Math.round(route.meters)} m · {route.floors.join(" → ")}
                  </Text>
                </>
              )}
            </View>
            {route.found && !navigating && (
              <Pressable style={styles.routeStart} onPress={startRoute} accessibilityLabel="Start route">
                <Text style={styles.routeStartText}>Start</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.routeCancel}
              onPress={() => setEndNode(null)}
              accessibilityLabel={navigating ? "End route" : "Cancel route"}
            >
              <Text style={styles.routeCancelText}>{navigating ? "End" : "Cancel"}</Text>
            </Pressable>
          </View>
          {/* Two ways to change floors: tap one to switch the route to it. */}
          {showChoice && route.choices && (
            <View style={styles.routeChoices}>
              {(["stairs", "elevator"] as const).map((v) => {
                const on = route.chosen === v;
                return (
                  <Pressable
                    key={v}
                    style={[styles.routeChoice, on && styles.routeChoiceOn]}
                    onPress={() => setVia(v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Go by ${v}`}
                  >
                    <Ionicons name={v === "stairs" ? "walk" : "swap-vertical"} size={16} color={on ? "#fff" : "#1D4ED8"} />
                    <Text style={[styles.routeChoiceText, on && styles.routeChoiceTextOn]}>
                      {v === "stairs" ? "Stairs" : "Elevator"} · {Math.round(route.choices![v])} m
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Placement hint, or a way to bring the demo user to this floor if they are elsewhere. */}
      {userSelected ? (
        <View style={[styles.userHint, { top: overlayTop }]}>
          <Text style={styles.userHintText}>Tap the map to place the demo user</Text>
          <Pressable onPress={() => setUserSelected(false)}>
            <Text style={styles.userHintCancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : userPos.level !== level ? (
        <Pressable style={[styles.userHint, { top: overlayTop }]} onPress={() => setUserSelected(true)}>
          <Text style={styles.userHintText}>Demo user is on the other floor. Tap to move them here</Text>
        </Pressable>
      ) : null}

      {/* Floor switcher, floating on the left under the search panel. */}
      <View style={[styles.levelCol, { top: overlayTop + 48 }]}>
        {LEVELS.map((l) => {
          const on = level === l.id;
          return (
            <Pressable
              key={l.id}
              style={[styles.levelBtn, on && styles.levelBtnOn]}
              onPress={() => {
                setLevel(l.id);
                setDisplayInfo(null);
                setUserSelected(false);
              }}
            >
              <Text style={[styles.levelText, on && styles.levelTextOn]}>{l.label}</Text>
            </Pressable>
          );
        })}
      </View>

      { /* Displays Current Selected room info to users */}
      {displayInfo && (
        <>
          <Pressable
            style={styles.backdrop}
            onPress={() => setDisplayInfo(null)}
          ></Pressable>
          <DisplayPointInfo
            object={displayInfo}
            setEndNode={setEndNode}
            setDisplayInfo={setDisplayInfo}
            top={overlayTop}
            allowedPhotoIds={allowedPhotoIds}
          />
        </>
      )}

      {/* From (demo user) / To (room search). Last so its results list draws over everything. */}
      <RouteSearchPanel
        currentLabel={currentLabel}
        rooms={ROOM_OPTIONS}
        destination={endNode}
        onSelectDestination={(name) => {
          setEndNode(name);
          setDisplayInfo(null);
          setUserSelected(false);
        }}
        onClearDestination={() => setEndNode(null)}
        onHeightChange={setPanelHeight}
      />

      {/* The 360° viewer for a tapped hallway photo pin. */}
      <PanoramaModal nodeId={openPhotoId} allowedIds={allowedPhotoIds} onClose={() => setOpenPhotoId(null)} />
    </View>
  ));
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  levelCol: {
    position: "absolute",
    left: 10,
    gap: 6,
    zIndex: 996,
  },
  levelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  levelBtnOn: { backgroundColor: "#1D4ED8" },
  levelText: { fontWeight: "600", color: "#111" },
  levelTextOn: { color: "#fff" },
  map: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    height: '100%',
    width: '100%',
    opacity: 0.1,
    zIndex: 997
  },
  userDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  userDotSelected: {
    backgroundColor: "#F59E0B",
    borderWidth: 3,
    borderColor: "#1D4ED8",
  },
  destPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#16A34A",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  routeBar: {
    position: "absolute",
    left: 10,
    right: 10,
    // height is set at render: ROUTE_BAR_H, plus ROUTE_CHOICE_H when the Stairs / Elevator choice shows
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D1D5DB",
    zIndex: 996,
    elevation: 20,
  },
  routeRow: {
    height: ROUTE_BAR_H - 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeChoices: { flexDirection: "row", gap: 8, paddingBottom: 8 },
  routeChoice: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1D4ED8",
    backgroundColor: "#fff",
  },
  routeChoiceOn: { backgroundColor: "#1D4ED8" },
  routeChoiceText: { fontWeight: "700", color: "#1D4ED8" },
  routeChoiceTextOn: { color: "#fff" },
  routeBarText: { flex: 1, justifyContent: "center" },
  routeTitle: { fontWeight: "700", color: "#111827" },
  routeMeta: { color: "#6B7280", fontSize: 12 },
  routeStart: {
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  routeStartText: { color: "#fff", fontWeight: "700" },
  routeCancel: { paddingHorizontal: 8, paddingVertical: 8 },
  routeCancelText: { color: "#DC2626", fontWeight: "700" },
  userHint: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    zIndex: 996,
  },
  userHintText: { color: "#fff", fontWeight: "600" },
  userHintCancel: { color: "#93C5FD", fontWeight: "700" },
  photoPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#573dec",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  markerContainer: {
    backgroundColor: '#573dec',
    padding: 10,
    borderRadius: 20,
    borderColor: '#fff',
    borderWidth: 1
  },
  roomMarkerText: {
    fontSize: 15,
    color: '#fff'
  }
});
