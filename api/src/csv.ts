import { readFileSync } from "node:fs";
import { join } from "node:path";

export type DayGroup = "mon_thu" | "fri" | "sat";
export type RouteId = "off_campus" | "on_campus" | "pearland";

export type Meta = {
  term: string;
  updated_at: string;
  name: string;
  email: string;
};

export type Stop = {
  stop_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  routes: string[];
  status: string;
};

export type ScheduleRow = {
  day_group: DayGroup;
  stop_id: string;
  times: string[];
  route: RouteId;
};

export type ShuttleData = {
  meta: Meta;
  stops: Stop[];
  schedules: ScheduleRow[];
  errors: string[];
};

const DAY_GROUPS = new Set<DayGroup>(["mon_thu", "fri", "sat"]);
const ROUTES: RouteId[] = ["off_campus", "on_campus", "pearland"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function dataDir(): string {
  return process.env.SHUTTLE_DATA_DIR
    ? process.env.SHUTTLE_DATA_DIR
    : join(import.meta.dir, "../../data/shuttle");
}

/** Minimal CSV parse: handles quoted fields with commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]!] = (cells[j] ?? "").trim();
    }
    return obj;
  });
}

function parseOptionalNumber(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseTimes(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function loadShuttleData(dir = dataDir()): ShuttleData {
  const errors: string[] = [];
  const metaPath = join(dir, "meta.csv");
  const stopsPath = join(dir, "stops.csv");

  const metaRows = rowsToObjects(parseCsv(readFileSync(metaPath, "utf8")));
  if (metaRows.length === 0) {
    throw new Error(`meta.csv is empty: ${metaPath}`);
  }
  const metaRaw = metaRows[0]!;
  const meta: Meta = {
    term: metaRaw.term ?? "",
    updated_at: metaRaw.updated_at ?? "",
    name: metaRaw.name ?? "",
    email: metaRaw.email ?? "",
  };

  const stops: Stop[] = rowsToObjects(parseCsv(readFileSync(stopsPath, "utf8"))).map(
    (r) => ({
      stop_id: r.stop_id ?? "",
      name: r.name ?? "",
      lat: parseOptionalNumber(r.lat ?? ""),
      lng: parseOptionalNumber(r.lng ?? ""),
      routes: (r.routes ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      status: r.status ?? "",
    }),
  );

  const stopIds = new Set(stops.map((s) => s.stop_id));
  for (const s of stops) {
    if (!s.stop_id) errors.push("stops.csv: empty stop_id");
    if (s.status === "active" && (s.lat == null || s.lng == null)) {
      errors.push(`stops.csv: active stop ${s.stop_id} missing lat/lng`);
    }
  }

  const schedules: ScheduleRow[] = [];
  for (const route of ROUTES) {
    const path = join(dir, `${route}.csv`);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      errors.push(`missing schedule file: ${route}.csv`);
      continue;
    }
    for (const r of rowsToObjects(parseCsv(text))) {
      const day_group = r.day_group as DayGroup;
      const stop_id = r.stop_id ?? "";
      const times = parseTimes(r.times ?? "");

      if (!DAY_GROUPS.has(day_group)) {
        errors.push(`${route}.csv: invalid day_group "${r.day_group}" for ${stop_id}`);
      }
      if (!stopIds.has(stop_id)) {
        errors.push(`${route}.csv: unknown stop_id "${stop_id}"`);
      }
      for (const t of times) {
        if (t !== "DROP_OFF" && !TIME_RE.test(t)) {
          errors.push(`${route}.csv: bad time "${t}" for ${stop_id}`);
        }
      }

      schedules.push({ day_group, stop_id, times, route });
    }
  }

  return { meta, stops, schedules, errors };
}

/** Map JS weekday (0=Sun) in America/Chicago to schedule day_group. */
export function dayGroupForNow(now = new Date()): DayGroup | null {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(now);
  switch (weekday) {
    case "Mon":
    case "Tue":
    case "Wed":
    case "Thu":
      return "mon_thu";
    case "Fri":
      return "fri";
    case "Sat":
      return "sat";
    default:
      return null; // Sunday — no service in CSVs
  }
}

export function chicagoHHMM(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

export function nextDeparture(
  data: ShuttleData,
  stopId: string,
  now = new Date(),
): {
  stop_id: string;
  next_time: string;
  day_group: DayGroup;
  route: RouteId;
} | null {
  const day_group = dayGroupForNow(now);
  if (!day_group) return null;

  const nowHM = chicagoHHMM(now);
  const rows = data.schedules.filter(
    (r) => r.stop_id === stopId && r.day_group === day_group,
  );
  let best: { next_time: string; route: RouteId } | null = null;

  for (const row of rows) {
    for (const t of row.times) {
      if (t === "DROP_OFF") continue;
      if (t <= nowHM) continue;
      if (!best || t < best.next_time) {
        best = { next_time: t, route: row.route };
      }
    }
  }

  if (!best) return null;
  return {
    stop_id: stopId,
    next_time: best.next_time,
    day_group,
    route: best.route,
  };
}
