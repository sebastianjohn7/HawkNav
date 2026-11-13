/** Build a tiny undirected graph from corridor LineStrings + room Points, then Dijkstra. */

import { EXCLUDED_UNITS } from "./excludedUnits.ts";
import { ROOM_ENTRANCES } from "./roomEntrances.ts";

export type LngLat = [number, number];

/** How a connection between floors (or within one stairwell) is travelled. */
export type Via = "stairs" | "elevator";

/** A spot on a specific floor, e.g. where the demo user is standing. level is a LEVEL_ID. */
export type RoutePos = { coords: LngLat; level: string };

type Graph = {
  nodes: Map<string, LngLat>; // Used for Djikstra referencing
  edges: Map<string, Array<{ to: string; weight: number; via?: Via }>>;
  roomToNode: Map<string, string>; // Used for User referencing
  hallwayByLevel: Map<string, Array<{ id: string; coord: LngLat }>>; // Walkable points per floor
};

function keyOf(c: LngLat, levelId: string): string {
  return `${levelId}_${c[0].toFixed(6)},${c[1].toFixed(6)}`;
}

function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Length of a path in meters, summing straight segments between its [lng, lat] points. */
export function pathLengthMeters(path: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += haversineMeters(path[i - 1], path[i]);
  return total;
}

/**
 * Shortest distance in meters from a point to a path, measured to its segments (not just its
 * corners). Uses a flat local projection, accurate at building scale. Infinity for an empty path.
 */
export function distanceToPathMeters(p: LngLat, path: LngLat[]): number {
  if (path.length === 0) return Infinity;
  const mPerDegLat = 110540;
  const mPerDegLng = 111320 * Math.cos((p[1] * Math.PI) / 180);
  // Work in meters relative to p, so p is the origin.
  const pts = path.map(([lng, lat]) => [(lng - p[0]) * mPerDegLng, (lat - p[1]) * mPerDegLat] as const);
  if (pts.length === 1) return Math.hypot(pts[0][0], pts[0][1]);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // Fraction along the segment of the point closest to the origin, kept within the segment.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

function addEdge(graph: Graph, a: string, b: string, weight: number, via?: Via) {
  if (!graph.edges.has(a)) graph.edges.set(a, []);
  if (!graph.edges.has(b)) graph.edges.set(b, []);
  graph.edges.get(a)!.push({ to: b, weight, via });
  graph.edges.get(b)!.push({ to: a, weight, via });
}

export function buildGraphFromGeoJson(geojson: {
  features: Array<{
    properties?: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }>;
}): Graph {
  const graph: Graph = {
    nodes: new Map(),
    edges: new Map(),
    roomToNode: new Map(),
    hallwayByLevel: new Map(),
  };

  const hallwayPointsByLevel = graph.hallwayByLevel;
  const stairs = new Map<string, {id: string; coord: LngLat, level: string}[]>();
  const elevators = new Map<string, {id: string; coord: LngLat, level: string}[]>();
  const rooms: Array<{id: string, coord: LngLat, level: string}> = [];
  const stairsByLevel = new Map<string, Array<{ id: string; coord: LngLat, level: string}>>();
  const elevatorsByLevel = new Map<string, Array<{ id: string; coord: LngLat, level: string}>>();

  // 1. Process HALLWAY LineStrings
  for(const f of geojson.features){
    const levelId = String(f.properties?.LEVEL_ID ?? "");
    const unitId = f.properties?.UNIT_ID ? String(f.properties?.UNIT_ID) : "";
    const name = f.properties?.NAME ? String(f.properties?.NAME) : "";
    // Units the app ignores (e.g. a stairwell students don't use) never enter the graph.
    if(EXCLUDED_UNITS.has(name)) continue;

    if(f.properties?.USE_TYPE === 'HALLWAY' && f.geometry.type === 'LineString'){
      // Hallways
      const rawCoords = f.geometry.coordinates as number[][];
      //process the coordinates
      const coords: LngLat[] = rawCoords.map((c) => [c[0], c[1]]);

      // Add each coordinate point into graph nodes and hallwayPointsByLevel
      for(let i = 0 ; i < coords.length ; i++){
        const coordId = keyOf(coords[i], levelId);
        graph.nodes.set(coordId, coords[i]);
        // If the floor LEVEL_ID doesn't exist, add it
        if(!hallwayPointsByLevel.has(levelId)) hallwayPointsByLevel.set(levelId, []);
        // Add the coord into hallway points
        hallwayPointsByLevel.get(levelId)!.push({id: coordId, coord: coords[i]});

        // Add an edge between each hallway coordinate
        if(i < coords.length - 1){
          const nextCoordId = keyOf(coords[i+1], levelId);
          const distance = haversineMeters(coords[i], coords[i + 1]);
          addEdge(graph, coordId, nextCoordId, distance);
        }
      }

    }

    else if(f.properties?.USE_TYPE === 'STAIR' && f.geometry.type === 'Point'){
      // Stairs
      const rawCoords = f.geometry.coordinates as number[];
      const coords: LngLat = [rawCoords[0], rawCoords[1]];
      const nodeId = keyOf(coords, levelId);
      
      // Add to nodes and stairs map
      graph.nodes.set(nodeId, coords);
      if(unitId) graph.roomToNode.set(unitId, nodeId);
      if(name) graph.roomToNode.set(name, nodeId);

      if(!stairs.has(name)) stairs.set(name, []);
      if(!stairsByLevel.has(levelId)) stairsByLevel.set(levelId, []);
      stairs.get(name)!.push({id: nodeId, coord: coords, level: levelId});
      stairsByLevel.get(levelId)!.push({id: nodeId, coord: coords, level: levelId});
    }

    else if(f.properties?.USE_TYPE === 'ELEVATOR' && f.geometry.type === 'Point'){
      // Elevators
      const rawCoords = f.geometry.coordinates as number[];
      const coords: LngLat = [rawCoords[0], rawCoords[1]];
      const nodeId = keyOf(coords, levelId);

      // Add to nodes and elevators map
      graph.nodes.set(nodeId, coords);
      if(unitId) graph.roomToNode.set(unitId, nodeId);
      if(name) graph.roomToNode.set(name, nodeId);

      if(!elevators.has(name)) elevators.set(name, []);
      if(!elevatorsByLevel.has(levelId)) elevatorsByLevel.set(levelId, []);
      elevators.get(name)!.push({id: nodeId, coord: coords, level: levelId});
      elevatorsByLevel.get(levelId)!.push({id: nodeId, coord: coords, level: levelId});
    }

    else if(f.geometry.type === "Point"){
      //Rooms
      const rawCoords = f.geometry.coordinates as number[];
      // A room can end its routes at its front door instead of at its Point (see roomEntrances.ts).
      const coords: LngLat = ROOM_ENTRANCES[levelId]?.[name] ?? [rawCoords[0], rawCoords[1]];
      const nodeId = keyOf(coords, levelId);

      // Add to nodes, roomToNode, and rooms
      graph.nodes.set(nodeId, coords);
      if(unitId) graph.roomToNode.set(unitId, nodeId);
      if(name) graph.roomToNode.set(name, nodeId);
      rooms.push({id: nodeId, coord: coords, level: levelId});
    }
  }

  // Map same staircase between floors
  for(const [, s] of stairs){
    for(let i = 0 ; i < s.length ; i++){
      for(let j = i+1 ; j < s.length ; j++){
        addEdge(graph, s[i].id, s[j].id, 15, "stairs");
      }
    }
  }

  // Map same elevators between floors
  for(const [, e] of elevators){
    if(e.length === 1) continue;
    for(let i = 0 ; i < e.length ; i++){
      for(let j = i+1 ; j < e.length ; j++){
        addEdge(graph, e[i].id, e[j].id, 10, "elevator");
      }
    }
  }

  // add edges between hallwayPoints and the nearest point based on input
  const nearestPointToHallway = (hallway: Array<{id: string; coord: LngLat}>,
    pointList: Array<{id: string; coord: LngLat; level: string}>, 
    radius: number) => 
    {
      if(pointList.length === 0) return "pointList is Undefined";
      //const hallway = hallwayPointsByLevel.get(pointList[0].level) ?? [];
      if(!hallway || hallway.length === 0) return;

      // Check each point on the given list
      for(const point of pointList){
        let closestPoint: string | null = null;
        let minDistance: number = Infinity;

        // Loop and find the closest HallwayPoint
        for(const hallwayPoint of hallway){
          const distance = haversineMeters(point.coord, hallwayPoint.coord);
          if(distance < minDistance) {
            closestPoint = hallwayPoint.id;
            minDistance = distance;
          }
        }

        // Add an edge to between the two points
        if(closestPoint && minDistance < radius){
          addEdge(graph, point.id, closestPoint, minDistance);
        }
      }
    }
  //console.log("\n\n", hallwayPointsByLevel);

  // Perform edge generations by floor
  for(const [hallwayLevel, hallway] of hallwayPointsByLevel){
    const floorRooms = rooms.filter((room) => room.level === hallwayLevel);
    const floorStairs = stairsByLevel.get(hallwayLevel) ?? [];
    const floorElevators = elevatorsByLevel.get(hallwayLevel) ?? [];

    // RUN THAT SHIT!!!!!!!!!!!!!!!!!!!!!!!
    nearestPointToHallway(hallway, floorRooms, 30);
    nearestPointToHallway(hallway, floorStairs, 30);
    nearestPointToHallway(hallway, floorElevators, 30);
  }
  return graph;
}

type GeoJsonInput = Parameters<typeof buildGraphFromGeoJson>[0];

// The floor plan never changes at runtime, so build its graph once per GeoJSON object.
const graphCache = new WeakMap<object, Graph>();

function getGraph(geojson: GeoJsonInput): Graph {
  let graph = graphCache.get(geojson);
  if (!graph) {
    graph = buildGraphFromGeoJson(geojson);
    graphCache.set(geojson, graph);
  }
  return graph;
}

/**
 * Nearest walkable (hallway) point to a tapped spot on the given floor, or null if the floor has
 * none. Used to keep the demo user on the hallway network so routing always has a valid start.
 */
export function snapToHallway(
  geojson: GeoJsonInput,
  coords: LngLat,
  level: string,
): RoutePos | null {
  const points = getGraph(geojson).hallwayByLevel.get(level);
  if (!points || points.length === 0) return null;
  let best: LngLat | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    const d = haversineMeters(coords, p.coord);
    if (d < bestDist) {
      bestDist = d;
      best = p.coord;
    }
  }
  return best ? { coords: best, level } : null;
}

/**
 * Shortest path between a start and a room. The start is a room name (e.g. "205") or a RoutePos
 * (a spot on a floor, e.g. the demo user); the end is a room name. `avoid` rules out the stairs or
 * the elevator, so the route has to use the other one to change floors.
 */
export function findShortestPath(
  geojson: GeoJsonInput,
  startRoomId: string | RoutePos | null,
  endRoomId: string | null,
  avoid?: Via,
): Array<{ coords: LngLat, level: string }> {
  const emptyDefault: Array<{ coords: LngLat, level: string }> = [{ coords: [0, 0], level: "" }];
  if(!startRoomId || !endRoomId) {
    console.log("Missing Routing Information");
    return emptyDefault;
  }
  const graph = getGraph(geojson);
  let start: string | undefined;
  if (typeof startRoomId === "string") {
    start = graph.roomToNode.get(startRoomId);
  } else {
    // Positions come from snapToHallway, so the exact node normally exists; snap again if not.
    const exact = keyOf(startRoomId.coords, startRoomId.level);
    start = graph.nodes.has(exact)
      ? exact
      : (() => {
          const snapped = snapToHallway(geojson, startRoomId.coords, startRoomId.level);
          return snapped ? keyOf(snapped.coords, snapped.level) : undefined;
        })();
  }
  const end = graph.roomToNode.get(endRoomId);
  //console.log(`Start: ${start}, End: ${end}`);
  if (!start || !end) {
    !start ? console.log(`Starting Point is: ${start}`) : console.log(`Ending Point is: ${end}`);
    return emptyDefault;
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const remaining = new Set(graph.nodes.keys());
  for (const id of remaining) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }
  dist.set(start, 0);

  while (remaining.size > 0) {
    let u: string | null = null;
    let best = Infinity;
    for (const id of remaining) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null || best === Infinity) break;
    remaining.delete(u);
    if (u === end) break;

    for (const { to, weight, via } of graph.edges.get(u) ?? []) {
      if (!remaining.has(to)) continue;
      if (avoid && via === avoid) continue; // the connection the caller wants to stay off
      const alt = best + weight;
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt);
        prev.set(to, u);
      }
    }
  }

  if ((dist.get(end) ?? Infinity) === Infinity) {
    console.log("ERROR: Infinite distance");
    return emptyDefault;
  }

  const pathIds: string[] = [];
  let cur: string | null = end;
  while (cur) {
    pathIds.push(cur);
    //console.log(`\n\nAdding ${cur.substring(0, 18)} to pathLine list\n\n`);
    cur = prev.get(cur) ?? null;
  }
  pathIds.reverse();
  return pathIds.map((id) => ({ coords: graph.nodes.get(id)!, level: id.substring(0, 18) }));
}

type RoutePoints = Array<{ coords: LngLat; level: string }>;

/**
 * The two ways to make a trip that changes floors: by stairs and by elevator, each the shortest
 * route that stays off the other. An entry is null if that way has no route. For a trip that stays
 * on one floor both ways are the same route and `changesFloors` is false.
 */
export function findRouteOptions(
  geojson: GeoJsonInput,
  start: string | RoutePos | null,
  end: string | null,
): { stairs: RoutePoints | null; elevator: RoutePoints | null; changesFloors: boolean } {
  const valid = (r: RoutePoints) => (r.length > 0 && r[0].level !== "" ? r : null);
  const stairs = valid(findShortestPath(geojson, start, end, "elevator"));
  const elevator = valid(findShortestPath(geojson, start, end, "stairs"));
  const any = stairs ?? elevator;
  const changesFloors = any ? new Set(any.map((p) => p.level)).size > 1 : false;
  return { stairs, elevator, changesFloors };
}
