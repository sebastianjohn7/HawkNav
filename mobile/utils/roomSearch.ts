/** Room list + search for the Delta map's destination box. */

import { EXCLUDED_UNITS } from "./excludedUnits.ts";

export type RoomOption = {
  /** The floor plan NAME: what routing uses ("201", "STAIR_1"). */
  name: string;
  /** NAME made readable ("STAIR 1"). */
  label: string;
  /** USE_TYPE made readable ("Office service"). */
  type: string;
  /** Floors the name appears on, e.g. "Level 2" or "Level 1 / 2" (stairs and elevators). */
  floors: string;
};

type GeoJsonInput = {
  features: Array<{
    properties?: Record<string, unknown> | null;
    geometry: { type: string };
  }>;
};

/** Floor plan names that read better in the search under another name. Routing still uses the real name. */
const DISPLAY_NAMES: Record<string, string> = {
  T1018: "Elevator", // Level 1
  T2007: "Elevator", // Level 2
};

function readable(s: string): string {
  const t = s.replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Natural order: 101, 104A, 119A, 201 ... then names that aren't numbered (stairs, elevators). */
function compareNames(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb || a.localeCompare(b);
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Every named room (Point feature) once, even when it shows up on several floors. */
export function buildRoomOptions(geojson: GeoJsonInput): RoomOption[] {
  const byName = new Map<string, { type: string; levels: Set<number> }>();
  for (const f of geojson.features) {
    if (f.geometry.type !== "Point") continue;
    const name = f.properties?.NAME ? String(f.properties.NAME) : "";
    if (!name || EXCLUDED_UNITS.has(name)) continue;
    const level = /\.L(\d+)$/.exec(String(f.properties?.LEVEL_ID ?? ""))?.[1];
    const entry = byName.get(name) ?? { type: String(f.properties?.USE_TYPE ?? ""), levels: new Set<number>() };
    if (level) entry.levels.add(Number(level));
    byName.set(name, entry);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => compareNames(a, b))
    .map(([name, { type, levels }]) => {
      const sorted = [...levels].sort((a, b) => a - b);
      return {
        name,
        // Rooms are numbered D101, D201, ...: show the D. Stairs and the like keep their names.
        label: DISPLAY_NAMES[name] ?? (name.includes("_") ? readable(name).toUpperCase() : /^\d/.test(name) ? `D${name}` : name),
        type: type ? readable(type) : "Room",
        floors: sorted.length > 1 ? `Levels ${sorted.join(" / ")}` : sorted.length === 1 ? `Level ${sorted[0]}` : "",
      };
    });
}

/** Rooms matching what was typed (with or without the D, so "201" and "D201" both work), best matches first: name starts with it, then name or type contains it. */
export function searchRooms(options: RoomOption[], query: string, limit = 30): RoomOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);
  const starts: RoomOption[] = [];
  const contains: RoomOption[] = [];
  for (const o of options) {
    const name = o.label.toLowerCase();
    if (name.startsWith(q) || o.name.toLowerCase().startsWith(q)) starts.push(o);
    else if (name.includes(q) || o.type.toLowerCase().includes(q)) contains.push(o);
  }
  return [...starts, ...contains].slice(0, limit);
}
