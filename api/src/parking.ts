export type ParkingMetric = {
  parking_lot_id: number;
  uhcl_name: string;
  unofficial_name: string;
  building: string;
  spot_type: "standard" | "handicap" | "EV";
  number_available: number;
  total_number: number;
  percentage: number;
  latest_updated_at: string | null;
};

function supabaseEnv(): { url: string; key: string } {
  const url = (
    process.env.SUPABASE_URL ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    ""
  ).replace(/\/$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  if (!url || !key) throw new Error("missing Supabase URL or key");
  return { url, key };
}

export async function loadParkingMetrics(): Promise<ParkingMetric[]> {
  const { url, key } = supabaseEnv();
  const res = await fetch(
    `${url}/rest/v1/parking_lot_metrics?select=parking_lot_id,uhcl_name,unofficial_name,building,spot_type,number_available,total_number,percentage,latest_updated_at&order=parking_lot_id.asc,spot_type.asc`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Supabase parking metrics read ${res.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return (await res.json()) as ParkingMetric[];
}
