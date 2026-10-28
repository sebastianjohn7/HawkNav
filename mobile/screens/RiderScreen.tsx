import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

type Props = {
  /** Keeps the ETA card above the tab bar. */
  sheetBottom: number;
  /** Highlights the chosen stop pin on the map. */
  onSelectedStop?: (stopId: string | null) => void;
  /** Move the map to this stop. Called only when the rider taps a row. */
  onFocusStop?: (stopId: string) => void;
  /** Share of the screen the open sidebar covers, so the pin stays visible. */
  onCoverFraction?: (fraction: number) => void;
};

export function RiderScreen({
  sheetBottom,
  onSelectedStop,
  onFocusStop,
  onCoverFraction,
}: Props) {
  const [position, setPosition] = useState<Position | null>(null);
  const [rtStatus, setRtStatus] = useState("Not connected");
  const [stops, setStops] = useState<Stop[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [stopsOpen, setStopsOpen] = useState(false);
  const [etaText, setEtaText] = useState<string>("");
  const frameWidth = useRef(0);
  const panelWidth = useRef(0);

  function reportCover() {
    if (frameWidth.current <= 0 || panelWidth.current <= 0) return;
    onCoverFraction?.(panelWidth.current / frameWidth.current);
  }

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

  useEffect(() => {
    onSelectedStop?.(selected);
  }, [selected, onSelectedStop]);

  const selectedStop = stops.find((stop) => stop.stop_id === selected);

  return (
    <View
      style={styles.overlay}
      pointerEvents="box-none"
      onLayout={(event) => {
        frameWidth.current = event.nativeEvent.layout.width;
        reportCover();
      }}
    >
      {!stopsOpen && (
        <Pressable style={styles.handle} onPress={() => setStopsOpen(true)}>
          <Ionicons name="list" size={18} color="#1565C0" />
          <Text style={styles.handleText}>Stops</Text>
        </Pressable>
      )}

      <View style={[styles.card, { bottom: sheetBottom }]}>
        {!hasSupabaseConfig && (
          <Text style={styles.warn}>
            Live GPS needs Supabase. Schedule ETA still works via the local API.
          </Text>
        )}
        <Text style={styles.meta}>Realtime: {rtStatus}</Text>
        {position ? (
          <Text style={styles.meta}>Updated: {position.updated_at}</Text>
        ) : (
          <Text style={styles.meta}>Waiting for driver check-in on map…</Text>
        )}
        <Text style={styles.eta}>
          {etaText || selectedStop?.name || "Open Stops to pick a stop"}
        </Text>
      </View>

      {stopsOpen && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setStopsOpen(false)}
          />
          <View
            style={[styles.sidebar, { bottom: sheetBottom }]}
            onLayout={(event) => {
              panelWidth.current = event.nativeEvent.layout.width;
              reportCover();
            }}
          >
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>Stops</Text>
              <Pressable
                onPress={() => setStopsOpen(false)}
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={22} color="#1565C0" />
              </Pressable>
            </View>
            <FlatList
              data={stops}
              keyExtractor={(item) => item.stop_id}
              style={styles.list}
              renderItem={({ item }) => {
                const on = selected === item.stop_id;
                return (
                  <Pressable
                    style={[styles.row, on && styles.rowSelected]}
                    onPress={() => {
                      setSelected(item.stop_id);
                      onFocusStop?.(item.stop_id);
                    }}
                  >
                    <Text style={styles.rowText}>{item.name}</Text>
                    {on && (
                      <Ionicons name="checkmark" size={18} color="#0B6E4F" />
                    )}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill },
  handle: {
    position: "absolute",
    left: 0,
    top: "38%",
    backgroundColor: "#fff",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  handleText: {
    color: "#1565C0",
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  meta: { fontSize: 14, color: "#333" },
  warn: { color: "#8a4b08", backgroundColor: "#fff4e5", padding: 10 },
  eta: { fontSize: 15, fontWeight: "600" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "62%",
    backgroundColor: "#fff",
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    overflow: "hidden",
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  sidebarTitle: { fontSize: 18, fontWeight: "700" },
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  rowText: { flex: 1, paddingRight: 8 },
  rowSelected: { backgroundColor: "#e8f5ef" },
});
