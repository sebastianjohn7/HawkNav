// Check the photo-to-photo links in panorama_nodes.json.
//
//   node mobile/scripts/check_panorama_links.mjs [--floor 2]
//
// Fails (exit 1) when a link points at a missing photo, crosses floors without a label, is one-way, when a room
// photo links anywhere except hallway photos, or when a photo cannot be reached from the others.
// Without chips in the viewer, links are the only way between photos, so every photo must be
// reachable. Photos on floors with no links yet are only reported.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(here, '../assets/panoramas/panorama_nodes.json'), 'utf8'));
const args = process.argv.slice(2);
const only = args.includes('--floor') ? Number(args[args.indexOf('--floor') + 1]) : null;

const nodes = data.nodes.filter((n) => only == null || n.floor === only);
const byId = new Map(data.nodes.map((n) => [n.id, n]));
const isRoom = (n) => n.id.includes('-room-');
const problems = [];

for (const n of nodes) {
  for (const l of n.links ?? []) {
    const t = byId.get(l.to);
    if (!t) { problems.push(`${n.id} -> ${l.to}: no such photo`); continue; }
    if (t.floor !== n.floor && !l.label) problems.push(`${n.id} -> ${l.to}: different floor but no label (stairs/elevator links need one)`);
    if (!(t.links ?? []).some((x) => x.to === n.id)) problems.push(`${n.id} -> ${l.to}: one-way (no link back)`);
    if (isRoom(n) && isRoom(t)) problems.push(`${n.id} -> ${l.to}: a room photo may only link to hallway photos`);
    if (typeof l.yaw !== 'number') problems.push(`${n.id} -> ${l.to}: missing yaw`);
  }
}

// Reachability from the first photo of each floor that has links.
for (const floor of [...new Set(nodes.map((n) => n.floor))]) {
  const onFloor = nodes.filter((n) => n.floor === floor);
  if (!onFloor.some((n) => n.links?.length)) { console.log(`floor ${floor}: no links yet (${onFloor.length} photos)`); continue; }
  const start = onFloor.find((n) => n.links?.length);
  const seen = new Set([start.id]);
  const queue = [start.id];
  while (queue.length) {
    for (const l of byId.get(queue.shift()).links ?? []) if (!seen.has(l.to)) { seen.add(l.to); queue.push(l.to); }
  }
  const lost = onFloor.filter((n) => !seen.has(n.id)).map((n) => n.id);
  if (lost.length) problems.push(`floor ${floor}: cannot reach ${lost.join(', ')}`);
  else console.log(`floor ${floor}: all ${onFloor.length} photos reachable, ${onFloor.reduce((s, n) => s + (n.links?.length ?? 0), 0)} links`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('links OK');
