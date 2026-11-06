import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { PROVIDER_DEFAULT } from "react-native-maps";
import { apiUrl, supabase } from "../lib/config";
import { UHCL_REGION } from "../widgets/ShuttleMapView";

type ParkingMetric = {
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

export function ParkingCongestionScreen({
  sheetBottom,
}: {
  sheetBottom: number;
}) {
  const [lots, setLots] = useState<ParkingMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState("Connecting");

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/parking/metrics`);
      const responseText = await response.text();
      let body: {
        metrics?: ParkingMetric[];
        error?: string;
      };
      try {
        body = JSON.parse(responseText) as typeof body;
      } catch {
        const detail =
          response.status === 530
            ? "API tunnel is unavailable. Restart the API tunnel and reload the app."
            : `API returned a non-JSON response (HTTP ${response.status}). Check the API URL and server.`;
        throw new Error(detail);
      }
      if (!response.ok) {
        throw new Error(body.error ?? `Request failed (${response.status})`);
      }
      setLots(body.metrics ?? []);
    } catch (loadError) {
      setError(
        `Could not load parking metrics: ${
          loadError instanceof Error ? loadError.message : String(loadError)
        }`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    if (!supabase) {
      setRealtimeStatus("Manual refresh only");
      return;
    }

    const client = supabase;
    const channel = client
      .channel("parking_spot_updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_spot_updates",
        },
        () => {
          void loadMetrics();
        },
      )
      .subscribe((status) => setRealtimeStatus(String(status)));

    return () => {
      void client.removeChannel(channel);
    };
  }, [loadMetrics]);

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.title}>Parking congestion</Text>
        <Text style={styles.subtitle}>UHCL campus parking</Text>
      </View>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={UHCL_REGION}
        mapType="standard"
      />
      <View style={[styles.panel, { bottom: sheetBottom + 12 }]}>
        <Text style={styles.panelTitle}>Parking availability</Text>
        <View style={styles.statusRow}>
          <Text style={styles.status}>Realtime: {realtimeStatus}</Text>
          <Pressable
            onPress={() => void loadMetrics()}
            accessibilityRole="button"
            disabled={loading}
          >
            <Text style={styles.retry}>Refresh</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator accessibilityLabel="Loading parking metrics" />
        ) : error ? (
          <View style={styles.messageRow}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => void loadMetrics()} accessibilityRole="button">
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          </View>
        ) : lots.length === 0 ? (
          <Text style={styles.note}>No parking lots are available.</Text>
        ) : (
          lots.map((lot) => {
            const name = lot.unofficial_name || lot.uhcl_name;
            const updated = lot.latest_updated_at
              ? `Updated ${new Date(lot.latest_updated_at).toLocaleTimeString()}`
              : "Waiting for spot updates";

            return (
              <View
                key={`${lot.parking_lot_id}-${lot.spot_type}`}
                style={styles.lotRow}
              >
                <View style={styles.lotInfo}>
                  <Text style={styles.lotName}>
                    {name} · {lot.spot_type}
                  </Text>
                  <Text style={styles.lotDetail}>
                    {lot.uhcl_name} · {lot.building}
                  </Text>
                  <Text style={styles.lotDetail}>
                    {lot.number_available} available of {lot.total_number} ·{" "}
                    {(lot.percentage * 100).toFixed(1)}%
                  </Text>
                </View>
                <Text style={styles.updated}>{updated}</Text>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f5f5f5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
    gap: 4,
  },
  title: { fontWeight: "700" },
  subtitle: { fontSize: 12, color: "#555" },
  map: { flex: 1 },
  panel: {
    position: "absolute",
    left: 12,
    right: 12,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    gap: 8,
  },
  panelTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  status: { fontSize: 13, fontWeight: "600", color: "#555" },
  lotRow: {
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
    gap: 2,
  },
  lotInfo: { gap: 2 },
  lotName: { fontSize: 14, fontWeight: "600", color: "#111" },
  lotDetail: { fontSize: 12, color: "#555" },
  updated: { fontSize: 11, color: "#666" },
  note: { fontSize: 12, color: "#666" },
  messageRow: { gap: 6 },
  error: { fontSize: 12, color: "#9B1C1C" },
  retry: { fontSize: 13, color: "#1565C0", fontWeight: "700" },
});
