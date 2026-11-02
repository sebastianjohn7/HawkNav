import { Hono } from "hono";
import { cors } from "hono/cors";
import { checkIn, checkOut, listShuttles } from "./checkins";
import {
  dayGroupForNow,
  isDropOffOnly,
  loadShuttleData,
  nextDeparture,
  type RouteId,
} from "./csv";

const app = new Hono();
app.use("*", cors());

function data() {
  return loadShuttleData();
}

app.get("/health", (c) => {
  const d = data();
  return c.json({
    ok: true,
    term: d.meta.term,
    updated_at: d.meta.updated_at,
    validation_errors: d.errors,
    day_group_today: dayGroupForNow(),
  });
});

app.get("/stops", (c) => {
  const d = data();
  const route = c.req.query("route");
  const day_group = dayGroupForNow();
  // Stops the shuttle actually visits on today's Chicago day group.
  const todayStopIds = new Set(
    day_group
      ? d.schedules
          .filter((row) => row.day_group === day_group)
          .map((row) => row.stop_id)
      : [],
  );
  let stops = d.stops.filter((s) => s.status === "active");
  if (route) {
    stops = stops.filter((s) => s.routes.includes(route));
  }
  return c.json({
    stops: stops.map((stop) => ({
      ...stop,
      runs_today: todayStopIds.has(stop.stop_id),
    })),
    day_group_today: day_group,
    meta: d.meta,
  });
});

app.get("/schedules", (c) => {
  const d = data();
  const route = c.req.query("route") as RouteId | undefined;
  const day_group = c.req.query("day_group");

  if (!route || !["off_campus", "on_campus", "pearland"].includes(route)) {
    return c.json(
      { error: "query route=off_campus|on_campus|pearland is required" },
      400,
    );
  }

  let rows = d.schedules.filter((r) => r.route === route);
  if (day_group) {
    rows = rows.filter((r) => r.day_group === day_group);
  }

  return c.json({
    route,
    day_group: day_group ?? null,
    rows: rows.map(({ day_group, stop_id, times }) => ({
      day_group,
      stop_id,
      times,
    })),
    meta: d.meta,
  });
});

app.get("/shuttles", (c) => {
  return c.json({ shuttles: listShuttles() });
});

app.post("/shuttles/checkin", async (c) => {
  const body = await c.req.json().catch(() => null);
  const shuttleId =
    body && typeof body.shuttle_id === "string" ? body.shuttle_id : "";
  if (!shuttleId) return c.json({ error: "shuttle_id is required" }, 400);
  try {
    return c.json(await checkIn(shuttleId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "check-in failed";
    const status = message.startsWith("unknown shuttle_id") ? 404 : 502;
    return c.json({ error: message }, status);
  }
});

app.post("/shuttles/checkout", async (c) => {
  const body = await c.req.json().catch(() => null);
  const shuttleId =
    body && typeof body.shuttle_id === "string" ? body.shuttle_id : "";
  if (!shuttleId) return c.json({ error: "shuttle_id is required" }, 400);
  try {
    return c.json(checkOut(shuttleId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "check-out failed";
    return c.json({ error: message }, 404);
  }
});

app.get("/eta", (c) => {
  const stop_id = c.req.query("stop_id");
  if (!stop_id) {
    return c.json({ error: "query stop_id is required" }, 400);
  }
  const d = data();
  const stop = d.stops.find((s) => s.stop_id === stop_id);
  if (!stop) {
    return c.json({ error: `unknown stop_id: ${stop_id}` }, 404);
  }
  const drop_off_only = isDropOffOnly(d, stop_id);
  const eta = drop_off_only ? null : nextDeparture(d, stop_id);
  return c.json({
    stop_id,
    stop_name: stop.name,
    drop_off_only,
    eta,
    note: "Schedule next-departure from CSVs (America/Chicago); not GPS-based ETA",
  });
});

const port = Number(process.env.PORT ?? 8787);
console.log(`HawkNav API listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
