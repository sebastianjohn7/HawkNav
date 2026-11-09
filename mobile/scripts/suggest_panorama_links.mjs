// Write suggested `links` into panorama_nodes.json from the photo positions and directions.
//
//   node mobile/scripts/suggest_panorama_links.mjs [--floor 2] [--force]
//
// A visitor walks the building photo by photo, so a hallway photo only links to the next photo
// each way along the corridor plus the rooms beside it, and a room photo only links to its
// hallway photo. WALK below is that graph; edit it when photos are added.
//
// The marker's yaw is the compass bearing from this photo to the next, plus this photo's
// northOffset. Positions are only within a few metres, so the yaw is a first guess: check it in
// the calibrate demo (EXPO_PUBLIC_PANORAMA_DEMO=1) and nudge any marker that is off the doorway
// or corridor. Existing links are never touched: only missing ones are added. --force rebuilds all.
// WARNING: --force replaces every link, including markers you placed by hand in the demo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const nodesPath = path.join(here, '../assets/panoramas/panorama_nodes.json');
const args = process.argv.slice(2);
const force = args.includes('--force');
const floor = Number(args[args.indexOf('--floor') + 1] || 2);

// Corridor order (each pair is two-way) and which hallway photo(s) each room photo opens onto.
const WALK = {
  2: {
    corridors: [
      ['d204', 'd203', 'd202', 'd201', 'stairs-center', 'elevator', 'd249', 'd247', 'd237', 'd242'],
      ['d249', 'restrooms', 'd219', 'd225', 'd229', 'd235'],
      ['d202', 'd208'],
      ['d204', 'conf-1ab'],
      ['d208', 'conf-1ab'],
    ],
    rooms: {
      'room-d201': 'd201',
      'room-d214': 'd201',
      'room-d203': 'd203',
      'room-d234': 'd242',
      'room-d236': ['d242', 'd235'], // a loop: 235 -> 236 -> 242 hallway
      'room-d241': 'd242',
      'room-d242': 'd242',
    },
  },
};

WALK[1] = {
  // Floor 1 has no room photos: two loops off the central hallway.
  // Top of the plan is the Main Entrance end. Engineering loop (west): main-entrance -> engineer-1 ... engineer-6 -> main-hallway-2.
  // Science loop (east): main-entrance -> science-8 ... science-1 -> main-hallway-2; science-9 is the vending area (a dead end off science-8).
  corridors: [
    ['main-entrance', 'main-hallway', 'main-hallway-2', 'second-entrance'],
    ['main-entrance', 'engineer-1', 'engineer-2', 'engineer-3', 'engineer-4', 'engineer-5', 'engineer-6', 'main-hallway-2'],
    ['main-entrance', 'science-8', 'science-7', 'science-6', 'science-5', 'science-4', 'science-3', 'science-2', 'science-1', 'main-hallway-2'],
    ['science-8', 'science-9'],
  ],
  rooms: {},
};

const walk = WALK[floor];
if (!walk) throw new Error(`No WALK graph for floor ${floor} yet. Add one in this script.`);

const data = JSON.parse(fs.readFileSync(nodesPath, 'utf8'));
const byId = new Map(data.nodes.map((n) => [n.id, n]));
const full = (short) => `delta-l${floor}-${short}`;

function bearing(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const wanted = new Map(); // from short id -> Set of short ids
const add = (a, b) => {
  if (!wanted.has(a)) wanted.set(a, new Set());
  wanted.get(a).add(b);
};
for (const chain of walk.corridors) {
  for (let i = 0; i + 1 < chain.length; i++) {
    add(chain[i], chain[i + 1]);
    add(chain[i + 1], chain[i]);
  }
}
for (const [room, halls] of Object.entries(walk.rooms)) {
  for (const hall of [].concat(halls)) {
    add(room, hall);
    add(hall, room);
  }
}

let written = 0;
for (const [from, tos] of wanted) {
  const a = byId.get(full(from));
  if (!a) throw new Error(`Unknown photo ${full(from)}`);
  if (a.northOffset == null || a.lat == null) throw new Error(`${a.id} needs northOffset and lat/lng first`);
  const keep = force ? [] : (a.links ?? []);
  const added = [];
  for (const t of tos) {
    const b = byId.get(full(t));
    if (!b) throw new Error(`Unknown photo ${full(t)}`);
    if (keep.some((l) => l.to === b.id)) continue;
    added.push({ to: b.id, yaw: Math.round(wrap(bearing(a, b) + a.northOffset)), pitch: 0 });
  }
  a.links = [...keep, ...added];
  if (added.length) {
    written++;
    console.log(`${from.padEnd(14)} + ${added.map((l) => `${l.to.replace(`delta-l${floor}-`, '')} @${l.yaw}`).join(', ')}`);
  }
}

fs.writeFileSync(nodesPath, JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote links for ${written} photos on floor ${floor}`);
