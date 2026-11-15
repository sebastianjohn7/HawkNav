// Join the Delta floor plan's wall, door and window lines into long polylines so the map draws far
// fewer overlays (react-native-maps makes one native overlay per line).
//
//   node mobile/scripts/merge_wall_lines.mjs [floorplan.json] [out.json]
//
// Defaults: mobile/assets/maps/delta_floorplan_copy.json -> mobile/assets/maps/delta_walls.json.
// Only the line features are touched: pieces that meet end to end are chained into one polyline.
// Every original segment is kept exactly; the script checks that before it writes anything.
// Re-run it (and commit the result) whenever the floor plan file changes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] ?? path.join(here, "../assets/maps/delta_floorplan_copy.json");
const output = process.argv[3] ?? path.join(here, "../assets/maps/delta_walls.json");

const plan = JSON.parse(fs.readFileSync(input, "utf8"));
const key = (c) => `${c[0]},${c[1]}`; // exact coordinates: pieces only join where they truly touch

/** Chain pieces that share end points into as few polylines as possible (greedy). */
function chain(pieces) {
  const ends = new Map(); // end point -> indexes of pieces that start or end there
  pieces.forEach((p, i) => {
    for (const c of [p[0], p[p.length - 1]]) {
      const k = key(c);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(i);
    }
  });
  const used = new Array(pieces.length).fill(false);
  /** Next unused piece touching `point`, as coordinates starting at `point`; marks it used. */
  const take = (point) => {
    for (const i of ends.get(key(point)) ?? []) {
      if (used[i]) continue;
      used[i] = true;
      const p = pieces[i];
      return key(p[0]) === key(point) ? p : [...p].reverse();
    }
    return null;
  };
  const out = [];
  for (let i = 0; i < pieces.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let line = [...pieces[i]];
    // grow the end, then the start (by reversing, growing the end again, and reversing back)
    for (let side = 0; side < 2; side++) {
      for (let next = take(line[line.length - 1]); next; next = take(line[line.length - 1])) {
        line = line.concat(next.slice(1));
      }
      line.reverse();
    }
    out.push(line);
  }
  return out;
}

/** Every segment of a set of polylines, as sorted "a|b" strings, for checking nothing was lost. */
function segments(lines) {
  const s = [];
  for (const l of lines) for (let i = 1; i < l.length; i++) s.push([key(l[i - 1]), key(l[i])].sort().join("|"));
  return s.sort();
}

const result = {};
const levels = [...new Set(plan.features.map((f) => f.properties?.LEVEL_ID).filter(Boolean))].sort();
for (const level of levels) {
  // the same features the map draws as walls: every line that is not a hallway
  const pieces = [];
  for (const f of plan.features) {
    if (f.properties?.LEVEL_ID !== level || f.properties?.USE_TYPE === "HALLWAY") continue;
    if (f.geometry?.type === "LineString") pieces.push(f.geometry.coordinates);
    else if (f.geometry?.type === "MultiLineString") pieces.push(...f.geometry.coordinates);
  }
  if (pieces.length === 0) continue;
  const lines = chain(pieces);
  const before = segments(pieces);
  const after = segments(lines);
  if (before.length !== after.length || before.some((s, i) => s !== after[i])) {
    throw new Error(`${level}: merged lines do not contain exactly the original segments`);
  }
  console.log(`${level}: ${pieces.length} lines -> ${lines.length} (${before.length} segments kept)`);
  result[level] = {
    type: "FeatureCollection",
    features: lines.map((coordinates) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    })),
  };
}
fs.writeFileSync(output, JSON.stringify(result) + "\n");
console.log(`wrote ${path.relative(process.cwd(), output)} (${(fs.statSync(output).size / 1024).toFixed(0)} KB)`);
