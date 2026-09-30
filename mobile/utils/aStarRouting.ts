/** Build a tiny undirected graph from corridor LineStrings + room Points, then Dijkstra. */

export type LngLat = [number, number];

type Graph = {
  nodes: Map<string, LngLat>;
  edges: Map<string, Array<{ to: string; weight: number }>>;
  roomToNode: Map<string, string>;
};

function keyOf(c: LngLat): string {
  return `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
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

  for (const f of geojson.features) {
    if (f.geometry.type === "LineString") {
      const coords = f.geometry.coordinates as LngLat[];
      for (const c of coords) {
        const id = keyOf(c);
        graph.nodes.set(id, c);
      }
      for (let i = 0; i < coords.length - 1; i++) {
        const a = keyOf(coords[i]);
        const b = keyOf(coords[i + 1]);
        addEdge(graph, a, b, haversineMeters(coords[i], coords[i + 1]));
      }
    }
  }

  for (const f of geojson.features) {
    if (f.geometry.type !== "Point") continue;
    const coords = f.geometry.coordinates as LngLat;
    const nodeId = keyOf(coords);
    graph.nodes.set(nodeId, coords);
    const roomId = String(f.properties?.id ?? "");
    if (roomId) graph.roomToNode.set(roomId, nodeId);
  }

  return graph;
}

/** Shortest path as [lng, lat][] between room feature ids (e.g. room_d220 → room_d241). */
export function findShortestPath(
  geojson: Parameters<typeof buildGraphFromGeoJson>[0],
  startRoomId: string,
  endRoomId: string,
): LngLat[] {
  const graph = buildGraphFromGeoJson(geojson);
  const start = graph.roomToNode.get(startRoomId);
  const end = graph.roomToNode.get(endRoomId);
  if (!start || !end) return [];

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

  if ((dist.get(end) ?? Infinity) === Infinity) return [];

  const pathIds: string[] = [];
  let cur: string | null = end;
  while (cur) {
    pathIds.push(cur);
    cur = prev.get(cur) ?? null;
  }
  pathIds.reverse();
  return pathIds.map((id) => graph.nodes.get(id)!);
}
