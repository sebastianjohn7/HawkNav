import type { VehiclePlot } from "./verizon";

function supabaseEnv(): { url: string; key: string } {
  const url = (
    process.env.SUPABASE_URL ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    ""
  ).replace(/\/$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  if (!url || !key) throw new Error("missing Supabase URL or key");
  return { url, key };
}

function headers(key: string, prefer?: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function currentUpdatedAt(shuttleId: string): Promise<string | null> {
  const { url, key } = supabaseEnv();
  const res = await fetch(
    `${url}/rest/v1/shuttle_positions?shuttle_id=eq.${encodeURIComponent(shuttleId)}&select=updated_at`,
    { headers: headers(key) },
  );
  if (!res.ok) throw new Error(`Supabase read ${res.status}`);
  const rows = (await res.json()) as Array<{ updated_at?: string }>;
  return rows[0]?.updated_at ?? null;
}

/** Replace the one row for this shuttle when Reveal has a newer plot. */
export async function upsertShuttlePosition(
  shuttleId: string,
  plot: VehiclePlot,
): Promise<"wrote" | "unchanged"> {
  const previous = await currentUpdatedAt(shuttleId);
  if (previous && Date.parse(previous) >= Date.parse(plot.updatedAt)) {
    return "unchanged";
  }

  const { url, key } = supabaseEnv();
  const row: Record<string, unknown> = {
    shuttle_id: shuttleId,
    lat: plot.lat,
    lng: plot.lng,
    updated_at: plot.updatedAt,
  };
  if (plot.heading != null) row.heading = plot.heading;

  const res = await fetch(
    `${url}/rest/v1/shuttle_positions?on_conflict=shuttle_id`,
    {
      method: "POST",
      headers: headers(key, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(row),
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Supabase upsert ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return "wrote";
}
