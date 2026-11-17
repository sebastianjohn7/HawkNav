import { upsertShuttlePosition } from "./positions";
import {
  fetchVehicleLocation,
  loadShuttleConfigs,
  type ShuttleConfig,
  type VehiclePlot,
} from "./verizon";

const POLL_MS = 100;

type Poll = {
  timer: ReturnType<typeof setInterval>;
};

type PollState = Map<string, Poll>;

const globalPolls = globalThis as typeof globalThis & {
  __hawknavShuttlePolls?: PollState;
};

// A server restart, including hot reload, drops in-memory check-ins.
if (globalPolls.__hawknavShuttlePolls) {
  for (const poll of globalPolls.__hawknavShuttlePolls.values()) {
    clearInterval(poll.timer);
  }
}
const polls: PollState = new Map();
globalPolls.__hawknavShuttlePolls = polls;

export type CheckinResult = {
  shuttle_id: string;
  name: string;
  polling: boolean;
  wrote: boolean;
  position: {
    lat: number;
    lng: number;
    heading: number | null;
    updated_at: string;
  } | null;
  note: string | null;
};

function configs(): ShuttleConfig[] {
  return loadShuttleConfigs();
}

export function listShuttles(): Array<{
  id: string;
  name: string;
  polling: boolean;
}> {
  return configs().map((shuttle) => ({
    id: shuttle.id,
    name: shuttle.name,
    polling: polls.has(shuttle.id),
  }));
}

function findShuttle(shuttleId: string): ShuttleConfig | undefined {
  return configs().find((shuttle) => shuttle.id === shuttleId);
}

async function pollShuttle(shuttle: ShuttleConfig): Promise<CheckinResult> {
  const { status, plot } = await fetchVehicleLocation(shuttle.vehicleNumber);
  if (status === 400 || status === 404) {
    stopShuttle(shuttle.id);
    throw new Error("Reveal could not find that vehicle");
  }
  const wrote = plot ? (await upsertShuttlePosition(shuttle.id, plot)) === "wrote" : false;
  return {
    shuttle_id: shuttle.id,
    name: shuttle.name,
    polling: polls.has(shuttle.id),
    wrote,
    position: plot ? toPosition(plot) : null,
    note: plot ? null : "No public GPS plot yet",
  };
}

function toPosition(plot: VehiclePlot): CheckinResult["position"] {
  return {
    lat: plot.lat,
    lng: plot.lng,
    heading: plot.heading,
    updated_at: plot.updatedAt,
  };
}

function stopShuttle(shuttleId: string) {
  const poll = polls.get(shuttleId);
  if (!poll) return;
  clearInterval(poll.timer);
  polls.delete(shuttleId);
}

export async function checkIn(shuttleId: string): Promise<CheckinResult> {
  const shuttle = findShuttle(shuttleId);
  if (!shuttle) throw new Error(`unknown shuttle_id ${shuttleId}`);
  if (!polls.has(shuttle.id)) {
    const timer = setInterval(() => {
      void pollShuttle(shuttle).catch((err) => {
        console.error(`shuttle poll ${shuttle.id}:`, err instanceof Error ? err.message : err);
      });
    }, POLL_MS);
    polls.set(shuttle.id, { timer });
  }
  try {
    const result = await pollShuttle(shuttle);
    result.polling = true;
    return result;
  } catch (err) {
    stopShuttle(shuttle.id);
    throw err;
  }
}

export function checkOut(shuttleId: string): { shuttle_id: string; polling: false } {
  if (!findShuttle(shuttleId)) throw new Error(`unknown shuttle_id ${shuttleId}`);
  stopShuttle(shuttleId);
  return { shuttle_id: shuttleId, polling: false };
}
