/** Build a tiny undirected graph from corridor LineStrings + room Points, then Dijkstra. */

//import { forkEvent } from "react-native/types_generated/Libraries/Animated/AnimatedExports";

export type LngLat = [number, number];

type Graph = {
  nodes: Map<string, LngLat>; // Used for Djikstra referencing
  edges: Map<string, Array<{ to: string; weight: number }>>;
  roomToNode: Map<string, string>; // Used for User referencing
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

function addEdge(graph: Graph, a: string, b: string, weight: number) {
  if (!graph.edges.has(a)) graph.edges.set(a, []);
  if (!graph.edges.has(b)) graph.edges.set(b, []);
  graph.edges.get(a)!.push({ to: b, weight });
  graph.edges.get(b)!.push({ to: a, weight });
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
  };

  const hallwayPointsByLevel = new Map< string, Array<{ id: string; coord: LngLat }>>();
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
      const coords: LngLat = [rawCoords[0], rawCoords[1]];
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
        addEdge(graph, s[i].id, s[j].id, 15);
      }
    }
  }

  // Map same elevators between floors
  for(const [, e] of elevators){
    for(let i = 0 ; i < e.length ; i++){
      for(let j = i+1 ; j < e.length ; j++){
        addEdge(graph, e[i].id, e[j].id, 10);
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
  //console.log(`Confirming Edge Generations: \n${graph.edges.size}`);
  //console.log(graph.edges);
  return graph;
}

/** Shortest path as [lng, lat][] between room feature ids (e.g. room_d220 → room_d241). */
export function findShortestPath(
  geojson: Parameters<typeof buildGraphFromGeoJson>[0],
  startRoomId: string | null,
  endRoomId: string | null,
): LngLat[] {
  if(!startRoomId || !endRoomId) {
    console.log("Missing Routing Information");
    return [];
  }
  const graph = buildGraphFromGeoJson(geojson);
  const start = graph.roomToNode.get(startRoomId);
  const end = graph.roomToNode.get(endRoomId);
  console.log(`Start: ${start}, End: ${end}`);
  if (!start || !end) {
    !start ? console.log(`Starting Point is: ${start}`) : console.log(`Ending Point is: ${end}`);
    return [];
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

    for (const { to, weight } of graph.edges.get(u) ?? []) {
      if (!remaining.has(to)) continue;
      const alt = best + weight;
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt);
        prev.set(to, u);
      }
    }
  }

  if ((dist.get(end) ?? Infinity) === Infinity) {
    console.log("ERROR: Infinite distance");
    return [];
  }

  const pathIds: string[] = [];
  let cur: string | null = end;
  while (cur) {
    pathIds.push(cur);
    cur = prev.get(cur) ?? null;
  }
  pathIds.reverse();
  return pathIds.map((id) => graph.nodes.get(id)!);
}
