/** Road-network ETA (no turn UI) via OSRM driving route. */

export type RouteEta = {
  distanceMeters: number;
  durationSeconds: number;
};

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** Straight-line fallback if routing is unreachable. */
export function fallbackRouteEta(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  mph = 12,
): RouteEta {
  const distanceMeters = haversineMeters(fromLat, fromLng, toLat, toLng);
  const durationSeconds = (distanceMeters / 1609.34 / mph) * 3600;
  return { distanceMeters, durationSeconds };
}

/**
 * Driving route distance + duration between two points.
 * Uses public OSRM — distance/time only, steps discarded.
 */
export async function fetchDrivingRouteEta(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  signal?: AbortSignal,
): Promise<RouteEta> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?overview=false&steps=false`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`route HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    code?: string;
    routes?: Array<{ distance: number; duration: number }>;
  };
  const route = body.routes?.[0];
  if (body.code !== "Ok" || !route) {
    throw new Error("no route");
  }
  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

export function formatRouteEtaLine(eta: RouteEta): string {
  const miles = eta.distanceMeters / 1609.34;
  if (miles < 0.04) return "Shuttle arriving";
  const minutes = Math.max(1, Math.round(eta.durationSeconds / 60));
  const dist =
    miles < 0.15
      ? `${Math.round(miles * 5280)} ft`
      : `${miles.toFixed(1)} mi`;
  return `Shuttle ~${minutes} min away (${dist})`;
}
