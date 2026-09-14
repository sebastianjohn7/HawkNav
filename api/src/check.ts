import { loadShuttleData } from "./csv";

const d = loadShuttleData();
if (d.errors.length) {
  console.error("Validation errors:");
  for (const e of d.errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `OK: ${d.stops.length} stops, ${d.schedules.length} schedule rows, term=${d.meta.term}`,
);
