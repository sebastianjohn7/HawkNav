// Fill lat/lng in panorama_nodes.json from the indoor floor plan GeoJSON.
//
//   node mobile/scripts/fill_panorama_positions.mjs [floorplan.json] [--force]
//
// Each node's floorPlanRef lists unit NAMEs (rooms, stairs, elevators) on its level. The photo was
// taken in the hallway, so the units' centre is snapped to the nearest HALLWAY vertex, the same
// points the routing graph uses. Nodes that already have a position are left alone unless --force.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const force = args.includes('--force');
const floorPlanPath = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(here, '../assets/maps/delta_floorplan_copy.json'));
const nodesPath = path.join(here, '../assets/panoramas/panorama_nodes.json');

const floorPlan = JSON.parse(fs.readFileSync(floorPlanPath, 'utf8'));
const data = JSON.parse(fs.readFileSync(nodesPath, 'utf8'));

function metres([lng1, lat1], [lng2, lat2]) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

let filled = 0;
for (const node of data.nodes) {
  if (!force && node.lat != null && node.lng != null) continue;
  if (!node.floorPlanRef?.length) {
    console.warn(`${node.id}: no floorPlanRef, so set floorPlanRef (or lat/lng) in panorama_nodes.json by hand`);
    continue;
  }
  const levelId = `UHCL.MAIN.${node.building.toUpperCase()}.L${node.floor}`;
  const onLevel = floorPlan.features.filter((f) => f.properties?.LEVEL_ID === levelId && f.geometry.type === 'Point');
  // A ref with no unit of that exact name (door 119) falls back to its lettered units (119A, 119B, ...).
  const units = node.floorPlanRef.flatMap((ref) => {
    const exact = onLevel.filter((f) => f.properties.NAME === ref);
    return exact.length > 0 ? exact : onLevel.filter((f) => new RegExp(`^${ref}[A-Z]$`).test(f.properties.NAME ?? ''));
  });
  if (units.length === 0) {
    console.warn(`${node.id}: no unit named ${JSON.stringify(node.floorPlanRef)} on ${levelId}`);
    continue;
  }
  const centre = [
    units.reduce((s, f) => s + f.geometry.coordinates[0], 0) / units.length,
    units.reduce((s, f) => s + f.geometry.coordinates[1], 0) / units.length,
  ];
  // Photos taken inside a room (id contains -room-) sit at the room itself, not in the hallway.
  if (node.id.includes('-room-')) {
    node.lng = centre[0];
    node.lat = centre[1];
    node.positionSource = `centre of ${node.floorPlanRef.join('+')} in ${path.basename(floorPlanPath)}`;
    filled++;
    console.log(`${node.id.padEnd(24)} ${node.lat.toFixed(6)}, ${node.lng.toFixed(6)}  (inside room)`);
    continue;
  }
  let best = null;
  let bestDist = Infinity;
  for (const f of floorPlan.features) {
    if (f.properties?.USE_TYPE !== 'HALLWAY' || f.properties.LEVEL_ID !== levelId || f.geometry.type !== 'LineString') continue;
    for (const c of f.geometry.coordinates) {
      const d = metres(centre, c);
      if (d < bestDist) [best, bestDist] = [c, d];
    }
  }
  if (!best) {
    console.warn(`${node.id}: no hallway on ${levelId}`);
    continue;
  }
  node.lng = best[0];
  node.lat = best[1];
  node.positionSource = `nearest hallway vertex to ${node.floorPlanRef.join('+')} in ${path.basename(floorPlanPath)} (${bestDist.toFixed(1)} m away)`;
  filled++;
  console.log(`${node.id.padEnd(24)} ${node.lat.toFixed(6)}, ${node.lng.toFixed(6)}  (${bestDist.toFixed(1)} m from unit)`);
}

fs.writeFileSync(nodesPath, JSON.stringify(data, null, 2) + '\n');
console.log(`Filled ${filled} of ${data.nodes.length} nodes using ${path.basename(floorPlanPath)}`);
