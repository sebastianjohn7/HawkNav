/**
 * Verizon Connect Reveal location polls.
 * The token call uses HTTP Basic (base64 of username:password).
 * Location calls send that token plus the app id. Nothing here runs
 * until a driver checks in.
 */

const TOKEN_URL = "https://fim.api.us.fleetmatics.com/token";
const LOCATION_URL = "https://fim.api.us.fleetmatics.com/rad/v1/vehicles";
const TOKEN_TTL_MS = 20 * 60 * 1000;
const REFRESH_EARLY_MS = 2 * 60 * 1000;

function tokenExpiresAt(token: string): number {
  const payload = token.split(".")[1];
  if (!payload) return Date.now() + TOKEN_TTL_MS;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof json.exp === "number") return json.exp * 1000;
  } catch {
    // Fall back to the published lifetime when the body is not a JWT.
  }
  return Date.now() + TOKEN_TTL_MS;
}

export type ShuttleConfig = {
  id: string;
  name: string;
  vehicleNumber: string;
};

export type VehiclePlot = {
  lat: number;
  lng: number;
  /** Set only while Reveal says the vehicle is moving. */
  heading: number | null;
  updatedAt: string;
};

type TokenCache = { value: string; expiresAt: number };

let tokenCache: TokenCache | null = null;

export function loadShuttleConfigs(
  raw = process.env.VERIZON_VEHICLE_MAP ?? "",
): ShuttleConfig[] {
  const text = raw.trim().replace(/^"|"$/g, "");
  if (!text) return [];
  const shuttles: ShuttleConfig[] = [];
  for (const part of text.split(",")) {
    const [id, name, vehicleNumber] = part.split("|").map((s) => s.trim());
    if (!id || !name || !vehicleNumber) continue;
    shuttles.push({ id, name, vehicleNumber });
  }
  return shuttles;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function basicAuthHeader(): string {
  const username = requireEnv("VERIZON_USERNAME");
  const password = requireEnv("VERIZON_PASSWORD");
  const encoded = Buffer.from(`${username}:${password}`, "utf8").toString(
    "base64",
  );
  return `Basic ${encoded}`;
}

/** App id from Reveal already includes the fleetmatics-p-us- prefix. */
function atmosphereHeader(token: string): string {
  const appId = requireEnv("VERIZON_APP_ID");
  return `Atmosphere atmosphere_app_id=${appId}, Bearer ${token}`;
}

export async function revealToken(force = false): Promise<string> {
  if (!force && tokenCache && Date.now() < tokenCache.expiresAt - REFRESH_EARLY_MS) {
    return tokenCache.value;
  }
  const res = await fetch(TOKEN_URL, {
    headers: { Authorization: basicAuthHeader(), Accept: "text/plain" },
  });
  const body = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(`Verizon token ${res.status}`);
  }
  const value = body.startsWith("{")
    ? String(JSON.parse(body).token ?? JSON.parse(body).Token ?? "")
    : body;
  if (!value) throw new Error("Verizon token response was empty");
  tokenCache = { value, expiresAt: tokenExpiresAt(value) };
  return value;
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseUpdateUtc(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const text = raw.trim();
  const withZone = /(?:z|[+-]\d\d:?\d\d)$/i.test(text) ? text : `${text}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body)) return asRecord(body[0]);
  const record = body as Record<string, unknown>;
  const nested = record.ContentResource ?? record.contentResource;
  if (nested && typeof nested === "object") {
    const content = nested as Record<string, unknown>;
    const value = content.Value ?? content.value;
    if (value && typeof value === "object") return value as Record<string, unknown>;
    return content;
  }
  return record;
}

/** Latest plot, or null when Reveal has no public coordinates. */
export function readPlot(body: unknown): VehiclePlot | null {
  const plot = asRecord(body);
  if (!plot) return null;
  if (plot.IsPrivate === true || plot.isPrivate === true) return null;
  const lat = num(plot.Latitude ?? plot.latitude);
  const lng = num(plot.Longitude ?? plot.longitude);
  if (lat == null || lng == null) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const updatedAt = parseUpdateUtc(plot.UpdateUTC ?? plot.updateUtc);
  if (!updatedAt) return null;
  const state = String(plot.DisplayState ?? plot.displayState ?? "")
    .trim()
    .toLowerCase();
  const direction = num(plot.Direction ?? plot.direction);
  const heading = state === "moving" && direction != null ? direction : null;
  return { lat, lng, heading, updatedAt };
}

export async function fetchVehicleLocation(
  vehicleNumber: string,
): Promise<{ status: number; plot: VehiclePlot | null }> {
  const path = `${LOCATION_URL}/${encodeURIComponent(vehicleNumber)}/location`;
  const load = async (forceToken: boolean) => {
    const token = await revealToken(forceToken);
    return fetch(path, {
      headers: {
        Accept: "application/json",
        Authorization: atmosphereHeader(token),
      },
    });
  };

  let res = await load(false);
  if (res.status === 401) res = await load(true);
  if (res.status === 204 || res.status === 400 || res.status === 404) {
    return { status: res.status, plot: null };
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Verizon location ${res.status}`);
  }
  const body = text ? JSON.parse(text) : null;
  return { status: res.status, plot: readPlot(body) };
}
