import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  apiUrl,
  DEFAULT_SHUTTLE_ID,
  hasSupabaseConfig,
  supabase,
} from "../lib/config";

type Stop = {
  stop_id: string;
  name: string;
};

type Position = {
  lat: number;
  lng: number;
  heading: number | null;
  updated_at: string;
};

type EtaResponse = {
  stop_id: string;
  stop_name: string;
  eta: {
    next_time: string;
    day_group: string;
    route: string;
  } | null;
};

export function RiderScreen() {
  const [position, setPosition] = useState<Position | null>(null);
  const [rtStatus, setRtStatus] = useState("Not connected");
  const [stops, setStops] = useState<Stop[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [etaText, setEtaText] = useState<string>("");

  useEffect(() => {
    fetch(`${apiUrl}/stops`)
      .then((r) => r.json())
      .then((body) => {
        const list = (body.stops as Stop[]) ?? [];
        setStops(list);
        if (list[0]) setSelected(list[0].stop_id);
      })
      .catch((e) => setEtaText(`API error: ${String(e)}`));
  }, []);

  useEffect(() => {
    if (!supabase) {
      setRtStatus("Waiting for Supabase keys (Phase 1B)");
      return;
    }
    const client = supabase;

    client
      .from("shuttle_positions")
      .select("lat,lng,heading,updated_at")
      .eq("shuttle_id", DEFAULT_SHUTTLE_ID)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setRtStatus(error.message);
        else if (data) setPosition(data as Position);
      });

    const channel = client
      .channel("shuttle_positions_rider")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shuttle_positions",
          filter: `shuttle_id=eq.${DEFAULT_SHUTTLE_ID}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Position | undefined;
          if (row && "lat" in row) setPosition(row);
          setRtStatus("Live");
        },
      )
      .subscribe((status) => setRtStatus(String(status)));

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  const loadEta = useCallback(async (stopId: string) => {
    try {
      const res = await fetch(
        `${apiUrl}/eta?stop_id=${encodeURIComponent(stopId)}`,
      );
      const body = (await res.json()) as EtaResponse;
      if (!body.eta) {
        setEtaText(`${body.stop_name}: no more departures today`);
      } else {
        setEtaText(
          `${body.stop_name}: next ${body.eta.next_time} (${body.eta.route}, ${body.eta.day_group})`,
        );
      }
    } catch (e) {
      setEtaText(`ETA error: ${String(e)}`);
    }
  }, []);

  useEffect(() => {
    if (selected) void loadEta(selected);
  }, [selected, loadEta]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Rider</Text>
      {!hasSupabaseConfig && (
        <Text style={styles.warn}>
          Live GPS needs Supabase. Schedule ETA still works via the local API.
        </Text>
      )}
      <Text style={styles.meta}>Realtime: {rtStatus}</Text>
      {position ? (
        <Text style={styles.meta}>
          Shuttle: {position.lat.toFixed(5)}, {position.lng.toFixed(5)} heading=
          {position.heading?.toFixed?.(0) ?? position.heading ?? "—"}
          {"\n"}Updated: {position.updated_at}
        </Text>
      ) : (
        <Text style={styles.meta}>No position yet</Text>
      )}

      <Text style={styles.sub}>Pick a stop for schedule ETA</Text>
      <FlatList
        data={stops}
        keyExtractor={(item) => item.stop_id}
        style={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.row,
              selected === item.stop_id && styles.rowSelected,
            ]}
            onPress={() => setSelected(item.stop_id)}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />
      <Text style={styles.eta}>{etaText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, paddingTop: 48, gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { marginTop: 8, fontWeight: "600" },
  meta: { fontSize: 14, color: "#333" },
  warn: { color: "#8a4b08", backgroundColor: "#fff4e5", padding: 10 },
  list: { flexGrow: 0, maxHeight: 220 },
  row: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: "#eee" },
  rowSelected: { backgroundColor: "#e8f5ef" },
  eta: { marginTop: 8, fontSize: 15 },
});
